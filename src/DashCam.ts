import { AxiosResponse } from "axios";
import { BehaviorSubject, Observable } from "rxjs";

export type VideoReference = {
  date: string;
  path: string;
  size: string;
  view: string;
};

export abstract class DashCam {
  // #region Properties (2)

  protected MetadataStream: BehaviorSubject<VideoReference[]> =
  new BehaviorSubject<VideoReference[]>([]);
  protected videos: VideoReference[] = [];

  // #endregion Properties (2)

  // #region Public Methods (1)

  public FetchMetadata() {
    this.requestHTTTP();
    return this.MetadataStream;
  }

  // #endregion Public Methods (1)

  // #region Public Abstract Methods (1)

  public abstract DownloadVideo(video: VideoReference): AxiosResponse

  // #endregion Public Abstract Methods (1)

  // #region Protected Abstract Methods (1)

  protected abstract requestHTTTP(): Promise<void> | void;

  // #endregion Protected Abstract Methods (1)
}