import { Client } from "ssh2";
import { ReplaySubject } from "rxjs";
import { getLogger } from "loglevel";
const log = getLogger("SSHWiFiMonitor");
log.enableAll();

class SSHWiFiMonitor {
  private sshClient: Client;
  private wifiStatusSubject: ReplaySubject<string>;

  constructor(
    private host: string,
    private username: string,
    private password: string
  ) {
    this.sshClient = new Client();
    this.wifiStatusSubject = new ReplaySubject<string>(1); // Keeps the latest value
    this.setupWiFiMonitoring();
  }

  private setupWiFiMonitoring() {
    this.sshClient.on("ready", () => {
      log.debug(`SSH: Connected - ${this.username}@${this.host}`);
      // Regularly check WiFi status
      this.sshClient.shell((err, stream) => {
        if (err) {
          throw err;
        }

        stream.on("close", () => {
          log.debug("Stream :: close");
          this.sshClient.end();
        });

        stream.stdout.on("data", (data: Buffer) => {
          const d = data.toString();
          log.info(d);
        });

        stream.stderr.on("data", (data: Buffer) => {
          // Handle standard error output
          console.error("STDERR:", data.toString());
        });

        stream.stdin.write("iwconfig wlan0\n")
        setInterval(()=>{ 
          stream.write("iwconfig wlan0\n")
        },5000);

      });
    });

    this.sshClient.connect({
      host: this.host,
      username: this.username,
      password: this.password,
    });
  }

  private parseWiFiStatus(output: string): string {
    // Implement parsing logic here
    return output; // Placeholder
  }

  public getWiFiStatus(): ReplaySubject<string> {
    return this.wifiStatusSubject;
  }

  // Additional methods for handling SSH connection (connect, disconnect, etc.)
}

// Usage
const monitor = new SSHWiFiMonitor("172.30.9.162", "pi", "raspberry");
monitor.getWiFiStatus().subscribe(
  (status) => {
    log.debug("WiFi Status:", status);
  },
  (error) => {
    console.error("Error:", error);
  }
);
