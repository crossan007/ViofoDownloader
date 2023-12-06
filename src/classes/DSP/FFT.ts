import { fft, util } from "fft-js";
import { getLogger } from "loglevel";
import { Readable, PassThrough } from 'stream';


const log = getLogger('FFTUtil');
log.enableAll();


export class FFTUtil {
  private currentTimestamp: number = 0;
  private sampleCounter: number = 0;
  private stream?: PassThrough;
  constructor(private sampleRate: number, private windowSize: number = 256) {}
  

  /**
   * slice samples into 2048 sample chunks and run the hamming window, fft, and findIndexOfHighestMagnitude
   */
  public processSamples(samples: Float32Array): void {
    for (let i = 0; i < samples.length; i += this.windowSize) {
      this.currentTimestamp =
        (this.sampleCounter - samples.length + i) / this.sampleRate; // Calculate current time in seconds
      const windowedAudioData = this.applyHammingWindow(
        samples.slice(i, i + this.windowSize)
      );
      // Perform FFT on the windowed data
      const phasors = fft(windowedAudioData.slice(0, this.windowSize));

      // Convert FFT result to magnitude and phase
      const mags = util.fftMag(phasors);
      const freqs = util.fftFreq(phasors, this.sampleRate);
      const highest = this.findIndexOfHighestMagnitude(mags);
      if (highest.index > 2 && highest.magnitude > 10) {
        log.info(
          `Highest Magnitude ${this.currentTimestamp}:  ${freqs[highest.index]}`,
          highest
        );
      }
    }
  }

  private applyHammingWindow(data: Float32Array): Array<number> {
    const windowedData = new Array<number>(data.length);
    const alpha = 0.54; // Hamming window coefficient (adjust as needed)

    for (let i = 0; i < data.length; i++) {
      const windowValue =
        alpha - (1 - alpha) * Math.cos((2 * Math.PI * i) / (data.length - 1));
      windowedData[i] = data[i] * windowValue;
    }

    return windowedData;
  }

  private findIndexOfHighestMagnitude(mags: number[]): {
    index: number;
    magnitude: number;
  } {
    if (mags.length === 0) {
      return { index: 0, magnitude: 0 }; // Return null for an empty array
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
}
