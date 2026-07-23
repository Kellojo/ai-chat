// Rasterizes src/lib/assets/favicon.svg into the PWA PNG icons in static/.
// Run: node scripts/generate-pwa-icons.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const svg = readFileSync(new URL('../src/lib/assets/favicon.svg', import.meta.url));
const out = (name) => fileURLToPath(new URL(`../static/${name}`, import.meta.url));

async function scaled(size) {
	return sharp(svg, { density: 300 }).resize(size, size, { fit: 'contain' }).png().toBuffer();
}

await sharp(await scaled(192)).toFile(out('pwa-192x192.png'));
await sharp(await scaled(512)).toFile(out('pwa-512x512.png'));

// Maskable: logo centered at ~80% size on a solid background (safe zone).
const inner = Math.round(512 * 0.8);
await sharp(await scaled(inner))
	.extend({
		top: Math.floor((512 - inner) / 2),
		bottom: Math.ceil((512 - inner) / 2),
		left: Math.floor((512 - inner) / 2),
		right: Math.ceil((512 - inner) / 2),
		background: '#0a0a0a'
	})
	.png()
	.toFile(out('pwa-maskable-512x512.png'));

console.log('Wrote static/pwa-192x192.png, static/pwa-512x512.png, static/pwa-maskable-512x512.png');
