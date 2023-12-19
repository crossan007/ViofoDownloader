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
  return dateB - dateA;
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
      name: "Locked last 12 hours",
      enable: true,
      filter: (v) =>
        v.Locked &&
        v.RecordingMode != "Parking" &&
        v.StartDate < new Date(Date.now() - 1000 * 60 * 60 * 12),
      sort: NewestFrontCameraVideosFirst,
    });
    priorityBucket.addBucket(1, {
      name: "Locked not Parking",
      enable: true,
      filter: (v) => v.Locked && v.RecordingMode != "Parking",
      sort: NewestFrontCameraVideosFirst,
    });

    priorityBucket.addBucket(3, {
      name: "Driving last 6 hours",
      enable: true,
      filter: (v) => v.RecordingMode == "Normal" &&
      v.StartDate < new Date(Date.now() - 1000 * 60 * 60 * 6),
      sort: NewestFrontCameraVideosFirst,
    });

    priorityBucket.addBucket(2, {
      name: "Locked Parking",
      enable: true,
      filter: (v) => v.Locked,
      sort: NewestFrontCameraVideosFirst,
    });

    priorityBucket.addBucket(3, {
      name: "Driving",
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
      await this.processOneVideo(v)
    }
  }

  private async processOneVideo(video: VIOFOVideoExtended) {
    const videoSize = parseInt(video.SIZE);
    const progressBar = new ProgressBar(
      `:dPath ->  :status [:bar] :percent :currM MB / :sizeM MB (:kbps kb/s) (:kbpsa kb/s))`,
      {
        width: 40,
        complete: "=",
        incomplete: " ",
        renderThrottle: 250,
        total: videoSize,
      }
    );

    try {
      const download = this.camera.DownloadVideo(video);

      this.currentDownloads[video.FPATH] = await firstValueFrom(download);
      let downloaded = 0;
      let started = Date.now();
      let lastTick  = started;
      let thisTick = started;
      await lastValueFrom(
        download.pipe(
          tap((s) => {
            downloaded += s.lastChunkSize;
            if (downloaded >= videoSize) {
              log.debug("downloaded more than video size???")
            }
            thisTick = Date.now();
            let kbpsLast = (s.lastChunkSize / 1024) / ((thisTick - lastTick)/1000);
            let kbpsa = (downloaded / 1024) / ((thisTick - started)/1000);
            lastTick = thisTick;
            progressBar.tick(s.lastChunkSize, {
              dPath: s.targetPath,
              status: s.status,
              currM: (s.bytesReceived / 1024000).toFixed(2),
              sizeM: (s.size / 1024000).toFixed(2),
              kbps: kbpsLast.toFixed(2),
              kbpsa: kbpsa.toFixed(2)
            });
          })
        )
      );
      await this.camera.DeleteVideo(video);
      delete this.currentDownloads[video.FPATH];
    } catch (err) {
      delete this.currentDownloads[video.FPATH];
      // TODO: If one download fails, check to see if the camera is still alive;  Cancel remaining downloads if it's gone
      // TODO: Delete the failed download attempt
      throw new DownloadError(`Failed to download video: ${video.FPATH}`);
    }
  }
}
