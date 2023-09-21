import { lastValueFrom } from "rxjs";
import { ViofoCam, VIOFOVideoExtended } from "./Viofo";
console.clear();
const viofoCam = new ViofoCam("172.30.9.120")
const o = viofoCam.FetchMetadata()

async function downloadList(videos: VIOFOVideoExtended[]) {
  for (let v of videos) {
    await viofoCam.DownloadVideo(v);
    await viofoCam.DeleteVideo(v);
  } 
}

async function run() {

  console.log(`Fetching Metadata`);
  const r = await lastValueFrom(viofoCam.FetchMetadata())
  console.log(`\nReceived ${r.length} videos`);
  const lockedVideos = r.filter(v=>v.Locked)
  await downloadList(lockedVideos);

  const notLocked = r.filter(v=>!v.Locked)
  await downloadList(notLocked);

}

run();