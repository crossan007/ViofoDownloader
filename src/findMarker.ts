import ffmpeg from 'fluent-ffmpeg';
import { getLogger } from 'loglevel';
import { PassThrough } from 'stream';
import * as wav from 'wav';
import fs from 'fs';
import path from 'path';
import { openFFPlayWithOffset } from './VLC';
import {fft, util } from 'fft-js';
import { BandpassFilter } from './util/bandpassFilter';

const log = getLogger('Analyze');
log.enableAll();

// Output path for the extracted audio
const extractedAudioPath = path.resolve(__dirname, 'extracted_audio.wav');

function extractAudioStreamFromVideo(videoPath: string): PassThrough {
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

async function detectLoudestSoundInAudioStream(audioStream: PassThrough): Promise<number> {
  return new Promise<number>((resolve, reject) => {
    const reader = new wav.Reader();
    const extractTimeSeconds = 4;
    const bytesPerSample = 2;
    let audioBuffer: Buffer;

    audioStream.pipe(reader);

    let loudestAmplitude = -Infinity;
    let loudestTimestamp = -1;
    let currentTimeStampA = 0;
    let currentTimeStampB = 0;
    let sampleCounter = 0;
    let bufferWriteOffset = 0;
    let fmt: wav.Format;

    reader.on('format', (format) => {
      fmt = format;
      const sampleRate = format.sampleRate;
      const targetFreq = 2000;
      const bpf = new BandpassFilter(format.sampleRate, targetFreq, 20);
      audioBuffer = Buffer.alloc(bytesPerSample*(sampleRate * extractTimeSeconds),0,"binary");
      const chunkSize = sampleRate * 1; // Adjust the chunk size as needed

      reader.on('data', (chunk: Buffer) => {
        const samples = new Float32Array(chunk.length / bytesPerSample);
        for (let i = 0; i < chunk.length; i += bytesPerSample) {
          const sample = chunk.readInt16LE(i) / 32768.0; // Assuming 16-bit PCM
          samples[i / bytesPerSample] = sample;
          // Calculate amplitude (you can use a different metric if needed)
          const amplitude = Math.abs(bpf.filter(sample));
          const threshold = 0.017;
          if (amplitude > threshold) {
            log.debug(`Amplitude of ${targetFreq}hz @ ${currentTimeStampA}: ${amplitude}`);
            loudestAmplitude = amplitude;
            loudestTimestamp = currentTimeStampA;
            bufferWriteOffset = 0;
          }
          if (bufferWriteOffset/bytesPerSample < extractTimeSeconds*sampleRate) {
            bufferWriteOffset = audioBuffer.writeInt16LE(sample * 32768.0 ,bufferWriteOffset)
          }
          currentTimeStampA = sampleCounter / sampleRate; // Calculate current time in seconds
          sampleCounter++;
        }

        const windowSize = 256;
        /**
         * slice samples into 2048 sample chunks and run the hamming window, fft, and findIndexOfHighestMagnitude
         */
        return;
        for(let i = 0; i < samples.length; i+=windowSize) {
          currentTimeStampB = (sampleCounter - samples.length + i) / sampleRate; // Calculate current time in seconds
          const windowedAudioData = applyHammingWindow(samples.slice(i,i+windowSize));
          // Perform FFT on the windowed data
          const phasors = fft(windowedAudioData.slice(0,windowSize));

          // Convert FFT result to magnitude and phase
          const mags = util.fftMag(phasors);
          const freqs = util.fftFreq(phasors,sampleRate);
          const highest = findIndexOfHighestMagnitude(mags);
          if(highest.index > 2 && highest.magnitude > 10 ) {
            log.info(`Highest Magnitude ${currentTimeStampB}:  ${freqs[highest.index]}`,highest);
          }
        }
      });
    });

    reader.on('end', async () => {
      if (loudestAmplitude !== -Infinity) {
          // When the stream closes, write the audio buffer to the extracted audio file
        if (audioBuffer.length > 0) {
          const writer = new wav.FileWriter(extractedAudioPath,{ sampleRate: fmt.sampleRate, bitDepth: fmt.bitDepth, channels: fmt.channels });
          writer.write(audioBuffer,"binary",()=>{
            log.info(`Extracted audio written to ${extractedAudioPath}`)
          });          
        }
        resolve(loudestTimestamp);
      } else {
        reject(new Error('No sound detected.'));
      }
    });

  });
}

function findIndexOfHighestMagnitude(mags: number[]): {index: number, magnitude: number} {
  if (mags.length === 0) {
    return {index: 0, magnitude: 0}; // Return null for an empty array
  }

  let highestMagnitude = mags[0]; // Initialize with the first magnitude
  let indexOfHighestMagnitude = 0; // Initialize with the index of the first magnitude

  for (let i = 1; i < mags.length; i++) {
    if (mags[i] > highestMagnitude) {
      highestMagnitude = mags[i]; // Update the highest magnitude
      indexOfHighestMagnitude = i; // Update the index of the highest magnitude
    }
  }

  return {
    index: indexOfHighestMagnitude,
    magnitude: highestMagnitude,
  };
}



function applyHammingWindow(data: Float32Array): Array<number> {
  const windowedData = new Array<number>(data.length);
  const alpha = 0.54; // Hamming window coefficient (adjust as needed)

  for (let i = 0; i < data.length; i++) {
    const windowValue = alpha - (1 - alpha) * Math.cos((2 * Math.PI * i) / (data.length - 1));
    windowedData[i]=(data[i] * windowValue);
  }

  return windowedData;
}

async function processFile(filePath: string) {
  try {
    // Specify the input video file
    const inputVideoPath = path.resolve(filePath);
    const audioStream = extractAudioStreamFromVideo(inputVideoPath);
    const loudestTimestamp = await detectLoudestSoundInAudioStream(audioStream);
    log.debug(`Loudest timestamp ${loudestTimestamp}`);

    
    await openFFPlayWithOffset(inputVideoPath, loudestTimestamp);
   
  } catch (error) {
    console.error('Error:', error);
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
  const vids = getAllFiles(path.resolve(__dirname,"../download/Locked/2023/11"));
  for (let v of vids) {
    log.info(`Processing ${v}`);
    await processFile(v);
  }
}

main();
