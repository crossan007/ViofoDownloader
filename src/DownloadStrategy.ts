import { lastValueFrom } from "rxjs";
import { Queue } from "./Queue";
import { ViofoCam, VIOFOVideoExtended } from "./Viofo";

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

  constructor(private camera: ViofoCam) {

  }

  private async updateQueue() {
    this.videoQueue.clear();
    const cameraLatency = await this.camera.getHeartbeat();
    if (cameraLatency > 200) {
      throw new DownloadError(`Camera latency high: ${cameraLatency} ms`)
    }
    const freeSpace = await this.camera.getFreeSpace();
    console.log(`Refreshing download queue. Camera latency: ${cameraLatency} ms. Camera free space: ${freeSpace}`);
    const r = await (await lastValueFrom(this.camera.FetchMetadata())).filter(v=> v.Finished);
    console.log(`\nReceived ${r.length} videos`);
    const lockedVideos = r.filter(v=>v.Locked).sort(compareByDate);
    this.videoQueue.enqueue(lockedVideos.filter(v=>v.Lens == "Front"));
    this.videoQueue.enqueue(lockedVideos.filter(v=>v.Lens != "Front"));

    // Download driving videos second
    const normalRecordings = r.filter(v=>v.RecordingMode == "Normal").sort(compareByDate)
    this.videoQueue.enqueue(normalRecordings.filter(v=>v.Lens == "Front"));
    this.videoQueue.enqueue(normalRecordings.filter(v=>v.Lens != "Front"));

    // Download Parking videos last
    const parkingRecordings =  r.filter(v=>v.RecordingMode == "Parking").sort(compareByDate)
    this.videoQueue.enqueue(parkingRecordings.filter(v=>v.Lens == "Front"));
    this.videoQueue.enqueue(parkingRecordings.filter(v=>v.Lens != "Front"));
  }

  public async download() {
    await this.updateQueue();
    let v: VIOFOVideoExtended | undefined;
    while(v = this.videoQueue.dequeue()) {
      try {
        await this.camera.DownloadVideo(v);
        await this.camera.DeleteVideo(v);
      }
      catch (err) {
        // TODO: If one download fails, check to see if the camera is still alive;  Cancel remaining downloads if it's gone
        // TODO: Delete the failed download attempt
        console.warn(`Failed to download video: ${v.FPATH}`, err)
        await this.updateQueue();
      }
    }
  }

}