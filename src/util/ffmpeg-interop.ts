import path, { resolve } from 'path';
import fs from "fs";
import { spawn } from "child_process"
import ffmpeg from 'fluent-ffmpeg';
import { PassThrough } from 'stream';
import { getLogger } from "loglevel";

const log = getLogger('ffmpeg interop');
log.enableAll();

export async function openVLCWithOffset(filename: string, offsetSeconds: number, durationSeconds=5): Promise<void> {
  return new Promise<void>((res, reject) => {
    // Specify the full path to the VLC executable (adjust as needed)
    const vlcPath = 'C:\\Program Files (x86)\\VideoLAN\\VLC\\vlc.exe';

    const fullFilePath = resolve(filename);

    const vlcProcess = spawn(vlcPath, [fullFilePath, `--start-time=${offsetSeconds}`, '--run-time=${durationSeconds}']);

    vlcProcess.on('error', (err) => {
      log.error('Error starting VLC:', err);
      reject(err);
    });

    vlcProcess.on('close', (code) => {
      if (code === 0) {
        log.log('VLC closed successfully.');
        res();
      } else {
        log.error(`VLC exited with code ${code}`);
        reject(new Error(`VLC exited with code ${code}`));
      }
    });
  });
}


export async function openFFPlayWithOffset(filename: string, offsetSeconds: number, durationSeconds=3): Promise<void> {
  return new Promise<void>((res, reject) => {
    // Specify the full path to the ffplay executable (adjust as needed)
    const ffplayPath = path.normalize('C:\\ProgramData\\chocolatey\\bin\\ffplay.exe');

    const fullFilePath = path.normalize(filename);
    if (! fs.existsSync(ffplayPath)) {
      throw new Error("missing file1")
    }

    if (! fs.existsSync(fullFilePath)) {
      throw new Error("missing file1")
    }

    const ffplayProcess = spawn(ffplayPath, [`"${filename}"`,`-ss ${offsetSeconds}`, `-t ${durationSeconds}`, `-x 640`, `-autoexit`],{windowsVerbatimArguments: true, shell: "cmd.exe"});
    
    ffplayProcess.stdout.on("data",(chunk)=>{
      //log.log(chunk.toString())
    })

    ffplayProcess.stderr.on("data",(chunk)=>{
      //log.log(chunk.toString())
    })

    ffplayProcess.on("message",(chunk)=>{
      //log.log(chunk.toString())
    })

    ffplayProcess.on('error', (err) => {
      log.error('Error starting ffplay:', err);
      reject(err);
    });

    ffplayProcess.on('close', (code) => {
      if (code === 0) {
        log.log('ffplay closed successfully.');
        res();
      } else {
        log.error(`ffplay exited with code ${code}`);
        reject(new Error(`ffplay exited with code ${code}`));
      }
    });
  });
}

export function extractAudioStreamFromVideo(videoPath: string): PassThrough {
  const audioStream = new PassThrough();
  ffmpeg()
    .input(videoPath)
    .audioCodec('pcm_s16le')
    .toFormat('wav')
    .audioChannels(1)
    .on('error', function (err) {
      log.error('ffmpeg stream error occurred: ' + err.message);
    })
    .on('end', function () {
      log.info('ffmpeg processing finished');
    })
    .pipe(audioStream);
  return audioStream;
}