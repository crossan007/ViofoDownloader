
import { getLogger } from "loglevel";
import { interval, withLatestFrom, map, merge, debounceTime } from "rxjs";
import { distinctPropertiesChanged } from "./util/distinctPropertiesChanged";
import { SSHWiFiMonitor, WiFiStatus } from "./util/SSHWiFiMonitor";
const log = getLogger("Wifi Status");
log.enableAll();

const monitor = new SSHWiFiMonitor("172.30.9.162", "pi", "raspberry");

const propertyChanges$ = monitor.wifiStatusSubject.pipe(
  distinctPropertiesChanged()
);

const fullObjectEvery60Sec$ = interval(5 * 1000).pipe(
  withLatestFrom(monitor.wifiStatusSubject),
  map(([n,s])=>s)
);

function formatWifiStatus(s: WiFiStatus): string {
  if ("essid" in s) {
    return `WiFi Status: ${s.interface}/${s.essid}/${s.accessPoint}: ${s.bitRate} ${s.linkQuality} (TX:${s.txPower} RX:${s.signalLevel}))`
  }
  else {
    return "Changes: " + Object.entries(s).map(([k,v])=>`${k}: ${v}`).join(" ");
  }
}

merge(propertyChanges$, fullObjectEvery60Sec$).subscribe(status=> {
  log.debug(formatWifiStatus(status));
})