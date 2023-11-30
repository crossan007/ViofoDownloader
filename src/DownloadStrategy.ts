import { firstValueFrom, lastValueFrom } from "rxjs";
import { Queue } from "./Queue";
import { ViofoCam, VIOFOVideoExtended } from "./Viofo";
import { getLogger } from "./logging";
import ProgressBar from "progress";
import { AciveDownload } from "./DashCam";
const log = getLogger("DownloadStrategy")

// Custom comparison function to sort by dateProperty
function compareByDate(a: VIOFOVideoExtended, b: VIOFOVideoExtended): number {
  const dateA = a.StartDate.getTime();
  const dateB = b.StartDate.getTime();
  return dateA - dateB;
}

class DownloadError extends Error{

}


export class DownloadStrategy {

  private concurrency: number = 1;
  private videoQueue = new Queue<VIOFOVideoExtended>();
  private currentDownloads: Record<string,AciveDownload<VIOFOVideoExtended>> = {};

  constructor(private camera: ViofoCam, private includeParking: boolean = false) {

  }

  public getCurrentQueue(): Queue<VIOFOVideoExtended> {
    return this.videoQueue;
  }

  public getCurrentDownloads(): Record<string,AciveDownload<VIOFOVideoExtended>> {
    return this.currentDownloads;
  }

  private async updateQueue() {
    this.videoQueue.clear();
    const cameraLatency = await this.camera.getHeartbeat();
    if (cameraLatency > 200) {
      throw new DownloadError(`Camera latency high: ${cameraLatency} ms`)
    }
    const freeSpace = await this.camera.getFreeSpace();
    log.log(`Refreshing download queue. Camera latency: ${cameraLatency} ms. Camera free space: ${freeSpace}`);
    const r = (await lastValueFrom(this.camera.FetchMetadata())).filter(v=> v.Finished);
   
    const lockedVideos = r.filter(v=>v.Locked).sort(compareByDate);
    const lockedNotParking = lockedVideos.filter(v=>v.RecordingMode != "Parking")
    const lockedParking = lockedVideos.filter(v=>v.RecordingMode == "Parking")
    const normalRecordings = r.filter(v=>v.RecordingMode == "Normal").sort(compareByDate)
    const parkingRecordings =  r.filter(v=>v.RecordingMode == "Parking").sort(compareByDate)
    
    log.log(`Received ${r.length} videos. Locked: ${lockedVideos.length}. Driving: ${normalRecordings.length}.  Parking: ${parkingRecordings.length}.`);

    this.videoQueue.enqueue(lockedNotParking.filter(v=>v.Lens == "Front"));
    this.videoQueue.enqueue(lockedNotParking.filter(v=>v.Lens != "Front"));

    this.videoQueue.enqueue(lockedParking.filter(v=>v.Lens == "Front"));
    this.videoQueue.enqueue(lockedParking.filter(v=>v.Lens != "Front"));

    // Download driving videos second
    
    this.videoQueue.enqueue(normalRecordings.filter(v=>v.Lens == "Front").sort((a,b)=>a.SIZE < b.SIZE ? -1 : 1));
    this.videoQueue.enqueue(normalRecordings.filter(v=>v.Lens != "Front").sort((a,b)=>a.SIZE < b.SIZE ? -1 : 1));

    if (this.includeParking) {
      // Download Parking videos last
      
      this.videoQueue.enqueue(parkingRecordings.filter(v=>v.Lens == "Front"));
      this.videoQueue.enqueue(parkingRecordings.filter(v=>v.Lens != "Front"));
    }
  }

  public async download() {
    await this.updateQueue();
    let v: VIOFOVideoExtended | undefined;
    while(v = this.videoQueue.dequeue()) {

      if (!v || typeof v == "undefined") {
        continue;
      }

      try {

        const progressBar = new ProgressBar(`:dPath ->  :status [:bar] :percent :currM MB / :sizeM MB`, {
          width: 40,
          complete: '=',
          incomplete: ' ',
          renderThrottle: 250,
          total: parseInt(v.SIZE)
        })
        
        const download = this.camera.DownloadVideo(v);
        this.currentDownloads[v.FPATH] = await firstValueFrom(download);
        download.subscribe(s=>{
          progressBar.tick(s.lastChunkSize, {
            "dPath": s.targetPath,
            "status": s.status,
            'currM': (s.bytesReceived / 1024000).toFixed(2),
            'sizeM': (s.size / 1024000).toFixed(2)
          })
        })

        await lastValueFrom(download);
        await this.camera.DeleteVideo(v);
        delete this.currentDownloads[v.FPATH];
      }
      catch (err) {
        delete this.currentDownloads[v.FPATH];
        // TODO: If one download fails, check to see if the camera is still alive;  Cancel remaining downloads if it's gone
        // TODO: Delete the failed download attempt
        log.warn(`Failed to download video: ${v.FPATH}`, err)
        try { 
          await this.updateQueue();
        }
        catch (err) {
          throw new DownloadError("Download failed; camera offline")
        }
      }
      
    }
  }

}