import { getLogger } from "loglevel";
import fs from "fs";
import path from "path";
import {
  extractAudioStreamFromVideo,
  openFFPlayWithOffset,
} from "./util/ffmpeg-interop";
import {
  NoiseGate, AmplitudeMarker,
} from "./classes/DSP/Gate";
import { filter, last, lastValueFrom } from "rxjs";
import { BandpassFilter } from "./classes/DSP/bandpassFilter";
import { DSPBase } from "./classes/DSP/DSPBase";
import { LowCutFilter } from "./classes/DSP/LowCutFilter";
import * as readline from 'readline';

const log = getLogger("Analyze");
log.enableAll();

async function processFile(filePath: string) {
  try {
    // Specify the input video file
    const inputVideoPath = path.resolve(filePath);

    const audioStream = extractAudioStreamFromVideo(inputVideoPath);
    const source = await DSPBase.WaveToSamples(audioStream);
    //const amplitude = new Amplitude(source);.
    const noLow = new LowCutFilter(source, 1600);
    //const nolowFile = noLow.writeWav("passthrough.wav")
    const beepFilter = new BandpassFilter({format: source.format, stream: noLow.sink},2000,10);
    //const beepFile = beepFilter.writeWav("beepFilter.wav")
    const beepAmplitude = new NoiseGate({format: source.format, stream: beepFilter.sink}, 1000/32768, 500/32768);

    let beeps: AmplitudeMarker[] = [];
    let lastbts = 0;
    beepAmplitude.loudest.subscribe(l=>{
      /*if (lastbts === 0) lastbts = l.timestamp;
      log.debug(`Beep detected at ${l.timestamp} with amplitude ${l.data.avgAmplitude.toFixed(2)} and duration of ${l.data.duration.toFixed(2)} \t\t ${(l.timestamp - lastbts).toFixed(2)} since last`);
      lastbts = l.timestamp*/
      beeps.push(l);
    })

   
   await lastValueFrom(beepAmplitude.loudest).catch(()=>{log.debug("no beeps detected")})
    
    //await Promise.all([nolowFile,beepFile])

    log.debug(`Heard ${beeps.length} beeps`);
  

    /**const toneDetector = new ToneDetector(
        sampleRate,
        2000,
        40,
        0.01,
        400
      );

      const FFT = new FFTUtil(sampleRate);
      */

    //const loudestTimestamp = await detectLoudestSoundInAudioStream(audioStream);

    let dest = ""
    const p = path.parse(inputVideoPath);
    if (beeps.length > 1) {
      await openFFPlayWithOffset(inputVideoPath, beeps[0].timestamp);
      const r = await question("Enter title for video, or x to discard: ");
      if (r != "x") {
        dest = path.resolve(p.dir,"keep",`${p.base}-${r}.mp4`);
      }
      else {
        dest = path.resolve(p.dir,"discard",`${p.base}.mp4`);
      }
    }
    else {
      dest = path.resolve(p.dir,"no-event",`${p.base}.mp4`);
    }
    const destDir = path.dirname(dest);
      if (!fs.existsSync(destDir)){
        fs.mkdirSync(destDir);
      }
      fs.renameSync(inputVideoPath, dest);
      log.info(`Moved ${inputVideoPath} to ${dest}`); 
    log.debug(`done processing ${filePath}`);
    
  } catch (error) {
    console.error("Error:", error);
  }
}

// Function to recursively list all files in a directory and its subdirectories
function getAllFiles(directoryPath: string) {
  const files = fs.readdirSync(directoryPath);
  let fileList: string[] = [];

  files.forEach((file) => {
    const filePath = path.join(directoryPath, file);
    const stat = fs.statSync(filePath);

    if (stat.isDirectory()) {
      // If it's a directory, recursively call the function
      fileList = fileList.concat(getAllFiles(filePath));
    } else {
      // If it's a file, add it to the list
      fileList.push(filePath);
    }
  });

  return fileList;
}


let rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});


const question = (prompt: string) => {
  return new Promise<string>((resolve) => {
    rl.question(prompt, resolve);
  });
};


async function main() {
  const vids = getAllFiles(
    path.resolve(__dirname, "../download/Locked/2023/12")
  ).filter(v=>v.toLowerCase().endsWith(".mp4") && !v.includes("keep") && !v.includes("discard") && !v.includes("no-event"));

  log.info(`Found ${vids.length} files`)
  for (let v of vids) {
    try{ 
      log.info(`Processing ${v}`);
      await processFile(v);
    }
    catch(err){
      log.warn(`Error processing ${v}`, err);
    }
  }
  rl.close();
}

main();
