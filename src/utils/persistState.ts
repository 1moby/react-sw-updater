const PREFIX = '__update_checker__';

export function persistState(key: string, data: unknown): void {
  try {
    sessionStorage.setItem(
      `${PREFIX}${key}`,
      JSON.stringify(data),
    );
  } catch {
    // sessionStorage may be full or unavailable
  }
}

export function restoreState<T = unknown>(key: string): T | null {
  try {
    const raw = sessionStorage.getItem(`${PREFIX}${key}`);
    if (raw === null) return null;
    sessionStorage.removeItem(`${PREFIX}${key}`);
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}
