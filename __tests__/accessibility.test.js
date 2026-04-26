import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '..');

function readProjectFile(...segments) {
    return readFileSync(join(projectRoot, ...segments), 'utf8');
}

describe('accessibility baseline', () => {
    it('ships dialog labelling and keyboard-friendly replay controls', () => {
        const html = readProjectFile('public', 'index.html');
        expect(html).toContain('id="replay-modal"');
        expect(html).toContain('aria-labelledby="replay-heading"');
        expect(html).toContain('aria-describedby="replay-counter"');
        expect(html).toContain('id="replay-timeline" class="replay-timeline" role="list"');
        expect(html).toContain('id="replay-counter" class="replay-counter" aria-live="polite"');
        expect(html).toContain('id="menu-feedback"');
        expect(html).toContain('aria-live="polite"');
        expect(html).toContain('id="connection-status"');
    });

    it('uses semantic, keyboard-accessible timeline controls in replay.js', () => {
        const replayJs = readProjectFile('public', 'js', 'replay.js');
        expect(replayJs).toContain("document.createElement('button')");
        expect(replayJs).toContain("dot.type = 'button'");
        expect(replayJs).toContain("e.key === 'ArrowRight'");
        expect(replayJs).toContain("e.key === 'ArrowLeft'");
    });

    it('supports keyboard tab switching in main menu flow', () => {
        const mainJs = readProjectFile('public', 'js', 'main.js');
        expect(mainJs).toContain("btn.addEventListener('keydown'");
        expect(mainJs).toContain("e.key !== 'ArrowRight' && e.key !== 'ArrowLeft'");
        expect(mainJs).toContain('tabButtons[next].click()');
        expect(mainJs).toContain('menu.feedback.roomCodeProgress');
    });

    it('exposes visible focus styles for key interactive roles', () => {
        const css = readProjectFile('public', 'styles.css');
        expect(css).toContain("[role='radio']:focus-visible");
        expect(css).toContain("[role='tab']:focus-visible");
        expect(css).toContain('.timeline-dot:focus-visible');
    });
});
