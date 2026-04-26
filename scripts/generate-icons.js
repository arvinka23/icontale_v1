const { createCanvas } = require('canvas');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SCRIPTS_DIR = path.join(ROOT, 'scripts');
const PUBLIC_DIR = path.join(ROOT, 'public');

// Ensure directories exist
[SCRIPTS_DIR, PUBLIC_DIR].forEach((dir) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    console.log(`Created directory: ${dir}`);
  }
});

function drawRoundedRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function createIcon192() {
  const size = 192;
  const radius = 16;
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');

  const gradient = ctx.createLinearGradient(0, 0, size, size);
  gradient.addColorStop(0, '#764ba2');
  gradient.addColorStop(1, '#667eea');

  drawRoundedRect(ctx, 0, 0, size, size, radius);
  ctx.fillStyle = gradient;
  ctx.fill();

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 64px Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('IT', size / 2, size / 2 - 12);

  ctx.font = '32px Arial';
  ctx.fillText('📖', size / 2, size / 2 + 36);

  return canvas;
}

function createIcon512() {
  const size = 512;
  const radius = 42;
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');

  const gradient = ctx.createLinearGradient(0, 0, size, size);
  gradient.addColorStop(0, '#764ba2');
  gradient.addColorStop(1, '#667eea');

  drawRoundedRect(ctx, 0, 0, size, size, radius);
  ctx.fillStyle = gradient;
  ctx.fill();

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 170px Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('IT', size / 2, size / 2 - 32);

  ctx.font = '85px Arial';
  ctx.fillText('📖', size / 2, size / 2 + 96);

  return canvas;
}

function createIconMaskable() {
  const size = 512;
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');

  const gradient = ctx.createLinearGradient(0, 0, size, size);
  gradient.addColorStop(0, '#764ba2');
  gradient.addColorStop(1, '#667eea');

  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
  ctx.fillStyle = gradient;
  ctx.fill();

  const centerX = size / 2;
  const centerY = size / 2;

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 170px Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('IT', centerX, centerY - 32);

  ctx.font = '85px Arial';
  ctx.fillText('📖', centerX, centerY + 96);

  return canvas;
}

const outputs = [
  { name: 'public/icon-192.png', fn: createIcon192 },
  { name: 'public/icon-512.png', fn: createIcon512 },
  { name: 'public/icon-maskable.png', fn: createIconMaskable },
];

outputs.forEach(({ name, fn }) => {
  const outPath = path.join(ROOT, name);
  const canvas = fn();
  fs.writeFileSync(outPath, canvas.toBuffer('image/png'));
  console.log(`Generated: ${name}`);
});

console.log('Done.');
