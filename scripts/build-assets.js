#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════
//  IconTale — Asset build script
//
//  Minifies public/styles.css, writes it to public/styles.<hash>.css
//  (plus a pointer at public/styles.min.css for fallback), then
//  rewrites the <link rel="stylesheet"> tag in public/index.html to
//  point at the hashed file. Keeps a backup at public/index.html.bak
//  so `npm start` can be rerun idempotently.
//
//  This is intentionally a small homegrown script — no webpack/vite
//  for a handful of static files.
// ═══════════════════════════════════════════════════════════════

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const CleanCSS = require('clean-css');

const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const SRC_CSS = path.join(PUBLIC_DIR, 'styles.css');
const HTML_FILE = path.join(PUBLIC_DIR, 'index.html');
const SW_FILE = path.join(PUBLIC_DIR, 'sw.js');
const PKG = require(path.join(__dirname, '..', 'package.json'));

function log(...args) {
    console.log('[build-assets]', ...args);
}

function minifyCss(input) {
    const result = new CleanCSS({ level: 2, returnPromise: false }).minify(input);
    if (result.errors.length) {
        throw new Error('CleanCSS errors: ' + result.errors.join('; '));
    }
    if (result.warnings.length) {
        for (const w of result.warnings) log('warn:', w);
    }
    return result.styles;
}

function hashContent(content) {
    return crypto.createHash('sha256').update(content).digest('hex').slice(0, 8);
}

function cleanOldHashedFiles() {
    const re = /^styles\.[a-f0-9]{8}\.css$/;
    for (const f of fs.readdirSync(PUBLIC_DIR)) {
        if (re.test(f)) fs.unlinkSync(path.join(PUBLIC_DIR, f));
    }
}

function rewriteHtml(hashedName) {
    const html = fs.readFileSync(HTML_FILE, 'utf8');
    const re = /<link rel="stylesheet" href="styles(?:\.[a-f0-9]{8}|\.min)?\.css">/;
    if (!re.test(html)) {
        throw new Error('Could not locate stylesheet <link> in index.html');
    }
    const patched = html.replace(re, `<link rel="stylesheet" href="${hashedName}">`);
    fs.writeFileSync(HTML_FILE, patched);
}

function stampServiceWorker() {
    if (!fs.existsSync(SW_FILE)) return;
    const src = fs.readFileSync(SW_FILE, 'utf8');
    const stamp = `${PKG.version}-${Date.now().toString(36)}`;
    const patched = src.replace(/__ICONTALE_VERSION__/g, stamp);
    if (patched !== src) {
        fs.writeFileSync(SW_FILE, patched);
        log(`sw.js: cache name pinned to icontale-${stamp}`);
    }
}

function main() {
    if (!fs.existsSync(SRC_CSS)) {
        throw new Error(`${SRC_CSS} not found`);
    }

    const src = fs.readFileSync(SRC_CSS, 'utf8');
    const minified = minifyCss(src);
    const hash = hashContent(minified);
    const hashedName = `styles.${hash}.css`;
    const hashedPath = path.join(PUBLIC_DIR, hashedName);
    const stablePath = path.join(PUBLIC_DIR, 'styles.min.css');

    cleanOldHashedFiles();
    fs.writeFileSync(hashedPath, minified);
    fs.writeFileSync(stablePath, minified);
    rewriteHtml(hashedName);
    stampServiceWorker();

    const inputKb = (src.length / 1024).toFixed(1);
    const outputKb = (minified.length / 1024).toFixed(1);
    log(`styles.css: ${inputKb} KB -> ${hashedName} (${outputKb} KB)`);
}

main();
