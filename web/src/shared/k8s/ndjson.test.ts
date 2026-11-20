import { ndjsonLines } from './ndjson';

/** Pushes `chunks` through the splitter and collects the emitted lines. */
async function split(chunks: string[]): Promise<string[]> {
  const source = new ReadableStream<string>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk);
      controller.close();
    },
  });
  const reader = source.pipeThrough(ndjsonLines()).getReader();
  const lines: string[] = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return lines;
    lines.push(value);
  }
}

describe('ndjsonLines', () => {
  it('joins an event split across chunks and splits several events in one chunk', async () => {
    expect(await split(['', '{"type":"ADD', 'ED"}\n{"type":"MODIFIED"}\n{"ty', 'pe":"DELETED"}\n'])).toEqual([
      '{"type":"ADDED"}',
      '{"type":"MODIFIED"}',
      '{"type":"DELETED"}',
    ]);
  });

  it('skips empty chunks and blank lines and flushes an unterminated last line', async () => {
    expect(await split(['', '\n', '{"a":1}\r\n', '', '{"b":2}'])).toEqual(['{"a":1}', '{"b":2}']);
  });
});
