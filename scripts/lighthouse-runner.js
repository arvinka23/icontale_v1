#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const OUTPUT_DIR = path.join(ROOT, 'artifacts', 'lighthouse');
const DEFAULT_URL = process.env.LIGHTHOUSE_URL || 'http://127.0.0.1:3000/';
const HAS_CUSTOM_URL = Boolean(process.env.LIGHTHOUSE_URL);
const IS_CI = process.argv.includes('--ci');
const ENFORCE = IS_CI || process.env.LIGHTHOUSE_ENFORCE === 'true';

const THRESHOLDS = {
    performance: Number(process.env.LH_MIN_PERFORMANCE || 85),
    accessibility: Number(process.env.LH_MIN_ACCESSIBILITY || 90),
    'best-practices': Number(process.env.LH_MIN_BEST_PRACTICES || 95),
    seo: Number(process.env.LH_MIN_SEO || 90),
};

function spawnCommand(command, args, opts = {}) {
    return new Promise((resolve, reject) => {
        const child = spawn(command, args, {
            cwd: ROOT,
            stdio: opts.silent ? 'pipe' : 'inherit',
            shell: false,
            env: { ...process.env, ...(opts.env || {}) },
        });
        let stderr = '';
        if (opts.silent && child.stderr) {
            child.stderr.on('data', (d) => {
                stderr += d.toString();
            });
        }
        child.on('error', reject);
        child.on('exit', (code) => {
            if (code === 0) resolve();
            else reject(new Error(stderr || `${command} exited with code ${code}`));
        });
    });
}

async function waitForHealth(url) {
    const healthUrl = new URL('/health', url).toString();
    for (let i = 0; i < 20; i++) {
        try {
            const res = await fetch(healthUrl);
            if (res.ok) return;
        } catch {
            // continue retry loop
        }
        await new Promise((r) => setTimeout(r, 1000));
    }
    throw new Error(`Server did not become healthy at ${healthUrl}`);
}

async function isHealthy(url) {
    try {
        const res = await fetch(new URL('/health', url).toString());
        return res.ok;
    } catch {
        return false;
    }
}

async function killProcessTree(child) {
    if (!child || child.killed || !child.pid) return;
    if (process.platform === 'win32') {
        try {
            await spawnCommand('taskkill', ['/pid', String(child.pid), '/t', '/f'], { silent: true });
            return;
        } catch {
            // fall back to standard kill below
        }
    }
    child.kill('SIGTERM');
}

function ensureOutputDir() {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

function getCliPath() {
    const cliPath = path.join(ROOT, 'node_modules', 'lighthouse', 'cli', 'index.js');
    if (!fs.existsSync(cliPath)) {
        throw new Error('Lighthouse CLI not found. Run: npm install -D lighthouse');
    }
    return cliPath;
}

async function runLighthouse(url, profile, cliPath) {
    const outputPath = path.join(OUTPUT_DIR, `lighthouse-${profile}.json`);
    const args = [
        cliPath,
        url,
        '--quiet',
        '--chrome-flags=--headless=new --no-sandbox --disable-dev-shm-usage',
        '--output=json',
        `--output-path=${outputPath}`,
    ];
    if (profile === 'desktop') args.push('--preset=desktop');
    await spawnCommand(process.execPath, args);
    const report = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
    return { outputPath, report };
}

function summarize(label, report) {
    const categories = report.categories || {};
    const audits = report.audits || {};
    const score = (k) => Math.round((categories[k]?.score || 0) * 100);
    const val = (k) => audits[k]?.displayValue || 'n/a';
    return {
        label,
        scores: {
            performance: score('performance'),
            accessibility: score('accessibility'),
            'best-practices': score('best-practices'),
            seo: score('seo'),
        },
        cwv: {
            lcp: val('largest-contentful-paint'),
            cls: val('cumulative-layout-shift'),
            inp: val('interaction-to-next-paint'),
        },
    };
}

function writeSummary(results) {
    const summaryJson = path.join(OUTPUT_DIR, 'summary.json');
    const summaryMd = path.join(OUTPUT_DIR, 'summary.md');
    fs.writeFileSync(summaryJson, JSON.stringify(results, null, 2));

    const lines = [
        '# Lighthouse Summary',
        '',
        `Generated: ${new Date().toISOString()}`,
        '',
    ];
    for (const item of results) {
        lines.push(`## ${item.label}`);
        lines.push(`- Performance: ${item.scores.performance}`);
        lines.push(`- Accessibility: ${item.scores.accessibility}`);
        lines.push(`- Best Practices: ${item.scores['best-practices']}`);
        lines.push(`- SEO: ${item.scores.seo}`);
        lines.push(`- LCP: ${item.cwv.lcp}`);
        lines.push(`- CLS: ${item.cwv.cls}`);
        lines.push(`- INP: ${item.cwv.inp}`);
        lines.push('');
    }
    fs.writeFileSync(summaryMd, `${lines.join('\n')}\n`);
}

function checkThresholds(results) {
    const failures = [];
    for (const item of results) {
        for (const [key, min] of Object.entries(THRESHOLDS)) {
            if (item.scores[key] < min) {
                failures.push(`${item.label}: ${key} ${item.scores[key]} < ${min}`);
            }
        }
    }
    return failures;
}

async function main() {
    ensureOutputDir();
    const cliPath = getCliPath();
    let serverProcess = null;
    let startedByScript = false;
    const shouldStartServer = process.env.LIGHTHOUSE_START_SERVER !== 'false';
    let runUrl = DEFAULT_URL;

    try {
        const serverAlreadyHealthy = await isHealthy(runUrl);
        if (shouldStartServer && !serverAlreadyHealthy) {
            startedByScript = true;
            const env = { ...process.env };
            if (!HAS_CUSTOM_URL) {
                env.PORT = env.PORT || '4173';
                runUrl = `http://127.0.0.1:${env.PORT}/`;
            }
            serverProcess = spawn('npm', ['run', 'start'], {
                cwd: ROOT,
                stdio: 'inherit',
                shell: true,
                env,
            });
            await waitForHealth(runUrl);
        }

        const mobile = await runLighthouse(runUrl, 'mobile', cliPath);
        const desktop = await runLighthouse(runUrl, 'desktop', cliPath);
        const results = [
            summarize('Mobile', mobile.report),
            summarize('Desktop', desktop.report),
        ];
        writeSummary(results);

        const failures = checkThresholds(results);
        if (failures.length > 0) {
            const text = `Lighthouse threshold misses:\n${failures.join('\n')}`;
            if (ENFORCE) throw new Error(text);
            console.warn(text);
        }
    } finally {
        if (startedByScript) {
            await killProcessTree(serverProcess);
        }
    }
}

main().catch((err) => {
    console.error(`[lighthouse-runner] ${err.message}`);
    process.exit(1);
});
