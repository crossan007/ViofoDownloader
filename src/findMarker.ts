import ffmpeg from 'fluent-ffmpeg';
import { getLogger } from 'loglevel';
import { PassThrough } from 'stream';
import * as wav from 'wav';
import fs from 'fs';
import path from 'path';
import { buffer } from 'rxjs';

const log = getLogger('Analyze');
log.enableAll();

// Specify the input video file
const inputVideoPath = path.resolve(__dirname, '../download/Locked/2023/11/2023_1108_081636_F.MP4');

// Define the specific sound you want to detect (e.g., a keyword or pattern)
const soundToDetect = 'example_sound';

// Output path for the extracted audio
const extractedAudioPath = path.resolve(__dirname, 'extracted_audio.wav');

// Output path for the audio snippet after the loudest sound
const audioSnippetPath = path.resolve(__dirname, 'audio_snippet.wav');

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
    let currentTimeStamp = 0;
    let sampleCounter = 0;
    let bufferWriteOffset = 0;
    let fmt: wav.Format;

    reader.on('format', (format) => {
      fmt = format;
      const sampleRate = format.sampleRate;
      audioBuffer = Buffer.alloc(bytesPerSample*(sampleRate * extractTimeSeconds),0,"binary");
      const chunkSize = sampleRate * 1; // Adjust the chunk size as needed

      reader.on('data', (chunk: Buffer) => {
        const samples = new Float32Array(chunk.length / bytesPerSample);
        for (let i = 0; i < chunk.length; i += bytesPerSample) {
          const sample = chunk.readInt16LE(i) / 32768.0; // Assuming 16-bit PCM
          samples[i / bytesPerSample] = sample;

          // Calculate amplitude (you can use a different metric if needed)
          const amplitude = Math.abs(sample);
          if (amplitude > loudestAmplitude) {
            loudestAmplitude = amplitude;
            loudestTimestamp = currentTimeStamp;
            bufferWriteOffset = 0;
          }
          if (bufferWriteOffset/bytesPerSample < extractTimeSeconds*sampleRate) {
            bufferWriteOffset = audioBuffer.writeInt16LE(sample * 32768.0 ,bufferWriteOffset)
          }
          currentTimeStamp = sampleCounter / sampleRate; // Calculate current time in seconds
          sampleCounter++;
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
          log.debug("next");
          
        }
        resolve(loudestTimestamp);
      } else {
        reject(new Error('No sound detected.'));
      }
    });

  });
}

async function main() {
  try {
    const audioStream = extractAudioStreamFromVideo(inputVideoPath);
    const loudestTimestamp = await detectLoudestSoundInAudioStream(audioStream);
    log.debug(`Loudest timestamp ${loudestTimestamp}`);

    if (loudestTimestamp >= 0) {
      // Continue processing or extracting audio as needed
    }
  } catch (error) {
    console.error('Error:', error);
  }
}

main();
