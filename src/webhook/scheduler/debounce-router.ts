import { PerUserStateStore } from './per-user-state';
import { ReadyQueue } from './ready-queue';

export interface DebounceRouterConfig {
  debounceMs: number;
  enableLogging?: boolean;
}

export class DebounceRouter {
  constructor(
    private readonly store: PerUserStateStore,
    private readonly readyQueue: ReadyQueue,
    private readonly config: DebounceRouterConfig
  ) {}

  onWebhookEvent(userId: string, userName: string): void {
    const state = this.store.ensure(userId, userName);
    state.lastEventTs = Date.now();

    // If the user is currently processing, just mark rerun
    if (state.isProcessing) {
      state.rerunRequested = true;
      if (this.config.enableLogging) {
        console.log(`🔁 Rerun requested for ${userName} (${userId}) while processing`);
      }
      return;
    }

    // Clear existing timer
    if (state.debounceTimer) {
      clearTimeout(state.debounceTimer);
      state.debounceTimer = null;
      if (this.config.enableLogging) {
        console.log(`⏳ Reset debounce timer for ${userName}`);
      }
    }

    // Set a new timer
    state.debounceTimer = setTimeout(() => {
      // Enqueue only if not already queued and not processing
      if (!state.inQueue && !state.isProcessing) {
        this.readyQueue.enqueue(userId);
        state.inQueue = true;
        if (this.config.enableLogging) {
          console.log(`🚦 Enqueued ${userName} (${userId}) after debounce`);
        }
      }
    }, this.config.debounceMs);
  }
}


