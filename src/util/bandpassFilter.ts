export class BandpassFilter {
  sampleRate: number;
  centerFrequency: number;
  bandwidth: number;
  xn1: number;
  xn2: number;
  yn1: number;
  yn2: number;
  b0: number;
  b1: number;
  b2: number;
  a0: number;
  a1: number;
  a2: number;
  constructor(sampleRate: number, centerFrequency: number, bandwidth: number) {
    this.sampleRate = sampleRate; // Sample rate in Hz
    this.centerFrequency = centerFrequency; // Center frequency of the bandpass filter in Hz
    this.bandwidth = bandwidth; // Bandwidth of the filter in Hz

    // Filter coefficients
    const w0 = (2 * Math.PI * centerFrequency) / sampleRate;
    const Q = centerFrequency / bandwidth;
    const alpha = Math.sin(w0) / (2 * Q);

    // Filter state variables
    this.xn1 = 0; // Input sample at (n-1)
    this.xn2 = 0; // Input sample at (n-2)
    this.yn1 = 0; // Output sample at (n-1)
    this.yn2 = 0; // Output sample at (n-2)

    // Filter coefficients
    this.b0 = alpha;
    this.b1 = 0;
    this.b2 = -alpha;
    this.a0 = 1 + alpha;
    this.a1 = -2 * Math.cos(w0);
    this.a2 = 1 - alpha;
  }

  filter(sample: number) {
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

    return yn;
  }
}

