import { describe, it, expect, beforeEach } from 'vitest';
import { persistState, restoreState } from '../../src/utils/persistState';

describe('persistState / restoreState', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it('persists and restores an object', () => {
    persistState('test', { foo: 'bar', count: 42 });
    const result = restoreState<{ foo: string; count: number }>('test');
    expect(result).toEqual({ foo: 'bar', count: 42 });
  });

  it('restoreState removes the key after reading', () => {
    persistState('test', 'hello');
    restoreState('test');
    const second = restoreState('test');
    expect(second).toBeNull();
  });

  it('returns null for non-existent key', () => {
    expect(restoreState('missing')).toBeNull();
  });

  it('persists strings', () => {
    persistState('str', 'hello world');
    expect(restoreState('str')).toBe('hello world');
  });

  it('persists arrays', () => {
    persistState('arr', [1, 2, 3]);
    expect(restoreState('arr')).toEqual([1, 2, 3]);
  });

  it('persists null values', () => {
    persistState('nul', null);
    expect(restoreState('nul')).toBeNull();
  });

  it('uses a prefix to avoid key collisions', () => {
    persistState('key', 'value');
    expect(sessionStorage.getItem('__update_checker__key')).toBe('"value"');
  });
});
