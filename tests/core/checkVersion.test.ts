import { describe, it, expect, vi, beforeEach } from 'vitest';
import { checkVersion } from '../../src/core/checkVersion';

describe('checkVersion', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    // Default to online
    Object.defineProperty(navigator, 'onLine', {
      value: true,
      configurable: true,
    });
  });

  it('detects update when server version differs from current', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ version: '2.0.0' }),
      }),
    );

    const result = await checkVersion('/version.json', '1.0.0');
    expect(result.updateAvailable).toBe(true);
    expect(result.serverVersion).toBe('2.0.0');
  });

  it('returns no update when versions match', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ version: '1.0.0' }),
      }),
    );

    const result = await checkVersion('/version.json', '1.0.0');
    expect(result.updateAvailable).toBe(false);
    expect(result.serverVersion).toBe('1.0.0');
  });

  it('adds cache-busting query param to URL', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ version: '1.0.0' }),
    });
    vi.stubGlobal('fetch', mockFetch);

    await checkVersion('/version.json', '1.0.0');

    const calledUrl = mockFetch.mock.calls[0][0] as string;
    expect(calledUrl).toMatch(/\/version\.json\?_v=\d+/);
  });

  it('sends no-cache headers and AbortSignal', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ version: '1.0.0' }),
    });
    vi.stubGlobal('fetch', mockFetch);

    await checkVersion('/version.json', '1.0.0');

    const options = mockFetch.mock.calls[0][1] as RequestInit;
    expect(options.cache).toBe('no-store');
    expect(options.headers).toHaveProperty('Cache-Control');
    expect(options.signal).toBeInstanceOf(AbortSignal);
  });

  it('returns no update on network error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new Error('Network error')),
    );

    const result = await checkVersion('/version.json', '1.0.0');
    expect(result.updateAvailable).toBe(false);
    expect(result.serverVersion).toBeNull();
  });

  it('returns no update on non-ok response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false }),
    );

    const result = await checkVersion('/version.json', '1.0.0');
    expect(result.updateAvailable).toBe(false);
  });

  it('handles version.json with no version field', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({}),
      }),
    );

    const result = await checkVersion('/version.json', '1.0.0');
    expect(result.updateAvailable).toBe(false);
  });

  it('skips fetch when browser is offline', async () => {
    Object.defineProperty(navigator, 'onLine', {
      value: false,
      configurable: true,
    });
    const mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);

    const result = await checkVersion('/version.json', '1.0.0');
    expect(result.updateAvailable).toBe(false);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('deduplicates concurrent calls', async () => {
    let resolveFirst!: (v: Response) => void;
    const mockFetch = vi.fn().mockReturnValue(
      new Promise<Response>((r) => {
        resolveFirst = r;
      }),
    );
    vi.stubGlobal('fetch', mockFetch);

    // Fire two concurrent checks
    const p1 = checkVersion('/version.json', '1.0.0');
    const p2 = checkVersion('/version.json', '1.0.0');

    // Only one fetch should have been called
    expect(mockFetch).toHaveBeenCalledTimes(1);

    // Resolve it
    resolveFirst({
      ok: true,
      json: () => Promise.resolve({ version: '1.0.0' }),
    } as Response);

    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1).toEqual(r2);
  });

  it('respects custom timeout', async () => {
    // This test verifies the AbortController is created with signal
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ version: '1.0.0' }),
    });
    vi.stubGlobal('fetch', mockFetch);

    await checkVersion('/version.json', '1.0.0', { timeoutMs: 500 });

    const options = mockFetch.mock.calls[0][1] as RequestInit;
    expect(options.signal).toBeInstanceOf(AbortSignal);
  });
});
