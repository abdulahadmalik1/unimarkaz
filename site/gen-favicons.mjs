import sharp from 'sharp';
import { mkdirSync, copyFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const src = path.join(root, '..', 'logo', 'logo.png');
const assetsDir = path.join(root, 'assets');
mkdirSync(assetsDir, { recursive: true });

const sizes = [
  { name: 'favicon-16x16.png',  size: 16  },
  { name: 'favicon-32x32.png',  size: 32  },
  { name: 'favicon-48x48.png',  size: 48  },
  { name: 'apple-touch-icon.png', size: 180 },
  { name: 'icon-192.png',        size: 192 },
  { name: 'icon-512.png',        size: 512 },
];

for (const { name, size } of sizes) {
  const dest = path.join(assetsDir, name);
  await sharp(src)
    .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toFile(dest);
  console.log(`Generated ${name} (${size}x${size})`);
}

// Also copy 32x32 as favicon.ico placeholder — browsers fall back to it
copyFileSync(path.join(assetsDir, 'favicon-32x32.png'), path.join(assetsDir, 'favicon.png'));
console.log('Done — all favicon sizes generated in assets/');
