import { connect, type Socket } from 'node:net';
import type { Readable } from 'node:stream';

export type ScanResult = { clean: true } | { clean: false; signature: string };

/**
 * Minimal clamd client (INSTREAM over TCP). Files are streamed in chunks and never touch local disk.
 * Throws when clamd is unreachable or reports an error, so the caller retries instead of passing a file.
 */
export class ClamAv {
  constructor(
    private readonly host: string,
    private readonly port: number,
    private readonly timeoutMs = 120_000,
  ) {}

  async ping(): Promise<boolean> {
    return (await this.command('zPING\0')) === 'PONG';
  }

  async scan(stream: Readable): Promise<ScanResult> {
    const socket = await this.open();
    try {
      const reply = readReply(socket);
      await write(socket, Buffer.from('zINSTREAM\0'));
      for await (const chunk of stream) {
        const data = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array);
        const size = Buffer.alloc(4);
        size.writeUInt32BE(data.length);
        await write(socket, size);
        await write(socket, data);
      }
      await write(socket, Buffer.alloc(4)); // zero-length chunk ends the stream
      return parseScanReply(await reply);
    } finally {
      socket.destroy();
    }
  }

  private async command(cmd: string): Promise<string> {
    const socket = await this.open();
    try {
      const reply = readReply(socket);
      await write(socket, Buffer.from(cmd));
      return await reply;
    } finally {
      socket.destroy();
    }
  }

  private open(): Promise<Socket> {
    return new Promise((resolve, reject) => {
      const socket = connect({ host: this.host, port: this.port });
      socket.setTimeout(this.timeoutMs, () => socket.destroy(new Error('clamd timeout')));
      socket.once('connect', () => resolve(socket));
      socket.once('error', reject);
    });
  }
}

export function parseScanReply(reply: string): ScanResult {
  // "stream: OK" | "stream: <Signature> FOUND" | "<message> ERROR"
  if (reply === 'stream: OK') return { clean: true };
  const found = reply.match(/^stream: (.+) FOUND$/);
  if (found) return { clean: false, signature: found[1]! };
  throw new Error(`clamd error: ${reply}`);
}

function write(socket: Socket, data: Buffer): Promise<void> {
  return new Promise((resolve, reject) => socket.write(data, (err) => (err ? reject(err) : resolve())));
}

function readReply(socket: Socket): Promise<string> {
  return new Promise((resolve, reject) => {
    let buf = '';
    socket.on('data', (d) => {
      buf += d.toString();
      const end = buf.indexOf('\0');
      if (end >= 0) resolve(buf.slice(0, end).trim());
    });
    socket.once('end', () => resolve(buf.replace(/\0/g, '').trim()));
    socket.once('error', reject);
  });
}
