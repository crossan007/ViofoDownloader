import { ParsedWavSamples } from "./DSPBase";
import { DSPSourceSink } from "./DSPSourceSink";

const Q = 1;

export class LowCutFilter extends DSPSourceSink {
  private cutoffFrequency: number;
  private xn1: number;
  private xn2: number;
  private yn1: number;
  private yn2: number;
  private b0: number;
  private b1: number;
  private b2: number;
  private a0: number;
  private a1: number;
  private a2: number;

  constructor(source: ParsedWavSamples, cutoffFrequency: number) {
    super(source);
    this.sampleRate = source.format.sampleRate; // Sample rate in Hz
    this.cutoffFrequency = cutoffFrequency; // Cutoff frequency of the low cut filter in Hz

    // Filter coefficients
    const w0 = 2 * Math.PI * cutoffFrequency / this.sampleRate;
    const alpha = Math.sin(w0) / (2 * Q); // Q is the quality factor

    // Filter state variables
    this.xn1 = 0; // Input sample at (n-1)
    this.xn2 = 0; // Input sample at (n-2)
    this.yn1 = 0; // Output sample at (n-1)
    this.yn2 = 0; // Output sample at (n-2)

    // Filter coefficients
    this.b0 = (1 + Math.cos(w0)) / 2;
    this.b1 = -(1 + Math.cos(w0));
    this.b2 = (1 + Math.cos(w0)) / 2;
    this.a0 = 1 + alpha;
    this.a1 = -2 * Math.cos(w0);
    this.a2 = 1 - alpha;
  }

  protected processSample(sample: number) {
    // Apply the bandpass filter to the input sample
    const yn =
      (this.b0 / this.a0) * sample +
      (this.b1 / this.a0) * this.xn1 +
      (this.b2 / this.a0) * this.xn2 -
      (this.a1 / this.a0) * this.yn1 -
      (this.a2 / this.a0) * this.yn2;

    // Update state variables
    this.xn2 = this.xn1;
    this.xn1 = sample;
    this.yn2 = this.yn1;
    this.yn1 = yn;

    this.sink.next(yn);
  }
}
