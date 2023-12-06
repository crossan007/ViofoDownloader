import { PassThrough } from "stream";
import { getLogger } from "loglevel";
import { lastValueFrom, ReplaySubject } from "rxjs";
import { Marker } from "./types";
import { DSPBase, ParsedWavSamples } from "./DSPBase";

const log = getLogger("amplitude");
log.enableAll();

type AmplitudeMarker = Marker<{
  amplitude: number;
}>;

export class Amplitude extends DSPBase {
  /**
   * Emits whenever the loudest amplitude is updated.
   */
  public loudest = new ReplaySubject<AmplitudeMarker>(1);
  private loudestAmplitude: number = -Infinity;

  constructor(source: ParsedWavSamples) {
    super(source);
    lastValueFrom(source.stream).then(() => {
      this.loudest.complete();
    });
  }

  protected processSample(sample: number): void {
    const amplitude = Math.abs(sample);
    if (amplitude > this.loudestAmplitude) {
      this.loudestAmplitude = amplitude;
      this.loudest.next({
        timestamp: this.currentTimeStamp,
        sample: this.sampleCounter,
        data: {
          amplitude,
        },
      });
    }
  }
}
