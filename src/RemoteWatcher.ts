
import { getLogger } from "loglevel";
import { interval, withLatestFrom, map, merge, debounceTime } from "rxjs";
import { distinctPropertiesChanged } from "./util/distinctPropertiesChanged";
import { ScanResults, SSHWiFiMonitor, WiFiStatus } from "./util/SSHWiFiMonitor";
import { formatString, truncateWithEllipsis } from "./util/stringFuncs";
const log = getLogger("Wifi Status");
log.enableAll();

const monitor = new SSHWiFiMonitor("172.30.9.162", "pi", "raspberry");

const propertyChanges$ = monitor.wifiStatusSubject.pipe(
  distinctPropertiesChanged(),
  map(data=>({type: 'propertyChange', data}))
);

const fullObjectEvery60Sec$ = interval(5 * 1000).pipe(
  withLatestFrom(monitor.wifiStatusSubject),
  map(([n,s])=>s),
  map(data=>({type: 'fullStatus', data}))
);

function formatWifiStatus(s: WiFiStatus): string {
  if ("essid" in s) {
    return `WiFi Status: ${s.interface}/${s.essid}/${s.accessPoint}: ${s.bitRate} ${s.linkQuality} (TX:${s.txPower} RX:${s.signalLevel}))`
  }
  else {
    return "Changes: " + Object.entries(s).map(([k,v])=>`${k}: ${v}`).join(" ");
  }
}


function formatNetworkScan(s: ScanResults): string {
  const uniqueSSIDs = [... new Set(s.accessPoints.map(ap=>ap.essid))]
  const networks = uniqueSSIDs.map(ssid=>{
    const broadcastingAPs = s.accessPoints.filter(ap=>ap.essid == ssid);
    return {
      ssid: ssid,
      accessPoints: broadcastingAPs
    }
  });
  
  return s.interface +": " + networks.map(n=>`\t(${n.accessPoints.length})\t${formatString(n.ssid,20)}\t[${n.accessPoints.map(ap=>ap.signalLevel).join(",")}]`).join("\n");
}



const scanUpdates$ = monitor.visibleNetworksSubject
  .pipe(
    map(data=>({type: 'networkScan', data}))
  )

merge(propertyChanges$, fullObjectEvery60Sec$,scanUpdates$).subscribe(({type,data})=> {
  switch(type){
    case "fullStatus":
    case "propertyChange":
      log.debug(formatWifiStatus(data as WiFiStatus));
      break
    case "networkScan": 
      log.debug(formatNetworkScan(data as ScanResults));
  }
  

})