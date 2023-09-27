import { DownloadStrategy } from "./DownloadStrategy";
import { ViofoCam } from "./Viofo";
import express, { Request, Response } from 'express';
import mdns, { ServiceType } from 'mdns-js';

const app = express();
const port = Number.parseInt(process.env?.PORT || "80");
const viofoCam = new ViofoCam("172.30.9.162")
const downloader = new DownloadStrategy(viofoCam);

async function run() {
  console.clear();
  //const viofoCam = new ViofoCam("192.168.1.254")
  await viofoCam.waitForStatus();
  await viofoCam.Reboot();
  const state = viofoCam.GetCurrentState();
  
  await downloader.download();
}

app.get('/', (req: Request, res: Response) => {
  res.json({
    downloads: {
      activeDownloads: downloader.getCurrentDownloads(),
      queue_top_20: downloader.getCurrentQueue().get().slice(0,20)
    },
    camera: {
      lastHeartbeat: viofoCam.lastHeartbeat,
      viofoCam: viofoCam.GetCachedState(),
     
    }
  });
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
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