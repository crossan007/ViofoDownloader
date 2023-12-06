import { filter, firstValueFrom, lastValueFrom, tap } from "rxjs";
import { Queue } from "../Queue";
import { ViofoCam, VIOFOVideoExtended } from "./Viofo";
import { getLogger } from "../logging";
import ProgressBar from "progress";
import { AciveDownload } from "./DashCam";
import { PriorityBucket } from "./PriorityBucket";
const log = getLogger("DownloadStrategy");

/**
 * Sorts newest videos first, then front camera videos first
 * @param a
 * @param b
 * @returns
 */
function NewestFrontCameraVideosFirst(
  a: VIOFOVideoExtended,
  b: VIOFOVideoExtended
): number {
  const dateA = a.StartDate.getTime();
  const dateB = b.StartDate.getTime();
  const frontA = a.Lens == "Front";
  const frontB = b.Lens == "Front";
  if (frontA && !frontB) {
    return -1;
  }
  if (!frontA && frontB) {
    return 1;
  }
  return dateA - dateB;
}

class DownloadError extends Error {}

export class DownloadStrategy {
  private concurrency: number = 1;
  private videoQueue = new Queue<VIOFOVideoExtended>();
  private currentDownloads: Record<string, AciveDownload<VIOFOVideoExtended>> =
    {};

  constructor(
    private camera: ViofoCam,
    private includeParking: boolean = false
  ) {}

  public getCurrentQueue(): Queue<VIOFOVideoExtended> {
    return this.videoQueue;
  }

  public getCurrentDownloads(): Record<
    string,
    AciveDownload<VIOFOVideoExtended>
  > {
    return this.currentDownloads;
  }

  private async updateQueue() {
    this.videoQueue.clear();
    const cameraLatency = await this.camera.getHeartbeat();
    if (cameraLatency > 200) {
      throw new DownloadError(`Camera latency high: ${cameraLatency} ms`);
    }
    const freeSpace = await this.camera.getFreeSpace();
    log.log(
      `Refreshing download queue. Camera latency: ${cameraLatency} ms. Camera free space: ${freeSpace}`
    );
    /**
     * Fetch all videos from the camera and filter out in-progress recordings
     */
    const videosToQueue = (await this.camera.FetchMetadata()).filter(
      (v) => v.Finished
    );
    const priorityBucket = new PriorityBucket(videosToQueue);

    priorityBucket.addBucket(0, {
      name: "Locked last 24 hours",
      enable: true,
      filter: (v) =>
        v.Locked &&
        v.RecordingMode != "Parking" &&
        v.StartDate < new Date(Date.now() - 1000 * 60 * 60 * 24 * 2),
      sort: NewestFrontCameraVideosFirst,
    });
    priorityBucket.addBucket(1, {
      name: "Locked not Parking",
      enable: true,
      filter: (v) => v.Locked && v.RecordingMode != "Parking",
      sort: NewestFrontCameraVideosFirst,
    });

    priorityBucket.addBucket(2, {
      name: "Locked",
      enable: true,
      filter: (v) => v.Locked,
      sort: NewestFrontCameraVideosFirst,
    });

    priorityBucket.addBucket(3, {
      name: "Normal",
      enable: true,
      filter: (v) => v.RecordingMode == "Normal",
      sort: NewestFrontCameraVideosFirst,
    });

    priorityBucket.addBucket(4, {
      name: "Parking",
      enable: this.includeParking,
      filter: (v) => v.RecordingMode == "Parking",
      sort: NewestFrontCameraVideosFirst,
    });

    const { fullQueue, bucketCounts } = priorityBucket.GetQueue();

    this.videoQueue = fullQueue;

    log.log(
      `Enqueued ${fullQueue.size()} / ${videosToQueue.length} videos. ${Object.entries(bucketCounts)
        .map(([name, count]) => `${name}: ${count}`)
        .join(", ")}`
    );
  }

  public async download() {
    await this.updateQueue();
    try {
      await this.downloadLoop();
    } catch (err) {
      try {
        await this.updateQueue();
      } catch (err) {
        throw new DownloadError("Download failed; camera offline");
      }
    }
  }

  private async downloadLoop() {
    let v: VIOFOVideoExtended;
    while ((v = this.videoQueue.dequeue()!)) {
      if (!v || typeof v == "undefined") {
        continue;
      }
      try {
        const download = this.camera.DownloadVideo(v);
        this.currentDownloads[v.FPATH] = await firstValueFrom(
          download.pipe(
            filter((s) => s.size > 0)
          )
        );
        const progressBar = new ProgressBar(
          `:dPath ->  :status [:bar] :percent :currM MB / :sizeM MB`,
          {
            width: 40,
            complete: "=",
            incomplete: " ",
            renderThrottle: 250,
            total: this.currentDownloads[v.FPATH].size,
          }
        );

        const downloadFinishedPromise = lastValueFrom(
          download.pipe(
            tap((s) => {
              progressBar.tick(s.lastChunkSize, {
                dPath: s.targetPath,
                status: s.status,
                currM: (s.bytesReceived / 1024000).toFixed(2),
                sizeM: (s.size / 1024000).toFixed(2),
              });
            })
          )
        );
        
        await downloadFinishedPromise;
        await this.camera.DeleteVideo(v);
        delete this.currentDownloads[v.FPATH];
      } catch (err) {
        delete this.currentDownloads[v.FPATH];
        // TODO: If one download fails, check to see if the camera is still alive;  Cancel remaining downloads if it's gone
        // TODO: Delete the failed download attempt
        throw new DownloadError(`Failed to download video: ${v.FPATH}`);
      }
    }
  }
}
