import { getLogger } from "loglevel";
import fs from "fs";
import path from "path";
import {
  extractAudioStreamFromVideo,
  openFFPlayWithOffset,
} from "./util/ffmpeg-interop";
import {
  Amplitude,
} from "./classes/DSP/amplitude";
import { lastValueFrom } from "rxjs";
import { BandpassFilter } from "./classes/DSP/bandpassFilter";
import { PassThrough } from "stream";
import { DSPBase } from "./classes/DSP/DSPBase";


const log = getLogger("Analyze");
log.enableAll();

async function processFile(filePath: string) {
  try {
    // Specify the input video file
    const inputVideoPath = path.resolve(filePath);

    const audioStream = extractAudioStreamFromVideo(inputVideoPath);
    const source = await DSPBase.WaveToSamples(audioStream);
    //const amplitude = new Amplitude(source);
    const beepFilter = new BandpassFilter(source,2000,20);
    const beepAmplitude = new Amplitude({format: source.format, stream: beepFilter.filteredStream});

    beepAmplitude.loudest.subscribe(l=>{
      log.debug(`Beep detected at ${l.timestamp}`)
    })

    const lb = await lastValueFrom(beepAmplitude.loudest);

    log.debug(`Loudest beep`, lb );
  

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


    //await openFFPlayWithOffset(inputVideoPath, loudestTimestamp);
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

async function main() {
  const vids = getAllFiles(
    path.resolve(__dirname, "../download/Locked/2023/11")
  );
  for (let v of vids) {
    log.info(`Processing ${v}`);
    await processFile(v);
  }
}

main();
