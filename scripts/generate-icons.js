// Simple script to generate valid PNG icons for PWA compliance
import fs from 'fs';
import zlib from 'zlib';

function createPng(width, height, r, g, b) {
  // PNG signature
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR chunk
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData.writeUInt8(8, 8); // bit depth 8
  ihdrData.writeUInt8(2, 9); // color type 2 (RGB)
  ihdrData.writeUInt8(0, 10); // compression
  ihdrData.writeUInt8(0, 11); // filter
  ihdrData.writeUInt8(0, 12); // interlace

  const ihdrChunk = createChunk('IHDR', ihdrData);

  // Raw image data: filter byte 0 followed by width * 3 bytes per scanline
  const rowSize = 1 + width * 3;
  const rawData = Buffer.alloc(rowSize * height);

  for (let y = 0; y < height; y++) {
    const rowOffset = y * rowSize;
    rawData[rowOffset] = 0; // Filter: None
    for (let x = 0; x < width; x++) {
      const pixelOffset = rowOffset + 1 + x * 3;
      // Border and inner styling
      const isBorder = x < 12 || x > width - 13 || y < 12 || y > height - 13;
      const isCenter = Math.hypot(x - width / 2, y - height / 2) < width * 0.28;
      
      if (isBorder) {
        rawData[pixelOffset] = 34;   // #22c55e (Neon Green)
        rawData[pixelOffset + 1] = 197;
        rawData[pixelOffset + 2] = 94;
      } else if (isCenter) {
        rawData[pixelOffset] = 16;   // Neon glow
        rawData[pixelOffset + 1] = 185;
        rawData[pixelOffset + 2] = 129;
      } else {
        rawData[pixelOffset] = r;
        rawData[pixelOffset + 1] = g;
        rawData[pixelOffset + 2] = b;
      }
    }
  }

  const compressedData = zlib.deflateSync(rawData);
  const idatChunk = createChunk('IDAT', compressedData);
  const iendChunk = createChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

function createChunk(type, data) {
  const length = data.length;
  const buffer = Buffer.alloc(12 + length);
  buffer.writeUInt32BE(length, 0);
  buffer.write(type, 4, 4, 'ascii');
  data.copy(buffer, 8);

  const crc = crc32(buffer.subarray(4, 8 + length));
  buffer.writeUInt32BE(crc, 8 + length);
  return buffer;
}

// CRC32 implementation
function crc32(buf) {
  let crc = 0 ^ (-1);
  for (let i = 0; i < buf.length; i++) {
    crc = (crc >>> 8) ^ table[(crc ^ buf[i]) & 0xff];
  }
  return (crc ^ (-1)) >>> 0;
}

const table = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let k = 0; k < 8; k++) {
    c = ((c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1));
  }
  table[i] = c;
}

// Generate files
const p192 = createPng(192, 192, 15, 23, 42); // dark background
fs.writeFileSync('public/icon-192.png', p192);

const p512 = createPng(512, 512, 15, 23, 42);
fs.writeFileSync('public/icon-512.png', p512);

const pMask = createPng(512, 512, 15, 23, 42);
fs.writeFileSync('public/icon-maskable-512.png', pMask);

const appleIcon = createPng(180, 180, 15, 23, 42);
fs.writeFileSync('public/apple-touch-icon.png', appleIcon);

console.log('PNG icons created successfully!');
