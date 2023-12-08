import { PassThrough } from "stream";
import * as wav from "wav";
import { getLogger } from "loglevel";
import { Observable, ReplaySubject, Subject, lastValueFrom } from "rxjs";
import { share } from "rxjs/operators";

const log = getLogger("DSPBase");
log.enableAll();

export const BYTES_PER_SAMPLE = 2;

export type ParsedWavSamples = {format: wav.Format, stream: Observable<number>}

export abstract class DSPBase {
  // #region Properties (4)

  protected currentTimeStamp = 0;
  protected sampleCounter = 0;
  protected sampleRate = 0;

  public streamFormat = new ReplaySubject<wav.Format>();
  

  // #endregion Properties (4)

  // #region Constructors (1)

  /**
   * 
   * @param stream stream of raw samples
   */
  constructor(private source: ParsedWavSamples) {
    this.sampleRate = source.format.sampleRate;
    source.stream.subscribe((chunk) => {
      this.processSample(chunk);
      this.sampleCounter ++;
      this.currentTimeStamp = this.sampleCounter / this.sampleRate;
    });
  }

  // #endregion Constructors (1)

  // #region Public Static Methods (1)

  public static async WaveToSamples(stream: PassThrough): Promise<ParsedWavSamples>{
    const wavReader = new wav.Reader();
    const samplesSource = new Subject<number>();
    const multicast = samplesSource.pipe(share());
    let resolve: (value: ParsedWavSamples) => void;
    const promise = new Promise<ParsedWavSamples>((res, rej) => {
      resolve = res;
    });
    wavReader.on("format", (format) => {
      //log.debug("Format received", format);
      wavReader.on("data", (chunk) => {
        const samples = new Float32Array(chunk.length / BYTES_PER_SAMPLE);
        for (let i = 0; i < chunk.length; i += BYTES_PER_SAMPLE) {
          const sample = chunk.readInt16LE(i) / 32768.0; // Assuming 16-bit PCM
          samples[i / BYTES_PER_SAMPLE] = sample;
          samplesSource.next(sample);
        }
      });
      wavReader.on("end", () => {
        log.debug("End of stream");
        samplesSource.complete();
      });
      wavReader.on("error", (err) => {
        log.error("Error reading wav stream", err);
        samplesSource.error(err);
      });
      resolve({format, stream: multicast});
    });
    stream.pipe(wavReader);
    return promise;
  }

  // #endregion Public Static Methods (1)

  // #region Protected Methods (2)

  protected processSample(sample: number): void {}  

  protected processSamples(samples: Float32Array): void {
    for (const sample of samples) {
      this.processSample(sample);
    }
  }

  public async writeWav(filePath: string): Promise<void> {
    const fmt = { sampleRate: this.source.format.sampleRate, bitDepth: this.source.format.bitDepth, channels: this.source.format.channels };
    const writer = new wav.FileWriter(filePath, fmt);
    let bufferSize = 67584;
    let a = Buffer.alloc(bufferSize)
    let bl = 0;
    this.source.stream.subscribe((sample) => {
      const n = Math.max(Math.min(Math.trunc(sample*32768.0),32767),-32767);
      bl = a.writeInt16LE(n,bl)
      if (bl === bufferSize) {
        bl = 0;
        try {
          // write the number "chunk" as a 16-bit signed integer  
          writer.write(a,"binary");
        }
        catch (err) {
          log.error("Error writing wav file", err);
        }
      }
    });
    await lastValueFrom(this.source.stream);
    writer.end();
  }

  // #endregion Protected Methods (2)

}
