import {
  decodeFrame,
  encodeResize,
  encodeStdin,
  execFailureMessage,
  execUrl,
  EXEC_SHELL_COMMAND,
} from './exec';

const text = (bytes: Uint8Array) => new TextDecoder().decode(bytes);
/** A server frame on `channel` carrying `payload` as UTF-8 base64, built independently of the codec. */
const frame = (channel: number, payload: string) =>
  `${channel}${Buffer.from(payload, 'utf8').toString('base64')}`;

describe('execUrl', () => {
  it('builds a same-origin ws URL with a TTY, the container and one command parameter per argv entry', () => {
    const url = new URL(
      execUrl('dev-1', 'shop', 'web-1', { container: 'web' }, 'http://localhost:5173/c/dev-1'),
    );

    expect(url.protocol).toBe('ws:');
    expect(url.host).toBe('localhost:5173');
    expect(url.pathname).toBe('/api/clusters/dev-1/k8s/api/v1/namespaces/shop/pods/web-1/exec');
    expect(
      Object.fromEntries(['stdout', 'stdin', 'stderr', 'tty'].map((k) => [k, url.searchParams.get(k)])),
    ).toEqual({ stdout: '1', stdin: '1', stderr: '1', tty: '1' });
    expect(url.searchParams.get('container')).toBe('web');
    expect(url.searchParams.getAll('command')).toEqual([...EXEC_SHELL_COMMAND]);
  });

  it('uses wss on an https page and takes a custom command', () => {
    const url = new URL(
      execUrl('p', 'ns', 'p-1', { container: 'c', command: ['ls'] }, 'https://console.example.com/'),
    );

    expect(url.protocol).toBe('wss:');
    expect(url.searchParams.getAll('command')).toEqual(['ls']);
  });
});

describe('frame codec', () => {
  it('encodes stdin as channel 0 UTF-8 base64 and round-trips non-ASCII text', () => {
    const input = 'echo grüße 🚀\r';
    const encoded = encodeStdin(input);

    expect(encoded[0]).toBe('0');
    expect(Buffer.from(encoded.slice(1), 'base64').toString('utf8')).toBe(input);
    // A server echo of the same bytes on stdout decodes back to the same text.
    const decoded = decodeFrame(`1${encoded.slice(1)}`);
    expect(decoded?.channel).toBe(1);
    expect(text(decoded?.bytes ?? new Uint8Array())).toBe(input);
  });

  it('encodes a resize as channel 4 {Width, Height}', () => {
    const encoded = encodeResize(120, 40);

    expect(encoded[0]).toBe('4');
    expect(JSON.parse(Buffer.from(encoded.slice(1), 'base64').toString('utf8'))).toEqual({
      Width: 120,
      Height: 40,
    });
  });

  it('decodes stdout, stderr and the error channel', () => {
    const stderr = decodeFrame(frame(2, 'oops'));
    expect(stderr?.channel).toBe(2);
    expect(text(stderr?.bytes ?? new Uint8Array())).toBe('oops');
    expect(decodeFrame(frame(3, '{}'))?.channel).toBe(3);
  });

  it('ignores frames that are not output', () => {
    expect(decodeFrame('')).toBeUndefined();
    expect(decodeFrame(frame(0, 'x'))).toBeUndefined();
    expect(decodeFrame('9abc')).toBeUndefined();
    expect(decodeFrame('1%%%')).toBeUndefined();
    expect(decodeFrame(new ArrayBuffer(2))).toBeUndefined();
  });
});

describe('execFailureMessage', () => {
  const bytes = (value: string) => new TextEncoder().encode(value);

  it('is undefined for Success and the Status message otherwise (TERM-9)', () => {
    expect(execFailureMessage(bytes('{"metadata":{},"status":"Success"}'))).toBeUndefined();
    expect(
      execFailureMessage(
        bytes(
          '{"status":"Failure","message":"exec: \\"sh\\": executable file not found in $PATH","reason":"InternalError"}',
        ),
      ),
    ).toBe('exec: "sh": executable file not found in $PATH');
  });

  it('shows a payload that is not JSON as text', () => {
    expect(execFailureMessage(bytes('command terminated'))).toBe('command terminated');
  });
});
