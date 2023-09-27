export class Queue<T> {
  private items: T[] = [];

   // Implementation of the enqueue method
   enqueue(arg: T | T[]): void {
    if (Array.isArray(arg)) {
      // If the argument is an array, add its elements to the queue
      this.items.push(...arg);
    } else {
      // If the argument is a single item, add it to the queue
      this.items.push(arg);
    }
  }

  // Remove and return the front element of the queue
  dequeue(): T | undefined {
    return this.items.shift();
  }

  // Peek at the front element of the queue without removing it
  peek(): T | undefined {
    return this.items[0];
  }

  // Check if the queue is empty
  isEmpty(): boolean {
    return this.items.length === 0;
  }

  // Get the number of elements in the queue
  size(): number {
    return this.items.length;
  }

  // Clear all elements from the queue
  clear(): void {
    this.items = [];
  }

  get(): T[] {
    return [...this.items]
  }
}
