import { AxiosResponse } from "axios";
import { BehaviorSubject, Observable, Subject } from "rxjs";
import path from "path";
import fs from "fs";

export class CameraError extends Error{
}

export type AciveDownload<T> = {
  status: string
  lastChunkTimestamp: number,
  Video: T
  videoPath: path.ParsedPath
  targetBase: string
  targetPath: string
  url: string
  size: number
  bytesReceived: number
  lastChunkSize: number
}

export abstract class DashCam<VideoFields>{
  // #region Public Abstract Methods (3)

  public abstract DeleteVideo(video: VideoFields): Promise<void>
  public abstract DownloadVideo(video: VideoFields):  Observable<AciveDownload<VideoFields>>
  public abstract FetchMetadata(): Promise<VideoFields[]>

  // #endregion Public Abstract Methods (3)

  // #region Protected Methods (1)

  protected getLocalDownloadDir() {
    const target = path.join(path.dirname(__dirname),"download")
    if (!fs.existsSync(target)) {
      fs.mkdirSync(target,{recursive: true});
    }
    return target;
  }

  // #endregion Protected Methods (1)
}