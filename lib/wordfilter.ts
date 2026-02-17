// ═══════════════════════════════════════════════════════════════
//  Word Filter — Basic abuse prevention
// ═══════════════════════════════════════════════════════════════

const BLOCKED_PATTERNS: RegExp[] = [
    /\bn[i1][g9]{2,}[e3]r/i,
    /\bf[u*][c(]k/i,
    /\bsch[e3][i1][sß]{1,2}[e3]?/i,
    /\bhur[e3]ns[o0]hn/i,
    /\bwi[x*]{2,}[e3]r/i,
    /\bm[i1]stgeburt/i,
    /\bh[i1]tl[e3]r/i,
    /\bn[a4]z[i1]/i,
    /\bk[i1]nd[e3]rf[i1]ck/i,
];

export interface ContentCheckResult {
    clean: boolean;
    matched?: string;
}

export interface FilterResult {
    clean: boolean;
    reason?: string;
}

export function checkContent(text: unknown): ContentCheckResult {
    if (typeof text !== 'string') return { clean: true };
    const lower = text.toLowerCase();

    for (const pattern of BLOCKED_PATTERNS) {
        if (pattern.test(lower)) {
            return { clean: false, matched: pattern.source };
        }
    }

    return { clean: true };
}

export function checkUsername(username: string): FilterResult {
    const result = checkContent(username);
    if (!result.clean) {
        return { clean: false, reason: 'Der Benutzername enthält unangemessene Inhalte.' };
    }
    return { clean: true };
}

export function checkStory(story: string): FilterResult {
    const result = checkContent(story);
    if (!result.clean) {
        return { clean: false, reason: 'Die Geschichte enthält unangemessene Inhalte. Bitte überarbeite sie.' };
    }
    return { clean: true };
}
