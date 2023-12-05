// fft-js.d.ts

declare module 'fft-js' {
  // Define complex number representation
  interface Complex {
    re: number; // Real part
    im: number; // Imaginary part
  }

  // Function to calculate FFT
  export function fft(inputData: number[]): Complex[];

  // Function to calculate inverse FFT
  export function ifft(inputData: Complex[]): number[];

  // Utility functions
  export module util {
    // Function to calculate magnitude from phasors
    export function fftMag(phasors: Complex[]): number[];

    // Function to calculate phase from phasors
    export function fftPha(phasors: Complex[]): number[];
    export function fftFreq(phasors: Complex[], sampleRate: number): number[];
  }
}
