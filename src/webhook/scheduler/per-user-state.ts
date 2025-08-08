export interface PerUserState {
  lastEventTs: number;
  debounceTimer: NodeJS.Timeout | null;
  inQueue: boolean;
  isProcessing: boolean;
  rerunRequested: boolean;
  userName: string;
}

export class PerUserStateStore {
  private readonly userIdToState = new Map<string, PerUserState>();

  get(userId: string): PerUserState | undefined {
    return this.userIdToState.get(userId);
  }

  ensure(userId: string, userName: string): PerUserState {
    const existing = this.userIdToState.get(userId);
    if (existing) {
      existing.userName = userName;
      return existing;
    }
    const created: PerUserState = {
      lastEventTs: 0,
      debounceTimer: null,
      inQueue: false,
      isProcessing: false,
      rerunRequested: false,
      userName,
    };
    this.userIdToState.set(userId, created);
    return created;
  }

  all(): ReadonlyMap<string, PerUserState> {
    return this.userIdToState;
  }
}


