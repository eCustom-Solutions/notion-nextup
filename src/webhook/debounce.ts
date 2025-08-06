export interface DebounceStrategy {
  name: string;
  shouldRun: (lastRun: number, currentTime: number, options: DebounceOptions) => boolean;
  onSkipped?: (reason: string) => void;
}

export interface DebounceOptions {
  debounceMs?: number;
  enableLogging?: boolean;
}

/**
 * Simple debounce strategy - skips if within debounce window
 */
export const simpleDebounce: DebounceStrategy = {
  name: 'simple',
  shouldRun: (lastRun, currentTime, options) => {
    const debounceMs = options.debounceMs || 30_000;
    return currentTime - lastRun >= debounceMs;
  },
  onSkipped: (reason) => console.log(`⏭️  Skipped: ${reason}`)
};

/**
 * Queue-based debounce strategy - queues events and processes the latest
 */
export const queueDebounce: DebounceStrategy = {
  name: 'queue',
  shouldRun: () => true, // Always allow, but we'll queue the events
  onSkipped: (reason) => console.log(`📋 Queued: ${reason}`)
};

/**
 * Delayed execution with reset strategy - waits for a quiet period before executing
 */
export const delayedExecution: DebounceStrategy = {
  name: 'delayed',
  shouldRun: () => true, // Always allow, but we'll manage timing internally
  onSkipped: (reason) => console.log(`⏳ Delayed: ${reason}`)
};

/**
 * Generic debounce manager that can work with any pipeline function
 */
export class DebounceManager {
  private lastRun = 0;
  private pendingEvents: Array<{ userId: string; userName: string; timestamp: number }> = [];
  private isProcessing = false;
  private options: DebounceOptions;
  private strategy: DebounceStrategy;
  
  // For delayed execution strategy
  private delayedTimers = new Map<string, NodeJS.Timeout>();
  private delayedEvents = new Map<string, { userId: string; userName: string; timestamp: number }>();

  constructor(options: DebounceOptions = {}, strategy: DebounceStrategy = simpleDebounce) {
    this.options = options;
    this.strategy = strategy;
  }

  /**
   * Process an event with the configured debounce strategy
   */
  async processEvent(
    userId: string, 
    userName: string, 
    pipelineFunction: (userId: string, userName: string) => Promise<void>
  ): Promise<void> {
    const currentTime = Date.now();
    
    if (this.options.enableLogging) {
      console.log(`📨 Processing event for ${userName} (${userId})`);
      console.log(`⏰ Current time: ${currentTime}, Last run: ${this.lastRun}`);
    }

    // Handle delayed execution strategy
    if (this.strategy.name === 'delayed') {
      const userKey = `${userId}-${userName}`;
      
      // Clear existing timer for this user
      if (this.delayedTimers.has(userKey)) {
        clearTimeout(this.delayedTimers.get(userKey)!);
        if (this.options.enableLogging) {
          console.log(`⏳ Reset timer for ${userName} - new event received`);
        }
      }
      
      // Store the latest event for this user
      this.delayedEvents.set(userKey, { userId, userName, timestamp: currentTime });
      
      // Set new timer
      const delayMs = this.options.debounceMs || 10_000; // Default 10 seconds
      const timer = setTimeout(async () => {
        const event = this.delayedEvents.get(userKey);
        if (event) {
          if (this.options.enableLogging) {
            console.log(`🚀 Executing delayed event for ${userName} after ${delayMs}ms quiet period`);
          }
          this.delayedEvents.delete(userKey);
          this.delayedTimers.delete(userKey);
          await this.runPipeline(event.userId, event.userName, pipelineFunction);
        }
      }, delayMs);
      
      this.delayedTimers.set(userKey, timer);
      
      if (this.options.enableLogging) {
        console.log(`⏳ Scheduled execution for ${userName} in ${delayMs}ms`);
      }
      return;
    }

    // Check if we should run based on the strategy
    if (!this.strategy.shouldRun(this.lastRun, currentTime, this.options)) {
      const reason = `Within debounce window (${this.options.debounceMs || 30_000}ms)`;
      this.strategy.onSkipped?.(reason);
      return;
    }

    // For queue strategy, add to pending events
    if (this.strategy.name === 'queue') {
      this.pendingEvents.push({ userId, userName, timestamp: currentTime });
      
      if (this.isProcessing) {
        if (this.options.enableLogging) {
          console.log(`📋 Event queued while processing. Queue size: ${this.pendingEvents.length}`);
        }
        return;
      }
    }

    // Run the pipeline
    await this.runPipeline(userId, userName, pipelineFunction);
  }

  /**
   * Run the actual pipeline logic
   */
  private async runPipeline(
    userId: string, 
    userName: string, 
    pipelineFunction: (userId: string, userName: string) => Promise<void>
  ): Promise<void> {
    this.isProcessing = true;
    this.lastRun = Date.now();

    try {
      await pipelineFunction(userId, userName);
    } catch (error) {
      console.error('❌ Pipeline error:', error);
      throw error;
    } finally {
      this.isProcessing = false;
      
      // Process any pending events for queue strategy
      if (this.strategy.name === 'queue' && this.pendingEvents.length > 0) {
        const latestEvent = this.pendingEvents.pop();
        this.pendingEvents = []; // Clear the queue
        
        if (latestEvent && this.options.enableLogging) {
          console.log(`🔄 Processing queued event for ${latestEvent.userName}`);
        }
        
        if (latestEvent) {
          await this.runPipeline(latestEvent.userId, latestEvent.userName, pipelineFunction);
        }
      }
    }
  }

  /**
   * Get debounce statistics
   */
  getStats() {
    return {
      lastRun: this.lastRun,
      pendingEvents: this.pendingEvents.length,
      isProcessing: this.isProcessing,
      strategy: this.strategy.name,
      delayedEvents: this.delayedEvents.size,
      activeTimers: this.delayedTimers.size
    };
  }
} 