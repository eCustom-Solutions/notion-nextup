import { ReadyQueue } from './ready-queue';
import { PerUserStateStore } from './per-user-state';
import { invokePipeline } from '../runtime/invoke-pipeline';

export interface WorkerConfig {
  enableLogging?: boolean;
  processUser?: (userId: string, userName: string) => Promise<void>;
}

export class SingleWorker {
  private running = false;
  private shouldStop = false;

  constructor(
    private readonly store: PerUserStateStore,
    private readonly readyQueue: ReadyQueue,
    private readonly config: WorkerConfig
  ) {}

  start(): void {
      if (this.running) return;
      this.running = true;
      this.shouldStop = false;
      this.loop().catch((e) => {
        console.error('Worker loop error:', e);
        this.running = false;
      });
  }

  stop(): void {
    this.shouldStop = true;
  }

  private async loop(): Promise<void> {
    // eslint-disable-next-line no-constant-condition
    while (!this.shouldStop) {
      const userId = this.readyQueue.dequeue();
      if (!userId) {
        await new Promise((r) => setTimeout(r, 25));
        continue;
      }

      const state = this.store.get(userId);
      if (!state) {
        continue;
      }

      state.inQueue = false;
      state.isProcessing = true;
      state.rerunRequested = false;

      try {
        if (this.config.processUser) {
          await this.config.processUser(userId, state.userName);
        } else {
          await invokePipeline(userId, state.userName);
        }
      } catch (e: any) {
        const errInfo = {
          name: e?.name,
          message: e?.message,
          code: e?.code,
          status: e?.status,
          body: e?.body,
          stack: e?.stack,
        };
        console.error(`❌ Error processing user ${state.userName} (${userId})`, errInfo);
      } finally {
        state.isProcessing = false;
        if (state.rerunRequested && !state.inQueue) {
          this.readyQueue.enqueue(userId);
          state.inQueue = true;
          state.rerunRequested = false;
          if (this.config.enableLogging) {
            console.log(`🔁 Re-queued ${state.userName} (${userId}) due to in-flight events`);
          }
        }
      }
    }
    this.running = false;
  }
}


