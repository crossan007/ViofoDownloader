import { DownloadStrategy } from "./DownloadStrategy";
import { ViofoCam } from "./Viofo";
import express, { Request, Response } from 'express';
import mdns, { ServiceType } from 'mdns-js';
import { enableLogs, getLogger } from "./classes/logging";
import { sleep } from "./util/sleep";

enableLogs()
const log = getLogger("Main")

const app = express();
const port = Number.parseInt(process.env?.PORT || "8086");
const viofoCam = new ViofoCam("172.30.9.162")
const downloader = new DownloadStrategy(viofoCam);

async function run() {
  while(true) {
    try {
      try {
        await viofoCam.waitForStatus();
      }
      catch(err) {
        log.warn("Failed to get status");
        await viofoCam.Reboot();
        continue;
      }
      try {
        await downloader.download();
      }
      catch(err){
        log.warn("Camera failure during download", err)
        await viofoCam.Reboot();
      }
    }
    catch(err){
      await sleep(1000);
    }
  }
}

app.get('/', (req: Request, res: Response) => {
  res.json({
    downloads: {
      activeDownloads: downloader.getCurrentDownloads(),
      queue_top_20: downloader.getCurrentQueue().get().slice(0,20)
    },
    camera: {
      secondsSinceLastHeartbeat: Math.trunc((Date.now() - viofoCam.lastActivity)/1000),
      lastHeartbeatTimestamp: viofoCam.lastActivity,
      viofoCam: viofoCam.GetCachedState(),
    }
  });
});

app.listen(port, () => {
  log.log(`Server is running on port ${port}`);
});

// Create an mDNS advertisement
const serviceName = 'viofo';

const service = mdns.createAdvertisement(mdns.tcp("_http"), 
  port, 
  {
    name: serviceName,
  }
);

service.start();


run();