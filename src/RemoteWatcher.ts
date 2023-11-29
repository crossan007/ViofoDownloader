
import { getLogger } from "loglevel";
import { interval, withLatestFrom, map, merge } from "rxjs";
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
  return `${s.interface}/${s.essid}/${s.accessPoint}: ${s.bitRate} ${s.linkQuality} (TX:${s.txPower} RX:${s.signalLevel}))`
}

merge(propertyChanges$, fullObjectEvery60Sec$).subscribe(status=> {
  log.debug(formatWifiStatus(status));
})