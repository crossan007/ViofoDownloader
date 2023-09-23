import { lastValueFrom } from "rxjs";
import { DownloadStrategy } from "./DownloadStrategy";
import { ViofoCam, VIOFOVideoExtended } from "./Viofo";
console.clear();

async function run() {
  const viofoCam = new ViofoCam("172.30.9.120")
  //const viofoCam = new ViofoCam("192.168.1.254")
  await viofoCam.waitForStatus();
  //  await viofoCam.Reboot();
  const state = viofoCam.GetCurrentState();
  const downloader = new DownloadStrategy(viofoCam);
  await downloader.download();
}


run();