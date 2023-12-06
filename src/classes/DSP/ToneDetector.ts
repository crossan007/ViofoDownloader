import { BandpassFilter } from './bandpassFilter'; // Replace with your bandpass filter implementation
import { Subject, Observable } from 'rxjs';

export interface ToneEvent {
  type: 'tone-start' | 'tone-end';
  sampleCounter: number;
}

export class ToneDetector {
  private sampleRate: number;
  private centerFrequency: number;
  private bandwidth: number;
  private threshold: number;
  private durationThreshold: number;
  private filter: BandpassFilter;
  private toneStarted: boolean;
  private sampleCounter: number;
  private consecutiveLowAmplitudeSamples: number;
  private toneEventSubject: Subject<ToneEvent>;

  constructor(
    sampleRate: number,
    centerFrequency: number,
    bandwidth: number,
    threshold: number,
    durationThreshold: number
  ) {
    this.sampleRate = sampleRate;
    this.centerFrequency = centerFrequency;
    this.bandwidth = bandwidth;
    this.threshold = threshold;
    this.durationThreshold = durationThreshold;
    this.filter = new BandpassFilter(sampleRate, centerFrequency, bandwidth);
    this.toneStarted = false;
    this.sampleCounter = 0;
    this.consecutiveLowAmplitudeSamples = 0;
    this.toneEventSubject = new Subject<ToneEvent>();
  }

  processSample(sample: number): void {
    const amplitude = this.filter.filterAndGetAmplitude(sample);
    this.sampleCounter++;

    if (amplitude < this.threshold) {
      this.consecutiveLowAmplitudeSamples++;
    } else {
      this.consecutiveLowAmplitudeSamples = 0;
    }

    if (this.consecutiveLowAmplitudeSamples >= this.durationThreshold) {
      if (this.toneStarted) {
        this.toneStarted = false;
        this.toneEventSubject.next({ type: 'tone-end', sampleCounter: this.sampleCounter });
      }
    } else {
      if (!this.toneStarted) {
        this.toneStarted = true;
        this.toneEventSubject.next({ type: 'tone-start', sampleCounter: this.sampleCounter });
      }
    }
  }

  getObservable(): Observable<ToneEvent> {
    return this.toneEventSubject.asObservable();
  }

  // Cleanup and unsubscribe when no longer needed
  unsubscribe(): void {
    this.toneEventSubject.complete();
  }
}