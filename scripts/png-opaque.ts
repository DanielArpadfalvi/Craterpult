/// <reference types="node" />
/**
 * Re-encode an 8-bit RGBA/RGB PNG (Chromium screenshots) as an opaque 24-bit RGB PNG.
 *
 * Google Play wants "24-bit PNG (no alpha)" screenshots and App Store Connect rejects images with
 * an alpha channel. Pure Node (zlib), so the store screenshot run does not depend on sharp's
 * native binary (missing on some Windows installs).
 */
import { deflateSync, inflateSync } from 'node:zlib';

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (const b of buf) c = (CRC_TABLE[(c ^ b) & 0xff] as number) ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0);
  return Buffer.concat([head, data, crc]);
}

const paeth = (a: number, b: number, c: number): number => {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
};

/** Returns the PNG as opaque RGB (alpha dropped; the input is expected to be opaque already). */
export function opaquePng(png: Buffer): Buffer {
  if (!png.subarray(0, 8).equals(SIGNATURE)) throw new Error('not a PNG');
  let width = 0;
  let height = 0;
  let colorType = -1;
  const idat: Buffer[] = [];
  for (let off = 8; off < png.length;) {
    const len = png.readUInt32BE(off);
    const type = png.toString('ascii', off + 4, off + 8);
    const data = png.subarray(off + 8, off + 8 + len);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      const depth = data[8];
      colorType = data[9] ?? -1;
      if (depth !== 8 || (colorType !== 6 && colorType !== 2) || data[12] !== 0) {
        throw new Error(`unsupported PNG (depth ${depth}, color type ${colorType}, interlaced)`);
      }
    } else if (type === 'IDAT') idat.push(data);
    off += 12 + len;
  }
  if (colorType === 2) return png;
  const raw = inflateSync(Buffer.concat(idat));
  const bpp = 4;
  const stride = width * bpp;
  const prev = new Uint8Array(stride);
  const cur = new Uint8Array(stride);
  const outStride = width * 3;
  const out = Buffer.alloc((outStride + 1) * height);
  const rgbPrev = new Uint8Array(outStride);
  const rgb = new Uint8Array(outStride);
  const cand = [0, 1, 2, 3, 4].map(() => new Uint8Array(outStride));
  for (let y = 0; y < height; y++) {
    const base = y * (stride + 1);
    const filter = raw[base];
    for (let i = 0; i < stride; i++) {
      const x = raw[base + 1 + i] as number;
      const a = i >= bpp ? (cur[i - bpp] as number) : 0;
      const b = prev[i] as number;
      const c = i >= bpp ? (prev[i - bpp] as number) : 0;
      let v = x;
      if (filter === 1) v = x + a;
      else if (filter === 2) v = x + b;
      else if (filter === 3) v = x + ((a + b) >> 1);
      else if (filter === 4) v = x + paeth(a, b, c);
      cur[i] = v & 0xff;
    }
    for (let p = 0; p < width; p++) {
      rgb[p * 3] = cur[p * 4] as number;
      rgb[p * 3 + 1] = cur[p * 4 + 1] as number;
      rgb[p * 3 + 2] = cur[p * 4 + 2] as number;
    }
    // Pick the filter with the smallest sum of absolute values (the usual PNG heuristic).
    let bestType = 0;
    let bestSum = Infinity;
    for (let t = 0; t < 5; t++) {
      const dst = cand[t] as Uint8Array;
      let sum = 0;
      for (let i = 0; i < outStride; i++) {
        const x = rgb[i] as number;
        const a = i >= 3 ? (rgb[i - 3] as number) : 0;
        const b = rgbPrev[i] as number;
        const c = i >= 3 ? (rgbPrev[i - 3] as number) : 0;
        let v = x;
        if (t === 1) v = x - a;
        else if (t === 2) v = x - b;
        else if (t === 3) v = x - ((a + b) >> 1);
        else if (t === 4) v = x - paeth(a, b, c);
        v &= 0xff;
        dst[i] = v;
        sum += v < 128 ? v : 256 - v;
      }
      if (sum < bestSum) {
        bestSum = sum;
        bestType = t;
      }
    }
    const o = y * (outStride + 1);
    out[o] = bestType;
    out.set(cand[bestType] as Uint8Array, o + 1);
    prev.set(cur);
    rgbPrev.set(rgb);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([
    SIGNATURE,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(out, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
