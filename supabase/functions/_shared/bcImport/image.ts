// Safe portrait rendition: decode JPEG, apply EXIF orientation, downscale only, re-encode.
// The re-encoded file carries no EXIF/GPS (encoder writes JFIF only); verified by marker scan.
import jpeg from "npm:jpeg-js@0.4.4";

export const MAX_EDGE = 1600;

/** EXIF orientation (1..8) from the APP1 segment, 1 if absent/unreadable. */
export function readOrientation(b: Uint8Array): number {
  if (b[0] !== 0xff || b[1] !== 0xd8) return 1;
  let i = 2;
  while (i + 4 < b.length) {
    if (b[i] !== 0xff) return 1;
    const m = b[i + 1];
    if (m === 0xda || m === 0xd9) return 1;
    const len = (b[i + 2] << 8) | b[i + 3];
    if (m === 0xe1 && b[i + 4] === 0x45 && b[i + 5] === 0x78 && b[i + 6] === 0x69 && b[i + 7] === 0x66) {
      const t = i + 10;
      const le = b[t] === 0x49;
      const u16 = (o: number) => le ? b[t + o] | (b[t + o + 1] << 8) : (b[t + o] << 8) | b[t + o + 1];
      const u32 = (o: number) => le
        ? (b[t + o] | (b[t + o + 1] << 8) | (b[t + o + 2] << 16) | (b[t + o + 3] << 24)) >>> 0
        : ((b[t + o] << 24) | (b[t + o + 1] << 16) | (b[t + o + 2] << 8) | b[t + o + 3]) >>> 0;
      const ifd = u32(4);
      const n = u16(ifd);
      for (let k = 0; k < n; k++) {
        const e = ifd + 2 + k * 12;
        if (u16(e) === 0x0112) { const v = u16(e + 8); return v >= 1 && v <= 8 ? v : 1; }
      }
      return 1;
    }
    i += 2 + len;
  }
  return 1;
}

/** True if any APPn metadata segment other than APP0/JFIF exists before image data. */
export function hasMetadataSegments(b: Uint8Array): boolean {
  let i = 2;
  while (i + 4 < b.length) {
    if (b[i] !== 0xff) return true;
    const m = b[i + 1];
    if (m === 0xda) return false;
    if (m >= 0xe1 && m <= 0xef) return true;
    if (m === 0xfe) return true; // COM
    i += 2 + ((b[i + 2] << 8) | b[i + 3]);
  }
  return true;
}

type Img = { width: number; height: number; data: Uint8Array };

function downscale(src: Img, maxEdge: number): Img {
  const scale = Math.min(1, maxEdge / Math.max(src.width, src.height));
  if (scale >= 1) return src;
  const w = Math.max(1, Math.round(src.width * scale)), h = Math.max(1, Math.round(src.height * scale));
  const out = new Uint8Array(w * h * 4);
  const fx = src.width / w, fy = src.height / h;
  for (let y = 0; y < h; y++) {
    const y0 = Math.floor(y * fy), y1 = Math.min(src.height, Math.ceil((y + 1) * fy));
    for (let x = 0; x < w; x++) {
      const x0 = Math.floor(x * fx), x1 = Math.min(src.width, Math.ceil((x + 1) * fx));
      let r = 0, g = 0, bl = 0, n = 0;
      for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) {
        const p = (yy * src.width + xx) * 4; r += src.data[p]; g += src.data[p + 1]; bl += src.data[p + 2]; n++;
      }
      const o = (y * w + x) * 4; out[o] = r / n; out[o + 1] = g / n; out[o + 2] = bl / n; out[o + 3] = 255;
    }
  }
  return { width: w, height: h, data: out };
}

function orient(src: Img, o: number): Img {
  if (o === 1) return src;
  const swap = o >= 5;
  const w = swap ? src.height : src.width, h = swap ? src.width : src.height;
  const out = new Uint8Array(w * h * 4);
  for (let y = 0; y < src.height; y++) for (let x = 0; x < src.width; x++) {
    let nx = x, ny = y;
    switch (o) {
      case 2: nx = src.width - 1 - x; break;
      case 3: nx = src.width - 1 - x; ny = src.height - 1 - y; break;
      case 4: ny = src.height - 1 - y; break;
      case 5: nx = y; ny = x; break;
      case 6: nx = src.height - 1 - y; ny = x; break;
      case 7: nx = src.height - 1 - y; ny = src.width - 1 - x; break;
      case 8: nx = y; ny = src.width - 1 - x; break;
    }
    const s = (y * src.width + x) * 4, d = (ny * w + nx) * 4;
    out[d] = src.data[s]; out[d + 1] = src.data[s + 1]; out[d + 2] = src.data[s + 2]; out[d + 3] = 255;
  }
  return { width: w, height: h, data: out };
}

export type Rendition = { bytes: Uint8Array; width: number; height: number; orientation: number };

/** Throws `rendition_unsafe` if the output still carries metadata. */
export function makeRendition(input: Uint8Array, maxEdge = MAX_EDGE): Rendition {
  const orientation = readOrientation(input);
  const dec = jpeg.decode(input, { useTArray: true, formatAsRGBA: true, maxResolutionInMP: 60, maxMemoryUsageInMB: 512 }) as Img;
  const img = orient(downscale({ width: dec.width, height: dec.height, data: dec.data }, maxEdge), orientation);
  // Always hand the encoder a fresh plain raw-pixel object: a jpeg-js decoder result
  // carries `exifBuffer` (and other fields), which the encoder would copy into the output.
  const plain = { width: img.width, height: img.height, data: new Uint8Array(img.data) };
  const enc = jpeg.encode(plain, 88).data as Uint8Array;
  const bytes = new Uint8Array(enc);
  if (hasMetadataSegments(bytes)) throw new Error("rendition_unsafe");
  return { bytes, width: plain.width, height: plain.height, orientation };
}

