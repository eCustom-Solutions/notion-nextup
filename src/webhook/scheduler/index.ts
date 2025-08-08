import { PerUserStateStore } from './per-user-state';
import { ReadyQueue } from './ready-queue';
import { DebounceRouter, DebounceRouterConfig } from './debounce-router';
import { SingleWorker, WorkerConfig } from './worker';

export interface SchedulerConfig extends DebounceRouterConfig, WorkerConfig {}

export class Scheduler {
  private readonly store = new PerUserStateStore();
  private readonly readyQueue = new ReadyQueue();
  private readonly router: DebounceRouter;
  private readonly worker: SingleWorker;

  constructor(private readonly config: SchedulerConfig) {
    this.router = new DebounceRouter(this.store, this.readyQueue, config);
    this.worker = new SingleWorker(this.store, this.readyQueue, config);
  }

  start(): void {
    this.worker.start();
  }

  routeEvent(userId: string, userName: string): void {
    this.router.onWebhookEvent(userId, userName);
  }

  stop(): void {
    // Stop worker loop
    this.worker.stop();
    // Clear all debounce timers
    for (const [, state] of this.store.all()) {
      if (state.debounceTimer) {
        clearTimeout(state.debounceTimer);
        state.debounceTimer = null;
      }
    }
  }
}

export function startScheduler(config: SchedulerConfig): Scheduler {
  const scheduler = new Scheduler(config);
  scheduler.start();
  return scheduler;
}


