export class ReadyQueue {
  private readonly queue: string[] = [];
  private readonly enqueued = new Set<string>();

  enqueue(userId: string): void {
    if (this.enqueued.has(userId)) return;
    this.queue.push(userId);
    this.enqueued.add(userId);
  }

  dequeue(): string | undefined {
    const userId = this.queue.shift();
    if (userId !== undefined) {
      this.enqueued.delete(userId);
    }
    return userId;
  }

  has(userId: string): boolean {
    return this.enqueued.has(userId);
  }

  size(): number {
    return this.queue.length;
  }
}


