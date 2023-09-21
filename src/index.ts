import { lastValueFrom } from "rxjs";
import { ViofoCam, VIOFOVideoExtended } from "./Viofo";
console.clear();
const viofoCam = new ViofoCam("172.30.9.120")
const o = viofoCam.FetchMetadata()

// Custom comparison function to sort by dateProperty
function compareByDate(a: VIOFOVideoExtended, b: VIOFOVideoExtended): number {
  const dateA = a.StartDate.getTime();
  const dateB = b.StartDate.getTime();
  return dateA - dateB;
}



async function downloadList(videos: VIOFOVideoExtended[]) {
  for (let v of videos) {
    try {
      await viofoCam.DownloadVideo(v);
      await viofoCam.DeleteVideo(v);
    }
    catch (err) {
      console.warn(`Failed to download video: ${v.FPATH}`)
    }
  } 
}

async function run() {

  console.log(`Fetching Metadata`);
  const r = await lastValueFrom(viofoCam.FetchMetadata())
  console.log(`\nReceived ${r.length} videos`);

  // Download Locked videos first
  const lockedVideos = r.filter(v=>v.Locked).sort(compareByDate);
  await downloadList(lockedVideos);

  // Download driving videos second
  const normalRecordings = r.filter(v=>v.RecordingMode == "Normal").sort(compareByDate)
  await downloadList(normalRecordings.filter(v=>v.Lens == "Front"));
  await downloadList(normalRecordings.filter(v=>v.Lens != "Front"));

  // Download Parking videos last
  const parkingRecordings =  r.filter(v=>v.RecordingMode == "Parking").sort(compareByDate)
  await downloadList(parkingRecordings);

}

run();