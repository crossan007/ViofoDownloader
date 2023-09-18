import { AxiosResponse } from "axios";
import { Observable } from "rxjs";

export type VideoReference = {
  date: string;
  path: string;
  size: string;
  view: string;
};


export abstract class DashCam {

  protected videos: VideoReference[] = [];

  public abstract DownloadVideo(video: VideoReference): AxiosResponse
  public abstract FetchMetadata(): Observable<VideoReference[]>

}