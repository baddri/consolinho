import { createHash } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';

/** The server end of an accepted WebSocket: text frames in and out, and its close. */
export interface WebSocketPeer {
  /** Sends one unmasked text frame. */
  send: (text: string) => void;
  /** Sends a close frame with `code` and ends the socket. */
  close: (code?: number) => void;
  /** Called with every complete text message the client sends. */
  onText: (listener: (text: string) => void) => void;
}

/** RFC 6455 §1.3: the GUID appended to `Sec-WebSocket-Key` for `Sec-WebSocket-Accept`. */
const HANDSHAKE_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

/**
 * Completes a WebSocket handshake on a Node `upgrade` and speaks just enough RFC 6455 for the fake API server's exec
 * (text frames, fragmentation, ping/pong, close), so the e2e needs no WebSocket dependency. The FleetConsole proxy
 * relays the browser's (masked) frames byte for byte after the 101, so this is the same framing a kube-apiserver sees.
 */
export function acceptWebSocket(request: IncomingMessage, socket: Duplex, protocol: string): WebSocketPeer {
  const accept = createHash('sha1')
    .update(`${String(request.headers['sec-websocket-key'])}${HANDSHAKE_GUID}`)
    .digest('base64');
  socket.write(
    [
      'HTTP/1.1 101 Switching Protocols',
      'Upgrade: websocket',
      'Connection: Upgrade',
      `Sec-WebSocket-Accept: ${accept}`,
      `Sec-WebSocket-Protocol: ${protocol}`,
      '',
      '',
    ].join('\r\n'),
  );

  const listeners: ((text: string) => void)[] = [];
  let closed = false;
  const writeFrame = (opcode: number, payload: Buffer) => {
    if (closed || socket.destroyed) return;
    const length = payload.length;
    const header =
      length < 126
        ? Buffer.from([0x80 | opcode, length])
        : length < 65_536
          ? Buffer.from([0x80 | opcode, 126, length >> 8, length & 0xff])
          : Buffer.concat([Buffer.from([0x80 | opcode, 127]), bigEndian64(length)]);
    socket.write(Buffer.concat([header, payload]));
  };
  const close = (code = 1000) => {
    const payload = Buffer.alloc(2);
    payload.writeUInt16BE(code);
    writeFrame(0x8, payload);
    closed = true;
    socket.end();
  };

  let buffered = Buffer.alloc(0);
  let fragments: Buffer[] = [];
  socket.on('error', () => undefined);
  socket.on('data', (chunk: Buffer) => {
    buffered = Buffer.concat([buffered, chunk]);
    for (;;) {
      const frame = readFrame(buffered);
      if (!frame) return;
      buffered = buffered.subarray(frame.size);
      if (frame.opcode === 0x8) {
        if (!closed) close(frame.payload.length >= 2 ? frame.payload.readUInt16BE(0) : 1000);
        return;
      }
      if (frame.opcode === 0x9) writeFrame(0xa, frame.payload);
      if (frame.opcode === 0x1 || frame.opcode === 0x0) {
        fragments.push(frame.payload);
        if (frame.fin) {
          const text = Buffer.concat(fragments).toString('utf8');
          fragments = [];
          for (const listener of listeners) listener(text);
        }
      }
    }
  });
  return {
    send: (text) => writeFrame(0x1, Buffer.from(text, 'utf8')),
    close,
    onText: (listener) => listeners.push(listener),
  };
}

function bigEndian64(value: number): Buffer {
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64BE(BigInt(value));
  return buffer;
}

/** The first complete frame in `data` (unmasked), or `undefined` while it is still arriving. */
function readFrame(data: Buffer): { fin: boolean; opcode: number; payload: Buffer; size: number } | undefined {
  if (data.length < 2) return undefined;
  const first = data[0] ?? 0;
  const second = data[1] ?? 0;
  let offset = 2;
  let length = second & 0x7f;
  if (length === 126) {
    if (data.length < 4) return undefined;
    length = data.readUInt16BE(2);
    offset = 4;
  } else if (length === 127) {
    if (data.length < 10) return undefined;
    length = Number(data.readBigUInt64BE(2));
    offset = 10;
  }
  const masked = (second & 0x80) !== 0;
  const maskOffset = offset;
  if (masked) offset += 4;
  if (data.length < offset + length) return undefined;
  const payload = Buffer.from(data.subarray(offset, offset + length));
  if (masked) {
    for (let i = 0; i < payload.length; i++) {
      payload[i] = (payload[i] ?? 0) ^ (data[maskOffset + (i % 4)] ?? 0);
    }
  }
  return { fin: (first & 0x80) !== 0, opcode: first & 0x0f, payload, size: offset + length };
}
