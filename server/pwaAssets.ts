import zlib from 'zlib';

export type PwaIconName =
  | 'pwa-192x192.png'
  | 'pwa-512x512.png'
  | 'pwa-maskable-512x512.png'
  | 'apple-touch-icon.png'
  | 'icon.svg';

export interface PwaAssetPayload {
  contentType: string;
  body: Buffer;
}

// Precompute CRC32 table for valid PNG chunk encoding
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) !== 0 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function makePngChunk(type: string, data: Buffer): Buffer {
  const typeBuf = Buffer.from(type, 'ascii');
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);
  const crcInput = Buffer.concat([typeBuf, data]);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(crcInput), 0);
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

function encodeRgbaPng(width: number, height: number, rgba: Uint8Array): Buffer {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    const rowStart = y * (stride + 1);
    raw[rowStart] = 0; // no filter
    const srcStart = y * stride;
    raw.set(rgba.subarray(srcStart, srcStart + stride), rowStart + 1);
  }

  const compressed = zlib.deflateSync(raw, { level: 6 });

  return Buffer.concat([
    signature,
    makePngChunk('IHDR', ihdr),
    makePngChunk('IDAT', compressed),
    makePngChunk('IEND', Buffer.alloc(0)),
  ]);
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

function distToSegment(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number
): number {
  const abx = bx - ax;
  const aby = by - ay;
  const apx = px - ax;
  const apy = py - ay;
  const abLenSq = abx * abx + aby * aby;
  const t = abLenSq > 1e-9 ? clamp01((apx * abx + apy * aby) / abLenSq) : 0;
  const cx = ax + abx * t;
  const cy = ay + aby * t;
  return Math.hypot(px - cx, py - cy);
}

function blendPixel(
  rgba: Uint8Array,
  idx: number,
  r: number,
  g: number,
  b: number,
  alpha: number
): void {
  const a = clamp01(alpha);
  if (a <= 0) return;
  const inv = 1 - a;
  rgba[idx] = Math.round(rgba[idx] * inv + r * a);
  rgba[idx + 1] = Math.round(rgba[idx + 1] * inv + g * a);
  rgba[idx + 2] = Math.round(rgba[idx + 2] * inv + b * a);
  rgba[idx + 3] = 255;
}

/**
 * Renders the Physica Studio 3D physics emblem to an RGBA PNG buffer.
 * Maskable icons keep all primary artwork strictly inside the central 70% safe zone
 * on a full-bleed #0b1120 background so Android circular/squircle masks never clip.
 */
function renderPhysicsIconPng(size: number, maskable: boolean): Buffer {
  const rgba = new Uint8Array(size * size * 4);
  const scale = maskable ? 0.68 : 0.86;
  const aa = 1.6 / size;

  // Pivot, upper bob, and lower bob positions in normalized icon coordinates [-1, 1]
  const pivotX = 0.0;
  const pivotY = -0.34 * scale;
  const bob1X = 0.28 * scale;
  const bob1Y = 0.06 * scale;
  const bob2X = -0.18 * scale;
  const bob2Y = 0.42 * scale;
  const footL_X = -0.34 * scale;
  const footR_X = 0.34 * scale;
  const footY = 0.48 * scale;

  for (let y = 0; y < size; y++) {
    const ny = ((y + 0.5) / size) * 2 - 1;
    for (let x = 0; x < size; x++) {
      const nx = ((x + 0.5) / size) * 2 - 1;
      const idx = (y * size + x) * 4;

      // Full-bleed deep slate background (#0b1120) with subtle radial highlight
      const rCenter = Math.hypot(nx, ny);
      const glow = Math.exp(-rCenter * rCenter * 2.2) * 0.26;
      rgba[idx] = Math.round(11 + 28 * glow);
      rgba[idx + 1] = Math.round(17 + 64 * glow);
      rgba[idx + 2] = Math.round(32 + 105 * glow);
      rgba[idx + 3] = 255;

      // Outer subtle circular frame
      const outerR = 0.78 * scale;
      const ringDist = Math.abs(rCenter - outerR);
      const ringAlpha = (1 - smoothstep(0.018 * scale, 0.018 * scale + aa, ringDist)) * 0.42;
      blendPixel(rgba, idx, 56, 189, 248, ringAlpha);

      // Tilted orbital ellipse around the apparatus
      const cosA = Math.cos(-0.42);
      const sinA = Math.sin(-0.42);
      const ex = (nx * cosA - ny * sinA) / (0.68 * scale);
      const ey = (nx * sinA + ny * cosA) / (0.34 * scale);
      const eDist = Math.abs(Math.hypot(ex, ey) - 1) * 0.34 * scale;
      const ellipseAlpha = (1 - smoothstep(0.016 * scale, 0.016 * scale + aa, eDist)) * 0.55;
      blendPixel(rgba, idx, 14, 165, 233, ellipseAlpha);

      // Simple A-frame legs behind pendulum
      const legLDist = distToSegment(nx, ny, footL_X, footY, pivotX, pivotY);
      const legRDist = distToSegment(nx, ny, footR_X, footY, pivotX, pivotY);
      const crossY = footY + (pivotY - footY) * 0.36;
      const crossHalf = footR_X * (1 - 0.36);
      const crossDist = distToSegment(nx, ny, -crossHalf, crossY, crossHalf, crossY);
      const frameDist = Math.min(legLDist, legRDist, crossDist);
      const frameAlpha = (1 - smoothstep(0.024 * scale, 0.024 * scale + aa, frameDist)) * 0.85;
      blendPixel(rgba, idx, 100, 116, 139, frameAlpha);

      // Pendulum rods (metallic silver)
      const rod1Dist = distToSegment(nx, ny, pivotX, pivotY, bob1X, bob1Y);
      const rod2Dist = distToSegment(nx, ny, bob1X, bob1Y, bob2X, bob2Y);
      const rodDist = Math.min(rod1Dist, rod2Dist);
      const rodAlpha = 1 - smoothstep(0.024 * scale, 0.024 * scale + aa, rodDist);
      blendPixel(rgba, idx, 226, 232, 240, rodAlpha);

      // Pivot joint dot
      const pivDist = Math.hypot(nx - pivotX, ny - pivotY);
      const pivAlpha = 1 - smoothstep(0.062 * scale, 0.062 * scale + aa, pivDist);
      blendPixel(rgba, idx, 248, 250, 252, pivAlpha);

      // Upper bob (warm amber #eab308) with soft halo
      const b1Dist = Math.hypot(nx - bob1X, ny - bob1Y);
      const b1Glow = Math.exp(-(b1Dist * b1Dist) / (0.045 * scale * scale)) * 0.35;
      blendPixel(rgba, idx, 250, 204, 21, b1Glow);
      const b1Alpha = 1 - smoothstep(0.115 * scale, 0.115 * scale + aa, b1Dist);
      blendPixel(rgba, idx, 234, 179, 8, b1Alpha);

      // Lower bob (luminous cyan #38bdf8) with soft halo
      const b2Dist = Math.hypot(nx - bob2X, ny - bob2Y);
      const b2Glow = Math.exp(-(b2Dist * b2Dist) / (0.055 * scale * scale)) * 0.42;
      blendPixel(rgba, idx, 56, 189, 248, b2Glow);
      const b2Alpha = 1 - smoothstep(0.125 * scale, 0.125 * scale + aa, b2Dist);
      blendPixel(rgba, idx, 56, 189, 248, b2Alpha);
    }
  }

  return encodeRgbaPng(size, size, rgba);
}

const ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <radialGradient id="bgGlow" cx="50%" cy="46%" r="54%">
      <stop offset="0%" stop-color="#1e3a5f"/>
      <stop offset="100%" stop-color="#0b1120"/>
    </radialGradient>
  </defs>
  <rect width="512" height="512" rx="96" fill="url(#bgGlow)"/>
  <circle cx="256" cy="256" r="176" fill="none" stroke="#38bdf8" stroke-opacity="0.4" stroke-width="8"/>
  <ellipse cx="256" cy="256" rx="154" ry="76" transform="rotate(-24 256 256)" fill="none" stroke="#0ea5e9" stroke-opacity="0.58" stroke-width="8"/>
  <g stroke="#64748b" stroke-width="12" stroke-linecap="round">
    <line x1="176" y1="364" x2="256" y2="176"/>
    <line x1="336" y1="364" x2="256" y2="176"/>
    <line x1="204" y1="296" x2="308" y2="296"/>
  </g>
  <g stroke="#e2e8f0" stroke-width="11" stroke-linecap="round">
    <line x1="256" y1="176" x2="320" y2="270"/>
    <line x1="320" y1="270" x2="214" y2="352"/>
  </g>
  <circle cx="256" cy="176" r="15" fill="#f8fafc"/>
  <circle cx="320" cy="270" r="28" fill="#eab308"/>
  <circle cx="214" cy="352" r="30" fill="#38bdf8"/>
</svg>`;

const assetCache = new Map<PwaIconName, PwaAssetPayload>();

const ALLOWLISTED_ICONS: ReadonlySet<string> = new Set<PwaIconName>([
  'pwa-192x192.png',
  'pwa-512x512.png',
  'pwa-maskable-512x512.png',
  'apple-touch-icon.png',
  'icon.svg',
]);

export function isAllowedPwaIconName(name: string): name is PwaIconName {
  return ALLOWLISTED_ICONS.has(name);
}

export function getPwaIconAsset(name: PwaIconName): PwaAssetPayload {
  const existing = assetCache.get(name);
  if (existing) return existing;

  let payload: PwaAssetPayload;
  switch (name) {
    case 'pwa-192x192.png':
      payload = { contentType: 'image/png', body: renderPhysicsIconPng(192, false) };
      break;
    case 'pwa-512x512.png':
      payload = { contentType: 'image/png', body: renderPhysicsIconPng(512, false) };
      break;
    case 'pwa-maskable-512x512.png':
      payload = { contentType: 'image/png', body: renderPhysicsIconPng(512, true) };
      break;
    case 'apple-touch-icon.png':
      payload = { contentType: 'image/png', body: renderPhysicsIconPng(180, false) };
      break;
    case 'icon.svg':
      payload = { contentType: 'image/svg+xml; charset=utf-8', body: Buffer.from(ICON_SVG, 'utf8') };
      break;
  }

  assetCache.set(name, payload);
  return payload;
}
