import { describe, it, expect, vi, beforeEach } from 'vitest';
import { isChunkLoadError, retryDynamicImport } from '../../src/utils/chunkError';

describe('isChunkLoadError', () => {
  it('detects ChunkLoadError by name', () => {
    const err = new Error('something');
    err.name = 'ChunkLoadError';
    expect(isChunkLoadError(err)).toBe(true);
  });

  it('detects "Loading chunk X failed" message', () => {
    expect(isChunkLoadError(new Error('Loading chunk 42 failed'))).toBe(true);
  });

  it('detects "Failed to fetch dynamically imported module"', () => {
    expect(
      isChunkLoadError(new Error('Failed to fetch dynamically imported module: /foo.js')),
    ).toBe(true);
  });

  it('detects "error loading dynamically imported module"', () => {
    expect(
      isChunkLoadError(new Error('error loading dynamically imported module')),
    ).toBe(true);
  });

  it('returns false for regular errors', () => {
    expect(isChunkLoadError(new Error('network timeout'))).toBe(false);
  });

  it('returns false for non-Error values', () => {
    expect(isChunkLoadError('string')).toBe(false);
    expect(isChunkLoadError(null)).toBe(false);
    expect(isChunkLoadError(undefined)).toBe(false);
    expect(isChunkLoadError(42)).toBe(false);
  });
});

describe('retryDynamicImport', () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.restoreAllMocks();
    // Mock location.pathname for per-module key
    Object.defineProperty(window, 'location', {
      value: { pathname: '/settings', reload: vi.fn() },
      configurable: true,
      writable: true,
    });
  });

  it('resolves on successful import', async () => {
    const module = { default: 'MyComponent' };
    const result = await retryDynamicImport(() => Promise.resolve(module));
    expect(result).toBe(module);
  });

  it('clears retry flag on success', async () => {
    sessionStorage.setItem('__update_checker_retry__/settings', 'true');
    await retryDynamicImport(() => Promise.resolve({ default: 'X' }));
    expect(sessionStorage.getItem('__update_checker_retry__/settings')).toBeNull();
  });

  it('reloads on first chunk load error', async () => {
    const reloadMock = vi.fn();
    Object.defineProperty(window, 'location', {
      value: { pathname: '/settings', reload: reloadMock },
      configurable: true,
      writable: true,
    });

    const err = new Error('Loading chunk 5 failed');
    const importFn = vi.fn().mockRejectedValue(err);

    const promise = retryDynamicImport(importFn);
    await new Promise((r) => setTimeout(r, 0));

    expect(reloadMock).toHaveBeenCalledOnce();
    expect(sessionStorage.getItem('__update_checker_retry__/settings')).toBe('true');

    void promise;
  });

  it('throws on second attempt (prevents infinite loop)', async () => {
    sessionStorage.setItem('__update_checker_retry__/settings', 'true');

    const err = new Error('Loading chunk 5 failed');
    await expect(
      retryDynamicImport(() => Promise.reject(err)),
    ).rejects.toThrow('Loading chunk 5 failed');
  });

  it('throws non-chunk errors immediately', async () => {
    const err = new Error('network timeout');
    await expect(
      retryDynamicImport(() => Promise.reject(err)),
    ).rejects.toThrow('network timeout');
  });

  it('uses per-module key so different routes retry independently', async () => {
    // Fail on /settings
    Object.defineProperty(window, 'location', {
      value: { pathname: '/settings', reload: vi.fn() },
      configurable: true,
      writable: true,
    });
    const err = new Error('Loading chunk 5 failed');
    void retryDynamicImport(() => Promise.reject(err));
    await new Promise((r) => setTimeout(r, 0));
    expect(sessionStorage.getItem('__update_checker_retry__/settings')).toBe('true');

    // /dashboard should NOT be blocked
    Object.defineProperty(window, 'location', {
      value: { pathname: '/dashboard', reload: vi.fn() },
      configurable: true,
      writable: true,
    });
    expect(sessionStorage.getItem('__update_checker_retry__/dashboard')).toBeNull();
  });

  it('accepts custom moduleKey override', async () => {
    const reloadMock = vi.fn();
    Object.defineProperty(window, 'location', {
      value: { pathname: '/any', reload: reloadMock },
      configurable: true,
      writable: true,
    });

    const err = new Error('Loading chunk 5 failed');
    void retryDynamicImport(() => Promise.reject(err), 'my-widget');
    await new Promise((r) => setTimeout(r, 0));

    expect(sessionStorage.getItem('__update_checker_retry__my-widget')).toBe('true');
  });
});
