import  Axios, { AxiosResponse } from "axios";
import { BehaviorSubject, scan, Subject } from "rxjs";
import { DashCam, VideoReference } from "./dashcam";

export class ViofoCam extends DashCam {
  // #region Properties (1)


  // #endregion Properties (1)

  // #region Constructors (1)

  constructor(private IPAddress: string, private OnlyLocked: boolean = true) {
    super();
  }

  // #endregion Constructors (1)

  // #region Public Methods (2)

  public DownloadVideo(video: VideoReference): AxiosResponse<any, any> {
    throw new Error("Method not implemented.");
  }



  // #endregion Public Methods (2)

  // #region Private Methods (3)

  private decodeMatch(match: RegExpExecArray): VideoReference | null {
    if (!match.groups) {
      return null;
    }

    let vr: Partial<VideoReference> = {};
    vr.path = match.groups.path.trim();
    vr.date = match.groups.date.trim();
    vr.view = match.groups.view.trim();
    vr.size = match.groups.size.trim();

    return vr as VideoReference;
  }



  protected async requestHTTTP() {
    const ROURL = `http://${this.IPAddress}/DCIM/Movie${this.OnlyLocked ? '/RO' : ''}`;

    const chunkStream = new Subject<string>();

    try {
      const response = await Axios.get(ROURL, { responseType: "stream" });
      response.data.on("data", (chunk: string) => {
        // Push the HTML chunk to the chunkStream
        chunkStream.next(chunk.toString());
      });

      response.data.on("end", () => {
        // Complete the chunkStream when HTML loading is finished
        chunkStream.complete();
        this.MetadataStream.complete();
      });

      response.data.on("error", (error: Error) => {
        // Handle errors
        console.error("Error fetching HTML:", error);
      });
    } catch (error) {
      // Handle errors
      console.error("Error fetching HTML:", error);
    }

    chunkStream
      .pipe(
        scan((acc: string, chunk: string) => {
          const accumulatedHTML = acc + chunk;

           // Define a regular expression with named capture groups
            const fileRegex =
            /^<tr><td><a href="\/(?<path>[^"]*)\d_(?<view>\w).MP4"><b>[^<]+<\/b><\/a><td align=right> (?<size>.*?MB)<td align=right>(?<date>[\S\s]*?)<td align=right>/gm;

          // Extract data using the regular expression and named capture groups
          const files: VideoReference[] = [];
          let match;
          while ((match = fileRegex.exec(accumulatedHTML)) !== null) {
            const m = this.decodeMatch(match);
            if (m) {
              this.videos.push(m);
              this.MetadataStream.next(this.videos);
            }
          }

          return accumulatedHTML;

        }, "")
      )
      .subscribe();
  }

  // #endregion Private Methods (3)
}
