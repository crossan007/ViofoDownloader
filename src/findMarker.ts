import ffmpeg from 'fluent-ffmpeg';
import fs from 'fs';
import { getLogger } from 'loglevel';
import { Readable, PassThrough } from 'stream';
import * as wav from 'wav';

import path from "path";
const log = getLogger("Analyze");
log.enableAll();

// Specify the input video file
const inputVideoPath = path.resolve(__dirname,'../download/Locked/2023/11/2023_1108_081329_F.MP4');

// Define the specific sound you want to detect (e.g., a keyword or pattern)
const soundToDetect = 'example_sound';

function extractAudioStreamFromVideo(videoPath: string): PassThrough {
  const audioStream = new PassThrough();
  ffmpeg()
    .input(videoPath)
    .audioCodec('pcm_s16le')
    .toFormat('wav')
    .audioChannels(1)
    .on('error', function(err) {
      log.error('An error occurred: ' + err.message);
    })
    .on('end', function() {
      log.info('Processing finished !');
    })
    .pipe(audioStream);
  return audioStream;
}

async function detectSoundInAudioStream(audioStream: Readable, soundToDetect: string) {
  const reader = new wav.Reader();

  audioStream.pipe(reader);

  reader.on('format', (format) => {
    const sampleRate = format.sampleRate;
    const chunkSize = sampleRate * 1; // Adjust the chunk size as needed

    reader.on('data', (chunk) => {
      // Process audio chunk (samples)
      const samples = new Float32Array(chunk.length / 2);
      for (let i = 0; i < chunk.length; i += 2) {
        const sample = chunk.readInt16LE(i) / 32768.0; // Assuming 16-bit PCM
        samples[i / 2] = sample;
      }

      // Implement your sound detection logic here
      for (let i = 0; i < samples.length; i++) {
        if (Math.abs(samples[i] - parseFloat(soundToDetect)) < 0.01) {
          console.log(`Sound "${soundToDetect}" found in the audio.`);
          return; // Stop processing further chunks
        }
      }
    });
  });

  reader.on('end', () => {
    console.log('Audio stream processing finished.');
  });
}

async function main() {
  try {
    const audioStream = extractAudioStreamFromVideo(inputVideoPath);
    await detectSoundInAudioStream(audioStream, soundToDetect);
  } catch (error) {
    console.error('Error:', error);
  }
}

main();
