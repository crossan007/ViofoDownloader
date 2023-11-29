import { MonoTypeOperatorFunction, Observable } from "rxjs";

export function distinctPropertiesChanged<T>(): MonoTypeOperatorFunction<T> {
  let previousValue: T | undefined;

  return (source: Observable<T>) => new Observable<T>(subscriber => {
      return source.subscribe({
          next(value: any) {
              if (previousValue) {
                  const changes: Partial<T> = {};
                  let isDifferent = false;

                  for (const key of Object.keys(value) as Array<keyof T>) {
                      if (value[key] !== previousValue[key]) {
                          changes[key] = value[key];
                          isDifferent = true;
                      }
                  }

                  if (isDifferent) {
                      subscriber.next(changes as T);
                  }
              } else {
                  // If it's the first value, emit the entire value
                  subscriber.next(value);
              }

              previousValue = value;
          },
          error(err) { subscriber.error(err); },
          complete() { subscriber.complete(); }
      });
  });
}