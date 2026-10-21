export const refreshLockName = "tmw-session-refresh";

export interface LockManagerLike {
  request<T>(name: string, callback: () => Promise<T>): Promise<T>;
}

function browserLocks(): LockManagerLike | undefined {
  return (navigator as Partial<Navigator>).locks;
}

export function withRefreshLock<T>(
  task: () => Promise<T>,
  locks: LockManagerLike | undefined = browserLocks(),
): Promise<T> {
  return locks === undefined ? task() : locks.request(refreshLockName, task);
}
