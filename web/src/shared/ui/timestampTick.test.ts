import { subscribeTimestampTick } from './timestampTick';

describe('subscribeTimestampTick', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('runs one shared 10-second timer while anyone listens', () => {
    const a = vi.fn();
    const b = vi.fn();
    const stopA = subscribeTimestampTick(a);
    const stopB = subscribeTimestampTick(b);
    expect(vi.getTimerCount()).toBe(1);

    vi.advanceTimersByTime(10_000);
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);

    stopA();
    vi.advanceTimersByTime(10_000);
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(2);

    stopB();
    expect(vi.getTimerCount()).toBe(0);
  });
});
