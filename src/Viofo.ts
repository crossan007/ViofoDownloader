import  Axios, { AxiosResponse } from "axios";
import { BehaviorSubject, Observable, scan, share, Subject } from "rxjs";
import { AciveDownload, DashCam } from "./DashCam";
import xml2js from "xml2js"
import fs from "fs"
import path from "path"
import ProgressBar from "progress";
import { utimesSync } from 'utimes';
import { getLogger } from "./logging";
const log = getLogger("Viofo")



interface VIOFOVideoBase  {
  // #region Properties (6)

  ATTR: string
  FPATH: string
  NAME: string
  SIZE: string
  TIME: string
  TIMECODE: string

  // #endregion Properties (6)
}

type Lens = "Front" | "Rear" | "Interior";
type RecordingMode = "Parking" | "Normal";
export interface VIOFOVideoExtended extends VIOFOVideoBase {
  // #region Properties (7)

  Duration: number
  EndDate: Date
  Finished: boolean
  Lens: Lens
  Locked: boolean
  RecordingMode: RecordingMode
  StartDate: Date

  // #endregion Properties (7)
}

export class ViofoCam extends DashCam<VIOFOVideoExtended> {
  // #region Properties (2)

  private state: SerializedState | undefined;
  public lastActivity: number = -1;

  public GetCachedState(): SerializedState | undefined {
    return this.state;
  }

  // #endregion Properties (2)

  // #region Constructors (1)

  constructor(private IPAddress: string, private OnlyLocked: boolean = true) {
    super();
  }

  // #endregion Constructors (1)

  // #region Public Methods (8)

  public async DeleteVideo(video: VIOFOVideoExtended): Promise<void> {
    const response = await Axios({
      url: `http://${this.IPAddress}/?custom=1&cmd=4003&str=${video.FPATH}`,
      method: "GET",
    })
    this.lastActivity = Date.now();
    log.log(`Deleted ${video.FPATH}`)
  }

  public DownloadVideo(video: VIOFOVideoExtended): Observable<AciveDownload<VIOFOVideoExtended>> {

    let activeDownload: AciveDownload<VIOFOVideoExtended> = {
      status: "Preparing",
      Video: video,
      videoPath: path.parse(video.FPATH.replace(/\\/gm,"/")),
      targetBase: path.join(this.getLocalDownloadDir(),`${video.Locked ? "Locked" : ""}`,`${video.StartDate.getFullYear()}`,`${video.StartDate.getUTCMonth()+1}`),
      targetPath: "",
      url: `http://${this.IPAddress}${video.FPATH.split(":")[1]}`,
      bytesReceived: 0,
      size: -1,
      lastChunkTimestamp: -1,
      lastChunkSize: -1
    }
    activeDownload.targetPath= path.join(activeDownload.targetBase,activeDownload.videoPath.base+".partial")

    const o = new Observable<AciveDownload<VIOFOVideoExtended>>((observer)=>{
  
      fs.mkdirSync(activeDownload.targetBase,{recursive: true})
      let localFileWriteStream = fs.createWriteStream(activeDownload.targetPath);

      localFileWriteStream.on("ready",()=>{
        utimesSync(activeDownload.targetPath,{
          btime: video.StartDate.getTime()
        })
        activeDownload.status ="Local File Created";
        observer.next(activeDownload);
      })

      localFileWriteStream.on("close",()=>{
        utimesSync(activeDownload.targetPath,{
          mtime: video.EndDate.getTime(),
          atime: Date.now()
        })
        const partialPath = activeDownload.targetPath;
        activeDownload.targetPath = path.join(activeDownload.targetBase,activeDownload.videoPath.base)
        fs.renameSync(partialPath,activeDownload.targetPath);
        activeDownload.status ="Local File Closed";
        observer.next(activeDownload);
        observer.complete()
      });
    
      const responsePromise = Axios({
        url: activeDownload.url,
        method: "GET",
        responseType: "stream"
      })

      activeDownload.status ="Requested";
      observer.next(activeDownload);
      
  
      responsePromise.then((response)=>{

        this.lastActivity = Date.now();
        activeDownload.status = "Receiving";
        activeDownload.size = Number.parseInt(response.headers["content-length"]);
        if (activeDownload.size !== Number.parseInt(video.SIZE)) {
          throw new Error("Download size doesn't match metadata size")
        }
        observer.next(activeDownload);

        response.data.on("data",(chunk: string) => {
          this.lastActivity = Date.now();
          activeDownload.lastChunkTimestamp = Date.now();
          activeDownload.bytesReceived += chunk.length;
          activeDownload.lastChunkSize = chunk.length;
          observer.next(activeDownload);
        });
        response.data.pipe(localFileWriteStream);
        
        response.data.on("end",()=>{
          this.lastActivity = Date.now();
          activeDownload.lastChunkTimestamp = Date.now();
          observer.next(activeDownload);
        })
        response.data.on("error",(err: any)=>{
          observer.error(err);
        })
      });

      responsePromise.catch((err)=>{
        observer.error(err);
      });
    });

    return o.pipe(share());
  }

  public async FormatMemory() {
    await this.setRecording(false);
    await this.RunCommandWithParam(Command.FORMAT_MEMORY,1);
    await this.setRecording(true);
  }

  public async Reboot() {
    log.info("Rebooting camera...")
    await this.RunCommand(Command.RESTART_CAMERA)
    await this.waitForStatus(false);
    await this.waitForStatus(true);
  }

  public async getFreeSpace(): Promise<string> {
    const response = await this.RunCommandParsed(Command.CARD_FREE_SPACE)
    return `${response.Function.Value / (1024 * 1024)} MB`
  }

  public async getHeartbeat(): Promise<number> {
    const sTime = Date.now();
    await this.RunCommand(Command.HEART_BEAT, 500);
    return this.lastActivity - sTime;
  }

  public async setRecording(record: boolean) {
    return await this.RunCommandWithParam(Command.MOVIE_RECORD, record ? 1 : 0);
  }

  public async waitForStatus(desiredAlive: boolean = true) {
    let alive = false;
    log.info(`Waiting for camera to be ${desiredAlive ? 'online' : 'offline'}`)
    do {
      try {
        await this.getHeartbeat();
        alive = true;
      }
      catch (err) {
        alive = false;
      }
      if (alive == desiredAlive) {
        break;
      }
      else {
        await new Promise<void>((resolve)=>{
          setTimeout(()=>{resolve()},500)
        })
      }
    } while (true)
  }

  // #endregion Public Methods (8)

  // #region Protected Methods (1)

  protected async requestHTTTP() {
    const ROURL = `http://${this.IPAddress}/?custom=1&cmd=${Command.GET_FILE_LIST}`;
    const parseParking = (path: string): RecordingMode => { 
      return (path.includes("Parking") || path.includes("PF.MP4") || path.includes("PR.MP4") || path.includes("PI.MP4")) ? "Parking" : "Normal";
    }
    const parseLens = (path: string): Lens => {
      if (path.match(/F\.(MP4)|(JPG)$/)) {
        return "Front"
      }
      else if(path.match(/I\.(MP4)|(JPG)$/)) {
        return "Interior"
      }
      else if(path.match(/R\.(MP4)|(JPG)$/)) {
        return "Rear"
      }
      throw new Error(`Unknown lens for ${path}`)
    }
    let response: AxiosResponse<any>;
    try {
      response = await Axios.get(ROURL);
    }
    catch(err) {
      throw new Error(`Failed getting metadata: ${(err as Error).message}`);
    }
    this.lastActivity = Date.now();
    const parsed = await xml2js.parseStringPromise(response.data ,{
      explicitArray:false
    });
    try{
      let allFiles: {File: VIOFOVideoBase}[] = [];
      if (Array.isArray(parsed.LIST.ALLFile)) {
        allFiles = parsed.LIST.ALLFile
      }
      else {
        allFiles = [parsed.LIST.ALLFile]
      }
      const allVideos: VIOFOVideoExtended[] = [];
      for(let f of allFiles) {
        const StartDateGroups = f.File.NAME.match(/^(?<year>\d{4})_(?<month>\d{2})(?<day>\d{2})_(?<hour>\d{2})(?<minute>\d{2})(?<second>\d{2})/);
        if ( !StartDateGroups?.groups || !("year" in StartDateGroups?.groups)) {
          log.warn(`Bad file: ${f.File.FPATH}`);
          continue;
        }
        const {year, number, month, day, hour, minute, second } = StartDateGroups.groups
        const startDate = new Date(parseInt(year),parseInt(month)-1,parseInt(day),parseInt(hour),parseInt(minute),parseInt(second));
        const endDate = new Date(f.File.TIME);
        allVideos.push({
          ...f.File,
          RecordingMode: parseParking(f.File.FPATH),
          Lens: parseLens(f.File.FPATH),
          StartDate: startDate,
          EndDate: endDate,
          Duration: endDate.getTime() - startDate.getTime(),
          Locked: f.File.FPATH .includes("RO"),
          Finished: true // TODO: figure out how to figure this out
        })
      }
      this.MetadataStream.next(allVideos);
      this.MetadataStream.complete();
    }
    catch (err) {
      log.log("Failed parsing metadata", err)
      this.MetadataStream.error(err);
    }
  }

  // #endregion Protected Methods (1)

  // #region Private Methods (3)

  private async RunCommand(command: Command, timeout: number = 60000): Promise<AxiosResponse<any,any>> {
    const URL = `http://${this.IPAddress}/?custom=1&cmd=${command}`;
    const response = await Axios.get(URL,{timeout: timeout});
    this.lastActivity = Date.now();
    return response   
  }

  private async RunCommandParsed(command: Command): Promise<any> {
    const response = await this.RunCommand(command);
    return await xml2js.parseStringPromise(response.data ,{
      explicitArray:false
    });
  }

  private async RunCommandWithParam(command: Command, param: string | number): Promise<AxiosResponse<any,any>> {
    const URL = `http://${this.IPAddress}/?custom=1&cmd=${command}&par=${param}`;
    const response = await Axios.get(URL);
    this.lastActivity = Date.now();
    return response;
  }

  public async GetCurrentState(): Promise<SerializedState> {
    const s =  await this.RunCommand(Command.GET_CURRENT_STATE)
    const state = await xml2js.parseStringPromise(s.data,{
      explicitArray:false,

    }) as StateResponse;
    let results: SerializedState = {};
    
    state.Function.Cmd.forEach((v,i)=>{
      results[v] = {
        status: state.Function.Status[i]
      };
    })

    state.Function.Function.forEach((v,i)=>{
      results[v.Cmd] = {
        status: state.Function.Function[i].Status,
        value: state.Function.Function[i].String
      };
    })

    this.state = results;
    
    return results;
  }
}

type SerializedState = Record<string, {status: string, value?: string}>

type StateResponse = {
  Function: {
    Cmd: string[],
    Status: string[],
    Function: {
      Cmd: string,
      Status: string,
      String: string
    }[]
  }
}

class Command {
  // #region Properties (104)

  public static AUTO_POWER_OFF = 3007;
  public static BASE_URL = "http://192.168.1.254";
  public static BEEP_SOUND = 9094;
  public static BLANK_CHAR_REPLACE = "+";
  public static BLANK_CHAR_REPLACE_2 = "*";
  public static BOOT_DELAY = 9424;
  public static CAMERA_MODEL_STAMP = 9216;
  public static CAPTURE_SIZE = 1002;
  public static CARD_FREE_SPACE = 3017;
  public static CAR_NUMBER = 9422;
  public static CHANGE_MODE = 3001;
  public static CUSTOM_TEXT_STAMP = 9417;
  public static DATE_FORMAT = 0;
  public static DEFAULT_IP = "192.168.1.254";
  public static DEFAULT_PORT = 3333;
  public static DELETE_ALL_FILE = 4004;
  public static DELETE_ONE_FILE = 4003;
  public static DISABLE_REAR_CAMERA = 8098;
  public static ENTER_PARKING_MODE_TIMER = 0;
  public static FIRMWARE_VERSION = 3012;
  public static FONT_CAMERA_MIRROR = 0;
  public static FORMAT_MEMORY = 3010;
  public static FREQUENCY = 9406;
  public static FRONT_IMAGE_ROTATE = 0;
  public static FS_UNKNOW_FORMAT = 3025;
  public static GET_BATTERY_LEVEL = 3019;
  public static GET_CARD_STATUS = 3024;
  public static GET_CAR_NUMBER = 9426;
  public static GET_CURRENT_STATE = 3014;
  public static GET_CUSTOM_STAMP = 9427;
  public static GET_FILE_LIST = 3015;
  public static GET_SENSOR_STATUS = 9432;
  public static GET_UPDATE_FW_PATH = 3026;
  public static GET_WIFI_SSID_PASSWORD = 3029;
  public static GPS = 9410;
  public static GPS_INFO_STAMP = 9214;
  public static HDR_TIME = 8251;
  public static HDR_TIME_GET = 8252;
  public static HEART_BEAT = 3016;
  public static IMAGE_ROTATE = 9093;
  public static INTERIOR_CAMERA_MIRROR = 0;
  public static INTERIOR_IMAGE_ROTATE = 0;
  public static IR_CAMERA_COLOR = 9218;
  public static IR_LED = 0;
  public static LANGUAGE = 3008;
  public static LENSES_NUMBER = 8250;
  public static LIVE_VIDEO_SOURCE = 3028;
  public static LIVE_VIEW_BITRATE = 2014;
  public static LIVE_VIEW_URL = "rtsp://192.168.1.254/xxx.mov";
  public static LOGO_STAMP = 9229;
  public static MICROPHONE = 0;
  public static MOTION_DET = 2006;
  public static MOVIE_AUDIO = 2007;
  public static MOVIE_AUTO_RECORDING = 2012;
  public static MOVIE_BITRATE = 9212;
  public static MOVIE_CYCLIC_REC = 2003;
  public static MOVIE_DATE_PRINT = 2008;
  public static MOVIE_EV_INTERIOR = 0;
  public static MOVIE_EV_REAR = 9217;
  public static MOVIE_EXPOSURE = 2005;
  public static MOVIE_GSENSOR_SENS = 2011;
  public static MOVIE_LIVE_VIEW_CONTROL = 2015;
  public static MOVIE_MAX_RECORD_TIME = 2009;
  public static MOVIE_RECORD = 2001;
  public static MOVIE_RECORDING_TIME = 2016;
  // how far into the current recording we are (seconds?)
  public static MOVIE_REC_BITRATE = 2013;
  public static MOVIE_RESOLUTION = 2002;
  public static MOVIE_WDR = 2004;
  public static PARKING_G_SENSOR = 9220;
  public static PARKING_MODE = 9421;
  public static PARKING_MOTION_DETECTION = 9221;
  public static PARKING_RECORDING_GEOFENCING = 0;
  public static PARKING_RECORDING_TIMER = 9428;
  public static PHOTO_AVAIL_NUM = 1003;
  public static PHOTO_CAPTURE = 1001;
  public static REAR_CAMERA_MIRROR = 9219;
  public static REAR_IMAGE_ROTATE = 0;
  public static RECONNECT_WIFI = 3018;
  // works
  public static REMOTE_CONTROL_FUNCTION = 2020;
  public static REMOVE_LAST_USER = 3023;
  public static RESET_SETTING = 3011;
  public static RESOLUTION_FRAMES = 8076;
  public static RESTART_CAMERA = 8230;
  public static SCREEN_SAVER = 9405;
  public static SCREEN_SUFFIX = 4002;
  public static SET_DATE = 3005;
  public static SET_NETWORK_MODE = 3033;
  public static SET_TIME = 3006;
  public static SPEED_UNIT = 9412;
  public static STORAGE_TYPE = 9434;
  public static STREAM_MJPEG = "http://192.168.1.254:8192";
  public static STREAM_VIDEO = "rtsp://192.168.1.254/xxx.mov";
  public static THUMB_SUFFIX = 4001;
  public static TIME_LAPSE_RECORDING = 9201;
  public static TIME_ZONE = 9411;
  public static TRIGGER_RAW_ENCODE = 2017;
  public static TV_FORMAT = 3009;
  public static VOICE_CONTROL = 9453;
  public static VOICE_NOTIFICATION = 0;
  public static VOICE_NOTIFICATION_VOLUME = 8053;
  public static WIFI_CHANNEL = 0;
  public static WIFI_NAME = 3003;
  public static WIFI_PWD = 3004;
  public static WIFI_STATION_CONFIGURATION = 0;

  // #endregion Properties (104)
}
