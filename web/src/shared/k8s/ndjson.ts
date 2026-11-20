/**
 * A `TransformStream` that turns decoded text chunks into complete lines of newline-delimited JSON (ADR-0022 §5).
 * A line may arrive split over several chunks and one chunk may hold several lines; empty chunks (the mock watch's
 * "flush the headers" chunk) and blank lines are skipped. Only the unfinished tail is held, never the whole stream.
 */
export function ndjsonLines(): TransformStream<string, string> {
  let pending = '';
  return new TransformStream<string, string>({
    transform(chunk, controller) {
      pending += chunk;
      const lines = pending.split('\n');
      pending = lines.pop() ?? '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed) controller.enqueue(trimmed);
      }
    },
    flush(controller) {
      const trimmed = pending.trim();
      if (trimmed) controller.enqueue(trimmed);
    },
  });
}
