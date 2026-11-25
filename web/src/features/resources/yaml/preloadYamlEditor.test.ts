import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const loadTab = vi.fn();
const warm = vi.fn();

// The dynamic imports under test: count their evaluations instead of loading the editor stack.
vi.mock('./ResourceYamlTab', () => {
  loadTab();
  return { ResourceYamlTab: () => null };
});
vi.mock('./warmMonacoWorkers', () => ({ warmMonacoWorkers: () => warm() as unknown }));

/** A fresh copy of the module, so each test starts with an empty memo. */
async function freshModule() {
  vi.resetModules();
  return import('./preloadYamlEditor');
}

beforeEach(() => {
  loadTab.mockReset();
  warm.mockReset().mockResolvedValue(undefined);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('preloadYamlEditor', () => {
  it('loads the YAML tab module and warms the workers once across calls', async () => {
    const { preloadYamlEditor } = await freshModule();
    const first = preloadYamlEditor();
    expect(preloadYamlEditor()).toBe(first);
    await first;
    await preloadYamlEditor();
    expect(loadTab).toHaveBeenCalledTimes(1);
    expect(warm).toHaveBeenCalledTimes(1);
  });

  it('swallows a failure and resets the memo, so the next call retries', async () => {
    const { preloadYamlEditor } = await freshModule();
    warm.mockRejectedValueOnce(new Error('chunk load failed'));
    await expect(preloadYamlEditor()).resolves.toBeUndefined();
    await preloadYamlEditor();
    expect(warm).toHaveBeenCalledTimes(2);
  });
});

describe('usePreloadYamlEditor', () => {
  it('preloads when the browser is idle and cancels the idle callback on unmount', async () => {
    const { usePreloadYamlEditor } = await freshModule();
    const requestIdleCallback = vi.fn().mockReturnValue(7);
    const cancelIdleCallback = vi.fn();
    vi.stubGlobal('requestIdleCallback', requestIdleCallback);
    vi.stubGlobal('cancelIdleCallback', cancelIdleCallback);

    const { unmount } = renderHook(() => usePreloadYamlEditor());
    expect(requestIdleCallback).toHaveBeenCalledWith(expect.any(Function), { timeout: 5000 });
    expect(warm).not.toHaveBeenCalled();
    unmount();
    expect(cancelIdleCallback).toHaveBeenCalledWith(7);
  });

  it('runs the preload from the idle callback', async () => {
    const { usePreloadYamlEditor } = await freshModule();
    let idle: (() => void) | undefined;
    vi.stubGlobal('requestIdleCallback', (callback: () => void) => {
      idle = callback;
      return 1;
    });
    vi.stubGlobal('cancelIdleCallback', vi.fn());

    const { unmount } = renderHook(() => usePreloadYamlEditor());
    idle?.();
    await vi.waitFor(() => expect(warm).toHaveBeenCalledTimes(1));
    unmount();
  });

  it('falls back to a timeout without requestIdleCallback and clears it on unmount', async () => {
    const { usePreloadYamlEditor } = await freshModule();
    vi.stubGlobal('requestIdleCallback', undefined);
    vi.useFakeTimers();

    const { unmount } = renderHook(() => usePreloadYamlEditor());
    unmount();
    await vi.advanceTimersByTimeAsync(5000);
    expect(warm).not.toHaveBeenCalled();

    const second = renderHook(() => usePreloadYamlEditor());
    await vi.advanceTimersByTimeAsync(2000);
    expect(warm).toHaveBeenCalledTimes(1);
    second.unmount();
  });

  it('does nothing while disabled', async () => {
    const { usePreloadYamlEditor } = await freshModule();
    const requestIdleCallback = vi.fn();
    vi.stubGlobal('requestIdleCallback', requestIdleCallback);
    renderHook(() => usePreloadYamlEditor(false)).unmount();
    expect(requestIdleCallback).not.toHaveBeenCalled();
  });
});
