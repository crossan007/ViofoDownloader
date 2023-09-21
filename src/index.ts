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
  const lockedVideos = r.filter(v=>v.Locked)
  await downloadList(lockedVideos);

  const notLocked = r.filter(v=>!v.Locked).sort(compareByDate);
  await downloadList(notLocked);

}

run();