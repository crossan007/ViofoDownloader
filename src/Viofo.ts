import  Axios, { AxiosResponse } from "axios";
import { BehaviorSubject, scan, Subject } from "rxjs";
import { DashCam } from "./DashCam";
import xml2js from "xml2js"
import fs from "fs"
import path from "path"
import ProgressBar from "progress";
import { utimesSync } from 'utimes';

interface VIOFOVideoBase  {
  NAME: string
  FPATH: string
  SIZE: string
  TIMECODE: string
  TIME: string
  ATTR: string
}

type Lens = "Front" | "Rear" | "Interior";
type RecordingMode = "Parking" | "Normal";
export interface VIOFOVideoExtended extends VIOFOVideoBase {
  Lens: Lens
  RecordingMode: RecordingMode
  StartDate: Date
  EndDate: Date
  Duration: number
  Locked: boolean
  Finished: boolean
}


export class ViofoCam extends DashCam<VIOFOVideoExtended> {
  // #region Constructors (1)

  constructor(private IPAddress: string, private OnlyLocked: boolean = true) {
    super();
  }

  // #endregion Constructors (1)

  // #region Public Methods (2)

  public async DeleteVideo(video: VIOFOVideoExtended): Promise<void> {
    const response = await Axios({
      url: `http://${this.IPAddress}/?custom=1&cmd=4003&str=${video.FPATH}`,
      method: "GET",
    })
    console.log(`Deleted ${video.FPATH}`)
  }

  public async DownloadVideo(video: VIOFOVideoExtended): Promise<void> {
    const videoPath = path.parse(video.FPATH);
    const targetBase = path.join(this.getLocalDownloadDir(),`${video.Locked ? "Locked" : ""}`,`${video.StartDate.getFullYear()}`,`${video.StartDate.getUTCMonth()+1}`)
    const targetPath = path.join(targetBase,videoPath.base)
    fs.mkdirSync(targetBase,{recursive: true})
    
    
    const url = `http://${this.IPAddress}${video.FPATH.replace(/\\/gm,"/").split(":")[1]}`;
    console.log(`Downloading ${url} to ${targetPath}`)
    const response = await Axios({
      url: url,
      method: "GET",
      responseType: "stream"
    })

    let ws = fs.createWriteStream(targetPath);
    ws.on("ready",()=>{
      utimesSync(targetPath,{
        btime: video.StartDate.getTime()
      })
    })
    ws.on("close",()=>{
      utimesSync(targetPath,{
        mtime: video.EndDate.getTime(),
        atime: Date.now()
      })
    });

    const progressBar = new ProgressBar('-> downloading [:bar] :percent :etas :currM MB', {
      width: 40,
      complete: '=',
      incomplete: ' ',
      renderThrottle: 250,
      total: parseInt(response.headers['content-length']),

    })

    response.data.on("data",(chunk: string) => {
      let curr = progressBar.curr + chunk.length;
      progressBar.tick(chunk.length, {'currM': (curr / 1024000).toFixed(2)})
    });
    response.data.pipe(ws);
    
    await new Promise<void>((resolve,reject)=>{
      
      response.data.on("end",()=>{
        resolve();
      })
      response.data.on("error",(err: any)=>{
        reject(err)
      })
    })
    
  }

  // #endregion Public Methods (2)

  // #region Protected Methods (1)

  protected async requestHTTTP() {
    const ROURL = `http://${this.IPAddress}/?custom=1&cmd=${Command.GET_FILE_LIST}`;
    const parseParking = (path: string): RecordingMode => { 
      return (path.includes("Parking") || path.includes("PF.MP4") || path.includes("PR.MP4")) ? "Parking" : "Normal";
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
    try {
      const response = await Axios.get(ROURL);
      const parsed = await xml2js.parseStringPromise(response.data ,{
        explicitArray:false
      });

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
          console.warn(`Bad file: ${f.File.FPATH}`);
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
      console.log(err)
      this.MetadataStream.error(err);
    }
  }

  public async getHeartbeat(): Promise<number> {
    const sTime = Date.now();
    await this.RunCommand(Command.HEART_BEAT, 500);
    return Date.now() - sTime;
  }

  public async getFreeSpace(): Promise<string> {
    const response = await this.RunCommandParsed(Command.CARD_FREE_SPACE)
    return `${response.Function.Value / (1024 * 1024)} MB`
  }

  private async RunCommandParsed(command: Command): Promise<any> {
    const response = await this.RunCommand(command);
    return await xml2js.parseStringPromise(response.data ,{
      explicitArray:false
    });
  }

  public async FormatMemory() {
    await this.setRecording(false);
    await this.RunCommandWithParam(Command.FORMAT_MEMORY,1);
    await this.setRecording(true);
  }

  public async Reboot() {
    console.info("Rebooting camera...")
    await this.RunCommand(Command.RESTART_CAMERA)
    await this.waitForStatus(false);
    await this.waitForStatus(true);
   
  }

  public async waitForStatus(desiredAlive: boolean = true) {
    let alive = false;
    console.info(`Waiting for camera to be ${desiredAlive ? 'online' : 'offline'}`)
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

  public async setRecording(record: boolean) {
    return await this.RunCommandWithParam(Command.MOVIE_RECORD, record ? 1 : 0);
  }

  private async RunCommandWithParam(command: Command, param: string | number): Promise<AxiosResponse<any,any>> {
    const URL = `http://${this.IPAddress}/?custom=1&cmd=${command}&par=${param}`;
    const response = await Axios.get(URL);
    return response;
   
  }


  private async RunCommand(command: Command, timeout: number = 60000): Promise<AxiosResponse<any,any>> {
    const URL = `http://${this.IPAddress}/?custom=1&cmd=${command}`;
    const response = await Axios.get(URL,{timeout: timeout});
    return response   
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
    
    return results
  }

  // #endregion Protected Methods (1)

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
  static GET_CURRENT_STATE = 3014;
  static AUTO_POWER_OFF = 3007;
  static BASE_URL = "http://192.168.1.254";
  static BEEP_SOUND = 9094;
  static BLANK_CHAR_REPLACE = "+";
  static BLANK_CHAR_REPLACE_2 = "*";
  static BOOT_DELAY = 9424;
  static CAMERA_MODEL_STAMP = 9216;
  static CAPTURE_SIZE = 1002;
  static CARD_FREE_SPACE = 3017;
  static CAR_NUMBER = 9422;
  static CHANGE_MODE = 3001;
  static CUSTOM_TEXT_STAMP = 9417;
  static DATE_FORMAT = 0;
  static DEFAULT_IP = "192.168.1.254";
  static DEFAULT_PORT = 3333;
  static DELETE_ALL_FILE = 4004;
  static DELETE_ONE_FILE = 4003;
  static DISABLE_REAR_CAMERA = 8098;
  static ENTER_PARKING_MODE_TIMER = 0;
  static FIRMWARE_VERSION = 3012;
  static FONT_CAMERA_MIRROR = 0;
  static FORMAT_MEMORY = 3010;
  static FREQUENCY = 9406;
  static FRONT_IMAGE_ROTATE = 0;
  static FS_UNKNOW_FORMAT = 3025;
  static GET_BATTERY_LEVEL = 3019;
  static GET_CARD_STATUS = 3024;
  static GET_CAR_NUMBER = 9426;
  static GET_CUSTOM_STAMP = 9427;
  static GET_FILE_LIST = 3015;
  static GET_SENSOR_STATUS = 9432;
  static GET_UPDATE_FW_PATH = 3026;
  static GET_WIFI_SSID_PASSWORD = 3029;
  static GPS = 9410;
  static GPS_INFO_STAMP = 9214;
  static HDR_TIME = 8251;
  static HDR_TIME_GET = 8252;
  static HEART_BEAT = 3016;
  static IMAGE_ROTATE = 9093;
  static INTERIOR_CAMERA_MIRROR = 0;
  static INTERIOR_IMAGE_ROTATE = 0;
  static IR_CAMERA_COLOR = 9218;
  static IR_LED = 0;
  static LANGUAGE = 3008;
  static LENSES_NUMBER = 8250;
  static LIVE_VIDEO_SOURCE = 3028;
  static LIVE_VIEW_BITRATE = 2014;
  static LIVE_VIEW_URL = "rtsp://192.168.1.254/xxx.mov";
  static LOGO_STAMP = 9229;
  static MICROPHONE = 0;
  static MOTION_DET = 2006;
  static MOVIE_AUDIO = 2007;
  static MOVIE_AUTO_RECORDING = 2012;
  static MOVIE_BITRATE = 9212;
  static MOVIE_CYCLIC_REC = 2003;
  static MOVIE_DATE_PRINT = 2008;
  static MOVIE_EV_INTERIOR = 0;
  static MOVIE_EV_REAR = 9217;
  static MOVIE_EXPOSURE = 2005;
  static MOVIE_GSENSOR_SENS = 2011;
  static MOVIE_LIVE_VIEW_CONTROL = 2015;
  static MOVIE_MAX_RECORD_TIME = 2009;
  static MOVIE_RECORD = 2001;
  static MOVIE_RECORDING_TIME = 2016; // how far into the current recording we are (seconds?)
  static MOVIE_REC_BITRATE = 2013;
  static MOVIE_RESOLUTION = 2002;
  static MOVIE_WDR = 2004;
  static PARKING_G_SENSOR = 9220;
  static PARKING_MODE = 9421;
  static PARKING_MOTION_DETECTION = 9221;
  static PARKING_RECORDING_GEOFENCING = 0;
  static PARKING_RECORDING_TIMER = 9428;
  static PHOTO_AVAIL_NUM = 1003;
  static PHOTO_CAPTURE = 1001;
  static REAR_CAMERA_MIRROR = 9219;
  static REAR_IMAGE_ROTATE = 0;
  static RECONNECT_WIFI = 3018; // works
  static REMOTE_CONTROL_FUNCTION = 2020;
  static REMOVE_LAST_USER = 3023;
  static RESET_SETTING = 3011;
  static RESOLUTION_FRAMES = 8076;
  static RESTART_CAMERA = 8230;
  static SCREEN_SUFFIX= 4002;
  static SCREEN_SAVER = 9405;
  static SET_DATE = 3005;
  static SET_NETWORK_MODE = 3033;
  static SET_TIME = 3006;
  static SPEED_UNIT = 9412;
  static STORAGE_TYPE = 9434;
  static STREAM_MJPEG = "http://192.168.1.254:8192";
  static STREAM_VIDEO = "rtsp://192.168.1.254/xxx.mov";
  static THUMB_SUFFIX = 4001;
  static TIME_LAPSE_RECORDING = 9201;
  static TIME_ZONE = 9411;
  static TRIGGER_RAW_ENCODE = 2017;
  static TV_FORMAT = 3009;
  static VOICE_CONTROL = 9453;
  static VOICE_NOTIFICATION = 0;
  static VOICE_NOTIFICATION_VOLUME = 8053;
  static WIFI_CHANNEL = 0;
  static WIFI_NAME = 3003;
  static WIFI_PWD = 3004;
  static WIFI_STATION_CONFIGURATION = 0;
}
