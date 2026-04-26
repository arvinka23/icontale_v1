#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════
//  IconTale — Sitemap lastmod updater
//
//  Rewrites the <lastmod> entries in public/sitemap.xml to the date
//  of the current HEAD commit (UTC, YYYY-MM-DD). Intended to be run
//  in CI (main branch only) before the deploy step so search engines
//  see fresh timestamps on every release.
//
//  Usage:
//      node scripts/update-sitemap.js
//
//  Exits with 0 on success, 1 on any failure (missing file, bad XML).
// ═══════════════════════════════════════════════════════════════

const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');

const SITEMAP = path.join(__dirname, '..', 'public', 'sitemap.xml');

function getCommitDate() {
    try {
        return execSync('git log -1 --format=%cs', { encoding: 'utf8' }).trim();
    } catch {
        return new Date().toISOString().slice(0, 10);
    }
}

function main() {
    if (!fs.existsSync(SITEMAP)) {
        console.error('[update-sitemap] sitemap.xml not found at', SITEMAP);
        process.exit(1);
    }

    const date = getCommitDate();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        console.error('[update-sitemap] bad date from git:', date);
        process.exit(1);
    }

    const src = fs.readFileSync(SITEMAP, 'utf8');
    const out = src.replace(/<lastmod>[^<]*<\/lastmod>/g, `<lastmod>${date}</lastmod>`);

    if (out === src) {
        console.log('[update-sitemap] no <lastmod> tags found, nothing to do');
        return;
    }

    fs.writeFileSync(SITEMAP, out);
    console.log('[update-sitemap] set <lastmod>', date);
}

main();
