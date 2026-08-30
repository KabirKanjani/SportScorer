// Generates dist/og.png — the branded 1200x630 link-preview image.
// Pure Node (zlib only): draws a dark gradient with accent streaks and writes a
// real PNG so every social scraper (WhatsApp, iMessage, X, FB, Discord) accepts
// it. Idempotent: only writes when the file is missing.

import { deflateSync } from 'node:zlib';
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = fileURLToPath(new URL('../dist/og.png', import.meta.url));

const W = 1200;
const H = 630;

// ---- minimal PNG writer -----------------------------------------------------
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

// ---- drawing helpers on an RGB buffer ---------------------------------------
const px = Buffer.alloc(W * H * 3);
const at = (x, y) => (y * W + x) * 3;
const blend = (x, y, r, g, b, a) => {
  const i = at(x, y);
  px[i] = Math.round(px[i] * (1 - a) + r * a);
  px[i + 1] = Math.round(px[i + 1] * (1 - a) + g * a);
  px[i + 2] = Math.round(px[i + 2] * (1 - a) + b * a);
};

function fillGradient(top, bottom) {
  for (let y = 0; y < H; y++) {
    const t = y / (H - 1);
    const r = Math.round(top[0] + (bottom[0] - top[0]) * t);
    const g = Math.round(top[1] + (bottom[1] - top[1]) * t);
    const b = Math.round(top[2] + (bottom[2] - top[2]) * t);
    for (let x = 0; x < W; x++) {
      const i = at(x, y);
      px[i] = r;
      px[i + 1] = g;
      px[i + 2] = b;
    }
  }
}

function ellipse(cx, cy, rx, ry, r, g, b, alpha) {
  for (let y = Math.max(0, Math.floor(cy - ry)); y <= Math.min(H - 1, Math.ceil(cy + ry)); y++) {
    for (let x = Math.max(0, Math.floor(cx - rx)); x <= Math.min(W - 1, Math.ceil(cx + rx)); x++) {
      const dx = (x - cx) / rx;
      const dy = (y - cy) / ry;
      if (dx * dx + dy * dy <= 1) {
        const edginess = Math.abs(Math.sqrt(dx * dx + dy * dy) - 1); // soft edge
        blend(x, y, r, g, b, alpha * Math.max(0, 1 - edginess * 6));
      }
    }
  }
}

function diagonalStripe(width, color, alpha) {
  for (let y = 0; y < H; y++) {
    const start = Math.round(H / 2 - width + y * 0.9);
    for (let x = Math.max(0, start); x < Math.min(W, start + width); x++) {
      blend(x, y, color[0], color[1], color[2], alpha);
    }
  }
}

fillGradient([11, 17, 32], [30, 42, 73]);
ellipse(210, 120, 380, 300, 59, 130, 246, 0.22);
ellipse(1030, 540, 420, 320, 124, 58, 237, 0.20);
diagonalStripe(46, [16, 185, 129], 0.9);
diagonalStripe(18, [16, 185, 129], 1);

// Simple "🎾" ball silhouette in the lower-right third: three flat accent dots.
for (let i = 0; i < 10; i++) {
  const a = (i / 10) * Math.PI * 2;
  ellipse(900 + Math.cos(a) * 130, 300 + Math.sin(a) * 130, 30, 30, 255, 255, 255, 0.05);
}

// ---- assemble ----------------------------------------------------------------
const raw = Buffer.alloc(H * (W * 3 + 1));
for (let y = 0; y < H; y++) {
  const rowStart = y * (W * 3 + 1);
  raw[rowStart] = 0; // filter: none
  px.copy(raw, rowStart + 1, y * W * 3, (y + 1) * W * 3);
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0);
ihdr.writeUInt32BE(H, 4);
ihdr[8] = 8; // bit depth
ihdr[9] = 2; // color type: RGB
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
]);

export function ensureOgImage() {
  if (existsSync(OUT)) return OUT;
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, png);
  return OUT;
}

// ---- PWA icons ---------------------------------------------------------
// Full-bleed squares (iOS rounds them; full-bleed is also maskable-safe).
// Stylized optic-yellow ball with white seams on the brand blue gradient.
function iconPng(size) {
  const px = Buffer.alloc(size * size * 3);
  const at = (x, y) => (y * size + x) * 3;
  const blend = (x, y, r, g, b, a) => {
    const i = at(x, y);
    px[i] = Math.round(px[i] * (1 - a) + r * a);
    px[i + 1] = Math.round(px[i + 1] * (1 - a) + g * a);
    px[i + 2] = Math.round(px[i + 2] * (1 - a) + b * a);
  };
  for (let y = 0; y < size; y++) {
    const t = y / (size - 1);
    const r = Math.round(59 + (30 - 59) * t);
    const g = Math.round(130 + (64 - 130) * t);
    const b = Math.round(246 + (175 - 246) * t);
    for (let x = 0; x < size; x++) {
      const i = at(x, y);
      px[i] = r;
      px[i + 1] = g;
      px[i + 2] = b;
    }
  }
  const dot = (cx, cy, rx, ry, r, g, b, alpha) => {
    for (let y = Math.max(0, Math.floor(cy - ry)); y <= Math.min(size - 1, Math.ceil(cy + ry)); y++) {
      for (let x = Math.max(0, Math.floor(cx - rx)); x <= Math.min(size - 1, Math.ceil(cx + rx)); x++) {
        const dx = (x - cx) / rx;
        const dy = (y - cy) / ry;
        if (dx * dx + dy * dy <= 1) {
          const edge = Math.abs(Math.sqrt(dx * dx + dy * dy) - 1);
          blend(x, y, r, g, b, alpha * Math.max(0, 1 - edge * 6));
        }
      }
    }
  };

  const cx = size / 2;
  const cy = size / 2;
  const R = size * 0.31;
  dot(cx, cy, R, R, 226, 240, 84, 1); // ball
  const seamStep = size * 0.014;
  for (const side of [1, -1]) {
    const start = side === 1 ? -Math.PI / 2 : Math.PI / 2;
    const end = side === 1 ? Math.PI / 2 : (3 * Math.PI) / 2;
    for (let th = start; th <= end; th += 0.12) {
      const sx = cx + Math.cos(th) * R * 0.52 + side * R * 0.42;
      const sy = cy + Math.sin(th) * R * 0.8;
      dot(sx, sy, seamStep, seamStep, 248, 250, 252, 0.95);
    }
  }

  const raw = Buffer.alloc(size * (size * 3 + 1));
  for (let y = 0; y < size; y++) {
    const rowStart = y * (size * 3 + 1);
    raw[rowStart] = 0;
    px.copy(raw, rowStart + 1, y * size * 3, (y + 1) * size * 3);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

export function ensureIcons() {
  const iconsDir = fileURLToPath(new URL('../dist/icons/', import.meta.url));
  mkdirSync(iconsDir, { recursive: true });
  const out = [];
  for (const [name, size] of [['icon-192.png', 192], ['icon-512.png', 512], ['apple-touch-icon.png', 180]]) {
    const p = join(iconsDir, name);
    const data = iconPng(size);
    const existing = existsSync(p) ? readFileSync(p) : null;
    if (!existing || !existing.equals(data)) writeFileSync(p, data);
    out.push(p);
  }
  return out;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  console.log(`og.png: ${ensureOgImage()} created`);
  for (const p of ensureIcons()) console.log(`icon: ${p}`);
}