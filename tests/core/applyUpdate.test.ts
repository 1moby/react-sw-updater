import { describe, it, expect, vi, beforeEach } from 'vitest';
import { applyUpdate } from '../../src/core/applyUpdate';

describe('applyUpdate', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    sessionStorage.clear();
  });

  it('unregisters all service workers', async () => {
    const unregister = vi.fn().mockResolvedValue(true);
    vi.stubGlobal('navigator', {
      serviceWorker: {
        getRegistrations: vi.fn().mockResolvedValue([
          { unregister },
          { unregister },
        ]),
      },
    });
    vi.stubGlobal('caches', {
      keys: vi.fn().mockResolvedValue([]),
      delete: vi.fn(),
    });

    // Mock location.replace to prevent actual navigation
    const replace = vi.fn();
    vi.stubGlobal('location', {
      href: 'http://localhost:3000/',
      replace,
    });
    // URL needs to work
    vi.stubGlobal('URL', globalThis.URL);

    await applyUpdate();

    expect(unregister).toHaveBeenCalledTimes(2);
  });

  it('clears all caches', async () => {
    vi.stubGlobal('navigator', {
      serviceWorker: {
        getRegistrations: vi.fn().mockResolvedValue([]),
      },
    });
    const deleteFn = vi.fn().mockResolvedValue(true);
    vi.stubGlobal('caches', {
      keys: vi.fn().mockResolvedValue(['cache-v1', 'cache-v2']),
      delete: deleteFn,
    });

    const replace = vi.fn();
    vi.stubGlobal('location', {
      href: 'http://localhost:3000/',
      replace,
    });

    await applyUpdate();

    expect(deleteFn).toHaveBeenCalledWith('cache-v1');
    expect(deleteFn).toHaveBeenCalledWith('cache-v2');
  });

  it('navigates with cache-bust param', async () => {
    vi.stubGlobal('navigator', {
      serviceWorker: {
        getRegistrations: vi.fn().mockResolvedValue([]),
      },
    });
    vi.stubGlobal('caches', {
      keys: vi.fn().mockResolvedValue([]),
      delete: vi.fn(),
    });

    const replace = vi.fn();
    vi.stubGlobal('location', {
      href: 'http://localhost:3000/app',
      replace,
    });

    await applyUpdate();

    expect(replace).toHaveBeenCalledTimes(1);
    const url = replace.mock.calls[0][0] as string;
    expect(url).toContain('_uc=');
  });

  it('prevents reload loop when called twice within 30s', async () => {
    vi.stubGlobal('navigator', {
      serviceWorker: {
        getRegistrations: vi.fn().mockResolvedValue([]),
      },
    });
    vi.stubGlobal('caches', {
      keys: vi.fn().mockResolvedValue([]),
      delete: vi.fn(),
    });

    const replace = vi.fn();
    vi.stubGlobal('location', {
      href: 'http://localhost:3000/',
      replace,
    });

    // First call should navigate
    await applyUpdate();
    expect(replace).toHaveBeenCalledTimes(1);

    // Second call within 30s should bail out (loop guard)
    await applyUpdate();
    expect(replace).toHaveBeenCalledTimes(1); // Still 1 — second was blocked
  });

  it('allows reload after guard expires', async () => {
    vi.stubGlobal('navigator', {
      serviceWorker: {
        getRegistrations: vi.fn().mockResolvedValue([]),
      },
    });
    vi.stubGlobal('caches', {
      keys: vi.fn().mockResolvedValue([]),
      delete: vi.fn(),
    });

    const replace = vi.fn();
    vi.stubGlobal('location', {
      href: 'http://localhost:3000/',
      replace,
    });

    // Simulate a guard that expired (31s ago)
    sessionStorage.setItem(
      '__update_checker_applied__',
      (Date.now() - 31_000).toString(),
    );

    await applyUpdate();
    expect(replace).toHaveBeenCalledTimes(1);
  });
});
