// ═══════════════════════════════════════════════════════════════
//  Word Filter — Basic abuse prevention
// ═══════════════════════════════════════════════════════════════

/**
 * Blocklist of offensive patterns (lowercase, regex-safe).
 * This is a minimal set; expand as needed.
 * @type {RegExp[]}
 */
const BLOCKED_PATTERNS = [
    /\bn[i1][g9]{2,}[e3]r/i,
    /\bf[u\*][c\(]k/i,
    /\bsch[e3][i1][sß]{1,2}[e3]?/i,
    /\bhur[e3]ns[o0]hn/i,
    /\bwi[x\*]{2,}[e3]r/i,
    /\bm[i1]stgeburt/i,
    /\bh[i1]tl[e3]r/i,
    /\bn[a4]z[i1]/i,
    /\bk[i1]nd[e3]rf[i1]ck/i,
];

/**
 * Check if a string contains blocked words.
 * @param {string} text - Text to check.
 * @returns {{ clean: boolean, matched?: string }}
 */
function checkContent(text) {
    if (typeof text !== 'string') return { clean: true };
    const lower = text.toLowerCase();

    for (const pattern of BLOCKED_PATTERNS) {
        if (pattern.test(lower)) {
            return { clean: false, matched: pattern.source };
        }
    }

    return { clean: true };
}

/**
 * Validate that a username is not offensive.
 * @param {string} username - Username to check.
 * @returns {{ clean: boolean, reason?: string }}
 */
function checkUsername(username) {
    const result = checkContent(username);
    if (!result.clean) {
        return { clean: false, reason: 'Username contains inappropriate content.' };
    }
    return { clean: true };
}

/**
 * Validate that a story is not offensive.
 * @param {string} story - Story text to check.
 * @returns {{ clean: boolean, reason?: string }}
 */
function checkStory(story) {
    const result = checkContent(story);
    if (!result.clean) {
        return { clean: false, reason: 'Story contains inappropriate content. Please revise.' };
    }
    return { clean: true };
}

module.exports = {
    checkContent,
    checkUsername,
    checkStory,
};
