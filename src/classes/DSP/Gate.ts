import { PassThrough } from "stream";
import { getLogger } from "loglevel";
import { lastValueFrom, ReplaySubject } from "rxjs";
import { Marker } from "./types";
import { DSPBase, ParsedWavSamples } from "./DSPBase";

const log = getLogger("amplitude");
log.enableAll();

export type AmplitudeMarker = Marker<{
  avgAmplitude: number;
  duration: number
}>;

export class NoiseGate extends DSPBase {
  /**
   * Emits whenever the loudest amplitude is updated.
   */
  public loudest = new ReplaySubject<AmplitudeMarker>(1);
  private activatedTimestamp: number | null = null;
  private lowSamples: number = 100;
  private totalAmplitude = 0;

  constructor(source: ParsedWavSamples, private activationThreshold: number, private deactivationThreshold: number, private lowSampleTimeout: number = .04 * source.format.sampleRate) {
    super(source);
    lastValueFrom(source.stream).then(() => {
      this.loudest.complete();
    }).catch(e=>{
      this.loudest.error(e);
    });
  }

  protected processSample(sample: number): void {
    const amplitude = Math.abs(sample);

    if (amplitude > this.activationThreshold) {
      if (this.activatedTimestamp === null){
        this.activatedTimestamp = this.currentTimeStamp;
        this.totalAmplitude = 0;
      }

      this.totalAmplitude+= amplitude
    }
    if (this.activatedTimestamp !== null && amplitude < this.deactivationThreshold) {
      if (this.lowSamples < this.lowSampleTimeout) {
        this.lowSamples ++;
      }
      else {
        const duration =  this.currentTimeStamp - this.activatedTimestamp;
        const sampleCount = Math.round(duration * this.sampleRate);
        const marker: AmplitudeMarker = {
          timestamp: this.activatedTimestamp,
          data: {
            avgAmplitude: this.totalAmplitude / sampleCount,
            duration: duration
          },
          sample: sample
        };
        this.loudest.next(marker);
        this.activatedTimestamp = null;
        this.lowSamples = 0;
      }
    }
  }
}
