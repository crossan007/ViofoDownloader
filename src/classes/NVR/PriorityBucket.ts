type BucketFilterFunction<T> = (item: T) => boolean;
type BucketSortFunction<T> = (a: T, b: T) => number;

type Bucket<T> = {
  name: string
  enable: boolean
  filter: BucketFilterFunction<T>
  sort?: BucketSortFunction<T>
}

export class PriorityBucket<T> {

  private buckets: Bucket<T>[] = [];
  private all: T[] = []

  constructor() {}

  public addBucket(order: number, bucket: Bucket<T>) {
    this.buckets[order] = bucket
  }

  public dequeue(): T | undefined {
    const currentBucket = this.buckets
      .find((bucket) => bucket.enable && this.all.filter(bucket.filter).length > 0)
    if (! currentBucket) {
      return undefined;
    }
    const firstItem = this.all.filter(currentBucket.filter)[0]
    this.all.splice(this.all.indexOf(firstItem), 1);

    return firstItem;
  }

  public clear(): void {
    this.all = [];
  }

  public push(item: T | T[]): void {
    if (Array.isArray(item)) {
      // If the argument is an array, add its elements to the queue
      this.all.push(...item);
    } else {
      // If the argument is a single item, add it to the queue
      this.all.push(item);
    }
  }


  
  public GetBucketCounts(): {[key: string]: number} {

    /** 
     *  Iterate all of the buckets in ascending order by the "order" attribute.
     *  Use the "filter" function for each bucket to select items out of "this.all" to create
     *  a temporary array.  Sort the temporary array by the bucket's "sort" function, and add the result
     *  to the output queue.
     * 
     *  Once an item has been added to the queue, it should be removed from "this.all"
     * 
     */

    let bucketCounts: {[key: string]: number} = {};
    let remaining = [...this.all];

    this.buckets.forEach(bucket => {
        let items = remaining.filter(bucket.filter);
        if (bucket.sort) {
          items.sort(bucket.sort);
        }
        remaining = remaining.filter((item) => !items.includes(item));
        bucketCounts[bucket.name] = items.length;
      })
    if(remaining.length > 0) {
      bucketCounts["Unsorted"] = remaining.length;
    }
    return bucketCounts
  
  }

}