import { http, HttpResponse } from 'msw';
import { ApiError } from '@/shared/api';
import { mockK8s } from '@/test/handlers';
import { server } from '@/test/server';
import {
  logTimeKey,
  logTimeToSecond,
  parseLogLine,
  podLogPath,
  streamPodLog,
  type LogLine,
} from './logStream';

/** A running `web` pod that restarted once; `NEVER_RESTARTED` has no previous log. */
const POD = 'web-7d4b9c8f6d-8mzrt';
const NEVER_RESTARTED = 'web-7d4b9c8f6d-2xkqp';
const PROXY = '*/api/clusters/:cluster/k8s/*';

async function collect(path: string, signal = new AbortController().signal): Promise<LogLine[]> {
  const lines: LogLine[] = [];
  for await (const line of streamPodLog(path, signal)) lines.push(line);
  return lines;
}

async function rejection(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error('expected a rejection');
}

describe('podLogPath', () => {
  it('builds the log subresource URL with only the given options', () => {
    expect(
      podLogPath('dev-1', 'shop', 'web-1', {
        container: 'web',
        follow: true,
        tailLines: 1000,
        timestamps: true,
      }),
    ).toBe(
      '/api/clusters/dev-1/k8s/api/v1/namespaces/shop/pods/web-1/log?container=web&follow=true&tailLines=1000&timestamps=true',
    );
    expect(podLogPath('dev-1', 'shop', 'web-1', { container: 'web', previous: true })).toBe(
      '/api/clusters/dev-1/k8s/api/v1/namespaces/shop/pods/web-1/log?container=web&previous=true',
    );
  });
});

describe('log timestamps', () => {
  it('splits the timestamp prefix off and keeps lines without one', () => {
    expect(parseLogLine('2026-11-23T10:00:05.12Z GET / 200')).toEqual({
      ts: '2026-11-23T10:00:05.12Z',
      text: 'GET / 200',
    });
    expect(parseLogLine('2026-11-23T10:00:05Z')).toEqual({ ts: '2026-11-23T10:00:05Z', text: '' });
    expect(parseLogLine('plain text')).toEqual({ ts: '', text: 'plain text' });
  });

  it('orders trimmed nanosecond fractions and offsets correctly and truncates to the second', () => {
    expect(logTimeKey('2026-11-23T10:00:05.12Z') < logTimeKey('2026-11-23T10:00:05.1Z')).toBe(false);
    expect(logTimeKey('2026-11-23T10:00:05.1Z') < logTimeKey('2026-11-23T10:00:05.12Z')).toBe(true);
    expect(logTimeKey('2026-11-23T11:00:05+01:00')).toBe(logTimeKey('2026-11-23T10:00:05.000000000Z'));
    expect(logTimeToSecond('2026-11-23T10:00:05.123456789Z')).toBe('2026-11-23T10:00:05Z');
  });
});

describe('streamPodLog', () => {
  it('streams the seeded log with timestamps and live appended lines', async () => {
    const abort = new AbortController();
    const path = podLogPath('dev-1', 'shop', POD, { container: 'web', follow: true, timestamps: true });
    const iterator = streamPodLog(path, abort.signal)[Symbol.asyncIterator]();
    const first = await iterator.next();
    expect(first.value).toMatchObject({ text: `Starting web in pod ${POD}` });
    expect((first.value as LogLine).ts).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    for (let i = 1; i < 10; i++) await iterator.next();
    mockK8s.appendLog('dev-1', 'shop', POD, 'web', 'live line');
    expect((await iterator.next()).value).toMatchObject({ text: 'live line' });
    abort.abort();
    expect((await iterator.next()).done).toBe(true);
    expect(mockK8s.openLogStreams('dev-1', 'shop', POD, 'web')).toBe(0);
  });

  it('joins lines split over chunks, keeps blank lines and ends silently on EOF', async () => {
    const encoder = new TextEncoder();
    server.use(
      http.get(PROXY, () => {
        const chunks = [
          '2026-11-23T10:00:01Z hel',
          'lo\n2026-11-23T10:00:02Z \n',
          '2026-11-23T10:00:03Z last',
        ];
        const body = new ReadableStream<Uint8Array>({
          start(controller) {
            for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
            controller.close();
          },
        });
        return new HttpResponse(body, { headers: { 'Content-Type': 'text/plain' } });
      }),
    );
    expect(await collect(podLogPath('dev-1', 'shop', POD, { container: 'web', timestamps: true }))).toEqual([
      { ts: '2026-11-23T10:00:01Z', text: 'hello' },
      { ts: '2026-11-23T10:00:02Z', text: '' },
      { ts: '2026-11-23T10:00:03Z', text: 'last' },
    ]);
  });

  it('throws an ApiError with the cluster message for a 403 and for a missing previous log', async () => {
    server.use(
      http.get(PROXY, () =>
        HttpResponse.json(
          {
            kind: 'Status',
            apiVersion: 'v1',
            status: 'Failure',
            reason: 'Forbidden',
            code: 403,
            message:
              'pods "web" is forbidden: User "system:serviceaccount:fleet:viewer" cannot get resource "pods/log"',
          },
          { status: 403 },
        ),
      ),
    );
    const forbidden = await rejection(collect(podLogPath('dev-1', 'shop', POD, { container: 'web' })));
    expect(forbidden).toBeInstanceOf(ApiError);
    expect(forbidden).toMatchObject({ status: 403 });
    expect((forbidden as ApiError).detail).toContain('cannot get resource "pods/log"');

    server.resetHandlers();
    const previous = podLogPath('dev-1', 'shop', NEVER_RESTARTED, { container: 'web', previous: true });
    const missing = await rejection(collect(previous));
    expect(missing).toMatchObject({ status: 400 });
    expect((missing as ApiError).detail).toContain('previous terminated container "web"');
  });

  it('serves the previous log of a restarted container', async () => {
    const lines = await collect(
      podLogPath('dev-1', 'shop', POD, { container: 'web', previous: true, timestamps: true }),
    );
    expect(lines.at(-1)).toMatchObject({ text: 'panic: database unavailable' });
  });

  it('ends silently when aborted before the response', async () => {
    const abort = new AbortController();
    abort.abort();
    expect(
      await collect(podLogPath('dev-1', 'shop', POD, { container: 'web', follow: true }), abort.signal),
    ).toEqual([]);
  });
});
