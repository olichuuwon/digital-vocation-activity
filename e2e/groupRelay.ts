/**
 * Tiny WebSocket relay for group play in tests and local dev (no Supabase needed).
 * Run: `node e2e/groupRelay.ts [--port 4174]`, then build/dev with VITE_GROUP_RELAY_URL=ws://localhost:4174.
 *
 * Rooms come from `?room=` on the WebSocket URL. A client sends {type:'track', meta} to set its
 * presence and {type:'msg', data} to broadcast; the relay forwards msgs to everyone else in the
 * room and sends {type:'presence', metas} to the room whenever presence changes.
 * Nothing is stored or logged. Only node: built-ins (Node 22 runs this .ts file directly).
 */
import { createHash } from 'node:crypto';
import { createServer, type IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';

interface Conn {
  socket: Duplex;
  room: string;
  meta: unknown;
  buf: Buffer;
  frags: Buffer[];
  alive: boolean;
}

const rooms = new Map<string, Set<Conn>>();
const MAX_FRAME = 64 * 1024;

function frame(text: string, opcode = 0x1): Buffer {
  const payload = Buffer.from(text);
  const len = payload.length;
  const head = len < 126 ? Buffer.alloc(2) : len < 65536 ? Buffer.alloc(4) : Buffer.alloc(10);
  head[0] = 0x80 | opcode;
  if (len < 126) head[1] = len;
  else if (len < 65536) {
    head[1] = 126;
    head.writeUInt16BE(len, 2);
  } else {
    head[1] = 127;
    head.writeBigUInt64BE(BigInt(len), 2);
  }
  return Buffer.concat([head, payload]);
}

function sendTo(c: Conn, obj: unknown) {
  if (c.alive) c.socket.write(frame(JSON.stringify(obj)));
}

function presence(room: string) {
  const conns = rooms.get(room);
  if (!conns) return;
  const metas = [...conns].map((c) => c.meta).filter((m) => m !== null);
  for (const c of conns) sendTo(c, { type: 'presence', metas });
}

function drop(c: Conn) {
  if (!c.alive) return;
  c.alive = false;
  c.socket.destroy();
  const conns = rooms.get(c.room);
  conns?.delete(c);
  if (conns && conns.size === 0) rooms.delete(c.room);
  else presence(c.room);
}

function onText(c: Conn, text: string) {
  let m: { type?: string; meta?: unknown; data?: unknown };
  try {
    m = JSON.parse(text) as typeof m;
  } catch {
    return;
  }
  if (m.type === 'track') {
    c.meta = m.meta ?? null;
    presence(c.room);
  } else if (m.type === 'msg') {
    for (const other of rooms.get(c.room) ?? []) if (other !== c) sendTo(other, { type: 'msg', data: m.data });
  }
}

/** Parses as many complete frames as the buffer holds. */
function onData(c: Conn, chunk: Buffer) {
  c.buf = Buffer.concat([c.buf, chunk]);
  for (;;) {
    if (c.buf.length < 2) return;
    const b0 = c.buf[0]!;
    const b1 = c.buf[1]!;
    const fin = (b0 & 0x80) !== 0;
    const opcode = b0 & 0x0f;
    const masked = (b1 & 0x80) !== 0;
    let len = b1 & 0x7f;
    let off = 2;
    if (len === 126) {
      if (c.buf.length < 4) return;
      len = c.buf.readUInt16BE(2);
      off = 4;
    } else if (len === 127) {
      if (c.buf.length < 10) return;
      len = Number(c.buf.readBigUInt64BE(2));
      off = 10;
    }
    if (len > MAX_FRAME) return drop(c);
    const maskOff = off;
    if (masked) off += 4;
    if (c.buf.length < off + len) return;
    const payload = Buffer.from(c.buf.subarray(off, off + len));
    if (masked) for (let i = 0; i < len; i++) payload[i] = payload[i]! ^ c.buf[maskOff + (i % 4)]!;
    c.buf = c.buf.subarray(off + len);

    if (opcode === 0x8) return drop(c); // close
    if (opcode === 0x9) {
      c.socket.write(frame(payload.toString(), 0xa)); // ping → pong
      continue;
    }
    if (opcode === 0xa) continue;
    if (opcode === 0x1 || opcode === 0x0) {
      c.frags.push(payload);
      if (fin) {
        const text = Buffer.concat(c.frags).toString();
        c.frags = [];
        onText(c, text);
      }
    }
  }
}

function upgrade(req: IncomingMessage, socket: Duplex) {
  const key = req.headers['sec-websocket-key'];
  if (typeof key !== 'string') return socket.destroy();
  const accept = createHash('sha1').update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`).digest('base64');
  socket.write(
    `HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`,
  );
  const room = new URL(req.url ?? '/', 'http://relay').searchParams.get('room') ?? 'default';
  const c: Conn = { socket, room, meta: null, buf: Buffer.alloc(0), frags: [], alive: true };
  if (!rooms.has(room)) rooms.set(room, new Set());
  rooms.get(room)!.add(c);
  socket.on('data', (d: Buffer) => onData(c, d));
  socket.on('close', () => drop(c));
  socket.on('error', () => drop(c));
  presence(room);
}

const argPort = process.argv.indexOf('--port');
const port = Number(argPort > 0 ? process.argv[argPort + 1] : (process.env.RELAY_PORT ?? 4174));
const server = createServer((_req, res) => {
  res.writeHead(200, { 'content-type': 'text/plain', 'access-control-allow-origin': '*' });
  res.end('group relay ok');
});
server.on('upgrade', upgrade);
server.listen(port, () => console.log(`group relay on ws://localhost:${port}`));
