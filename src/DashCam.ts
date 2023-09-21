import { AxiosResponse } from "axios";
import { BehaviorSubject, Observable } from "rxjs";
import path from "path";
import fs from "fs";

export abstract class DashCam<VideoFields>{
  // #region Properties (2)

  protected MetadataStream: BehaviorSubject<VideoFields[]> =
  new BehaviorSubject<VideoFields[]>([]);
  protected videos: VideoFields[] = [];

  // #endregion Properties (2)

  // #region Public Methods (1)

  public FetchMetadata() {
    this.requestHTTTP();
    return this.MetadataStream;
  }

  // #endregion Public Methods (1)

  // #region Public Abstract Methods (1)

  public abstract DownloadVideo(video: VideoFields): Promise<void>
  
  public abstract DeleteVideo(video: VideoFields): Promise<void>

  // #endregion Public Abstract Methods (1)

  // #region Protected Abstract Methods (1)

  protected abstract requestHTTTP(): Promise<void> | void;

  protected getLocalDownloadDir() {
    const target = path.join(path.dirname(__dirname),"download")
    if (!fs.existsSync(target)) {
      fs.mkdirSync(target,{recursive: true});
    }
    return target;
  }

  // #endregion Protected Abstract Methods (1)
}