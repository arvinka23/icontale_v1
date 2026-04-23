import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const LOCALES_DIR = join(__dirname, '..', 'public', 'locales');

function loadLocale(code) {
    return JSON.parse(readFileSync(join(LOCALES_DIR, `${code}.json`), 'utf8'));
}

function collectKeys(obj, prefix = '', out = new Set()) {
    for (const [key, value] of Object.entries(obj)) {
        if (key.startsWith('$')) continue; // meta
        const path = prefix ? `${prefix}.${key}` : key;
        if (value && typeof value === 'object' && !Array.isArray(value)) {
            collectKeys(value, path, out);
        } else {
            out.add(path);
        }
    }
    return out;
}

describe('locales', () => {
    const files = readdirSync(LOCALES_DIR).filter((f) => f.endsWith('.json'));

    it('ships at least the German and English locale', () => {
        expect(files).toContain('de.json');
        expect(files).toContain('en.json');
    });

    it.each(files)('%s is valid JSON with a $meta block', (file) => {
        const data = loadLocale(file.replace('.json', ''));
        expect(data.$meta).toBeDefined();
        expect(typeof data.$meta.language).toBe('string');
        expect(typeof data.$meta.languageName).toBe('string');
    });

    it('every locale has exactly the same key set as the reference (de)', () => {
        const reference = collectKeys(loadLocale('de'));
        for (const file of files) {
            const code = file.replace('.json', '');
            if (code === 'de') continue;
            const keys = collectKeys(loadLocale(code));

            const missing = [...reference].filter((k) => !keys.has(k));
            const extra = [...keys].filter((k) => !reference.has(k));

            expect(missing, `${code}: missing keys`).toEqual([]);
            expect(extra, `${code}: unexpected keys`).toEqual([]);
        }
    });

    it('every value is a non-empty string', () => {
        for (const file of files) {
            const data = loadLocale(file.replace('.json', ''));
            for (const [key, value] of Object.entries(data)) {
                if (key.startsWith('$')) continue;
                expect(typeof value, `${file}:${key}`).toBe('string');
                expect(value.length, `${file}:${key}`).toBeGreaterThan(0);
            }
        }
    });

    it('interpolation placeholders line up between locales', () => {
        const de = loadLocale('de');
        const en = loadLocale('en');
        const re = /\{(\w+)\}/g;

        for (const key of Object.keys(de)) {
            if (key.startsWith('$')) continue;
            const placeholdersDe = new Set([...de[key].matchAll(re)].map((m) => m[1]));
            const placeholdersEn = new Set([...(en[key] || '').matchAll(re)].map((m) => m[1]));

            // English must cover at least every placeholder German uses.
            for (const p of placeholdersDe) {
                expect(placeholdersEn.has(p), `${key} missing {${p}} in en.json`).toBe(true);
            }
        }
    });
});
