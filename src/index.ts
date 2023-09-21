import { lastValueFrom } from "rxjs";
import { ViofoCam } from "./Viofo";
console.clear();
const viofoCam = new ViofoCam("172.30.9.120")
const o = viofoCam.FetchMetadata()

async function run() {

  console.log(`Fetching Metadata`);
  const r = await lastValueFrom(viofoCam.FetchMetadata())
  console.log(`\nReceived ${r.length} videos`);

  const vToParse = r.slice(0,10)
  for (let v of vToParse) {
    console.log(v)
    await viofoCam.DownloadVideo(v);
    await viofoCam.DeleteVideo(v);
  } 
}

run();