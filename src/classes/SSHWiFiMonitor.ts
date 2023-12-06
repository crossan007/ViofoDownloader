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
    frequency: string;
    accessPoint: string;
    bitRate: string;
    txPower: string;
    retryShortLimit: string;
    rtsThreshold: string;
    fragmentThreshold: string;
    encryptionKey: string;
    powerManagement: string;
    linkQuality: string;
    signalLevel: string;
    rxInvalidNwid: string;
    rxInvalidCrypt: string;
    rxInvalidFrag: string;
    txExcessiveRetries: string;
    invalidMisc: string;
    missedBeacon: string;
};

export type NetworkScanResult = {
  address: string;
  channel: string;
  frequency: string;
  quality: string;
  signalLevel: string;
  encryptionKey: string;
  essid: string;
  bitRates: string[];
  mode: string;
  extra: string[];
  informationElements: string[];
};

export type ScanResults = {
  interface: string;
  accessPoints: NetworkScanResult[];
};



export class SSHWiFiMonitor {
  private sshClient: Client;
  public wifiStatusSubject = new ReplaySubject<WiFiStatus>(1); // Keeps the latest value
  public visibleNetworksSubject = new ReplaySubject<ScanResults>(1); // Keeps the latest value

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
      setInterval(()=>this.checkiwconfig(), 500)
      setInterval(()=>this.checkVisibleNetworks(),5000);
    });

    this.sshClient.connect({
      host: this.host,
      username: this.username,
      password: this.password,
    });
  }

  private checkiwconfig() {
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

  private checkVisibleNetworks() {
    this.sshClient.exec('bash -l -c "iwlist wlan0 scan"', (err, stream) => {
      if (err) {
        throw err;
      }

      let fullOutput = "";

      stream.stdout.on("data", (data: Buffer) => {
        if (fullOutput.length > 0 || /^wlan0/gim.test(data.toString())){
          fullOutput += data.toString();
        }
      });

      stream.stderr.on("data", (data: Buffer) => {
        // Handle standard error output
        console.error("STDERR:", data.toString());
      });

      stream.on("close", (code: any , signal: any) => {
        const status = this.parseIwlistScan(fullOutput);
        this.visibleNetworksSubject.next(status);
      });
    });
  }

  private parseWiFiStatus(output: string): WiFiStatus {
    //@ts-ignore
    const wifiStatus: WiFiStatus = {
        // Initialize all properties with empty strings
        interface: '',
        // ... other properties ...
    };

    const extract = (pattern: RegExp): string => {
        const match = output.match(pattern);
        return match && match[1] ? match[1] : '';
    };

    // Extract values using regex
    wifiStatus.interface = extract(/(\w+)[\s]+IEEE/);
    wifiStatus.standard = extract(/IEEE ([\w.]+)/);
    wifiStatus.essid = extract(/ESSID:"?(.*?)["\s]/);
    wifiStatus.mode = extract(/Mode:(\w+)/);
    wifiStatus.frequency = extract(/Frequency:([\w. ]+GHz)/);
    wifiStatus.accessPoint = extract(/Access Point: ([\w:-]+)/);
    wifiStatus.bitRate = extract(/Bit Rate=([\w. ]+Mb\/s)/);
    wifiStatus.txPower = extract(/Tx-Power=([\d\s]+dBm)/).trim();
    // ... extract other properties similarly ...
    wifiStatus.linkQuality = extract(/Link Quality=([\d\/]+)/);
    wifiStatus.signalLevel = extract(/Signal level=([\w- ]+dBm)/);

    // ... continue with other properties ...
    return wifiStatus;
  }

  private parseIwlistScan(output: string): ScanResults {
  const scanResults: ScanResults = { interface: '', accessPoints: [] };

  // Extract interface
  const interfaceMatch = output.match(/(\w+)\s+Scan completed/);
  if (interfaceMatch) {
      scanResults.interface = interfaceMatch[1];
  }

  // Split by cell/network
  const networkSections = output.split(/Cell \d+ - Address:/).slice(1);

  networkSections.forEach(section => {
      const network: NetworkScanResult = {
          address: '',
          channel: '',
          frequency: '',
          quality: '',
          signalLevel: '',
          encryptionKey: '',
          essid: '',
          bitRates: [],
          mode: '',
          extra: [],
          informationElements: []
      };

      const extract = (pattern: RegExp, group = 1): string => {
          const match = section.match(pattern);
          return match ? match[group].trim() : '';
      };

      network.address = extract(/Address: ([\w:]+)/);
      network.channel = extract(/Channel:(\d+)/);
      network.frequency = extract(/Frequency:([\w. ]+GHz)/);
      network.quality = extract(/Quality=([\d\/]+)\s+Signal level=([\w- ]+dBm)/, 1);
      network.signalLevel = extract(/Quality=([\d\/]+)\s+Signal level=([\w- ]+dBm)/, 2);
      network.encryptionKey = extract(/Encryption key:(\w+)/);
      network.essid = extract(/ESSID:"([^"]+)"/);
      network.bitRates = (section.match(/Bit Rates:(.+)/g) || [])
          .flatMap(br => br.replace('Bit Rates:', '').trim().split(';').map(rate => rate.trim()));
      network.mode = extract(/Mode:(\w+)/);
      network.extra = (section.match(/Extra: (.+)/g) || []).map(e => e.replace('Extra:', '').trim());
      network.informationElements = (section.match(/IE: (.+)/g) || []).map(ie => ie.replace('IE:', '').trim());

      scanResults.accessPoints.push(network);
  });

  return scanResults;
}




}

