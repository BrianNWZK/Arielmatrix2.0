export class InfiniteScalabilityEngine {
  constructor() {
    this.queue = [];
  }

  async enqueue(task) {
    this.queue.push(task);
  }

  async process() {
    while (this.queue.length) {
      const task = this.queue.shift();
      await task();
    }
  }
}
