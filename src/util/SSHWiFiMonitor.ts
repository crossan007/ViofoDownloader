import { Client } from "ssh2";
import { ReplaySubject } from "rxjs";
import { getLogger } from "loglevel";

const log = getLogger("SSHWiFiMonitor");
log.enableAll();

export type WiFiStatus = {
  interface: string;
  standard: string;
  essid: string;
  mode: string;
  accessPoint: string;
  txPower: string;
  retryShortLimit: string;
  rtsThreshold: string;
  fragmentThreshold: string;
  powerManagement: string;
};

export class SSHWiFiMonitor {
  private sshClient: Client;
  public wifiStatusSubject = new ReplaySubject<WiFiStatus>(1); // Keeps the latest value

  constructor(
    private host: string,
    private username: string,
    private password: string
  ) {
    this.sshClient = new Client();
    this.setupWiFiMonitoring();
  }

  private setupWiFiMonitoring() {
    this.sshClient.on("ready", () => {
      log.debug(`SSH: Connected - ${this.username}@${this.host}`);
      setInterval(()=>this.runCheckCommand(), 1000)
    });

    this.sshClient.connect({
      host: this.host,
      username: this.username,
      password: this.password,
    });
  }

  private runCheckCommand() {
    this.sshClient.exec('bash -l -c "iwconfig wlan0"', (err, stream) => {
      if (err) {
        throw err;
      }

      stream.stdout.on("data", (data: Buffer) => {
        const d = data.toString();
        if (/^wlan0/gim.test(d)) {
          const status = this.parseWiFiStatus(d);
          this.wifiStatusSubject.next(status);
        }
      });

      stream.stderr.on("data", (data: Buffer) => {
        // Handle standard error output
        console.error("STDERR:", data.toString());
      });
    });
  }

  private parseWiFiStatus(output: string): WiFiStatus {
    const wifiStatus: WiFiStatus = {
      interface: "",
      standard: "",
      essid: "",
      mode: "",
      accessPoint: "",
      txPower: "",
      retryShortLimit: "",
      rtsThreshold: "",
      fragmentThreshold: "",
      powerManagement: "",
    };

    const extract = (pattern: RegExp): string => {
      const match = output.match(pattern);
      return match && match[1] ? match[1] : "";
    };

    // Refining the regular expressions
    wifiStatus.interface = extract(/(\w+)[\s]+IEEE/);
    wifiStatus.standard = extract(/IEEE ([\w.]+)/);
    wifiStatus.essid = extract(/ESSID:"(.*?)"/);
    wifiStatus.mode = extract(/Mode:(\w+)/);
    wifiStatus.accessPoint = extract(/Access Point: ([\w:-]+)/);
    wifiStatus.txPower = extract(/Tx-Power=([\d\s]+dBm)/).trim(); // Updated regex for txPower
    wifiStatus.retryShortLimit = extract(/Retry short limit:(\d+)/);
    wifiStatus.rtsThreshold = extract(/RTS thr:(\w+)/);
    wifiStatus.fragmentThreshold = extract(/Fragment thr:(\w+)/);
    wifiStatus.powerManagement = extract(/Power Management:(\w+)/);

    return wifiStatus;
  }
}
