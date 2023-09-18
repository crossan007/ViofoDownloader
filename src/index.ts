import { ViofoCam } from "./viofo";
console.clear();
const v = new ViofoCam("172.30.9.120")
const o = v.FetchMetadata()
o.subscribe((jsonObject) => {
  console.log(`\nReceived ${jsonObject.length} videos`);
});
