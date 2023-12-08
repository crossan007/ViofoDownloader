import { ReplaySubject } from "rxjs/internal/ReplaySubject";
import { DSPBase, ParsedWavSamples } from "./DSPBase";
import { lastValueFrom } from "rxjs";

export abstract class DSPSourceSink extends DSPBase {


  public sink = new ReplaySubject<number>();
  constructor(source: ParsedWavSamples) {
    super(source);
    lastValueFrom(source.stream).then(() => {
      this.sink.complete();
    }).catch(e=>{
      this.sink.error(e);
    });
  }

}