import { Queue } from "../Queue";

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

  constructor(private all: T[] = []) {
  }

  public addBucket(order: number, bucket: Bucket<T>) {
    this.buckets[order] = bucket
  }

  
  public GetQueue(): {fullQueue: Queue<T>, bucketCounts: {[key: string]: number}} {

    /** 
     *  Iterate all of the buckets in ascending order by the "order" attribute.
     *  Use the "filter" function for each bucket to select items out of "this.all" to create
     *  a temporary array.  Sort the temporary array by the bucket's "sort" function, and add the result
     *  to the output queue.
     * 
     *  Once an item has been added to the queue, it should be removed from "this.all"
     * 
     */

    let fullQueue = new Queue<T>();
    let bucketCounts: {[key: string]: number} = {};
    let remaining = [...this.all];

    this.buckets.forEach(bucket => {
        let items = remaining.filter(bucket.filter);
        if (bucket.sort) {
          items.sort(bucket.sort);
        }
        if (bucket.enable) {
          fullQueue.enqueue(items);
        }
        remaining = remaining.filter((item) => !items.includes(item));
        bucketCounts[bucket.name] = items.length;
      })
    if(remaining.length > 0) {
      fullQueue.enqueue(remaining);
      bucketCounts["Unsorted"] = remaining.length;
    }

    return {
      fullQueue,
      bucketCounts
    }

  }

}