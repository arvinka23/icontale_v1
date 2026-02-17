// ═══════════════════════════════════════════════════════════════
//  Emoji Packs — Emoji sets used for story prompts
// ═══════════════════════════════════════════════════════════════

export const EMOJI_PACKS: Record<string, string[]> = {
    faces: ['😀', '😂', '😍', '😎', '🤔', '😱', '🥳', '😡', '😭', '😴', '👻', '🤖'],
    animals: [
        '🐶', '🐱', '🦄', '🐉', '🐟', '🐬', '🐋', '🦈', '🐊', '🐢', '🐍', '🦎', '🦖', '🐅', '🐆',
        '🦓', '🦍', '🐘', '🦛', '🦏', '🐪', '🦒', '🦘', '🦥', '🦦', '🦨', '🦡', '🐁', '🐇', '🐿️', '🦔',
    ],
    food: [
        '🍕', '🍔', '🍟', '🍎', '🍌', '🍉', '🍰', '🍩', '🍪', '🍫', '🍿', '🍦', '🍭', '🍺', '🍻', '🥤',
        '☕', '🍵', '🧃', '🥪', '🥗', '🍲', '🍜', '🍣', '🍙', '🥠', '🦐', '🦞', '🦀',
    ],
    sports: [
        '⚽', '🏀', '🏈', '🎲', '🎸', '🎮', '🎤', '🎧', '🏆', '🥇', '🥈', '🥉', '🎯', '🎳', '🕹️',
    ],
    nature: [
        '🌈', '🔥', '⭐', '🌊', '🌸', '🌍', '🌙', '☀️', '🌪️', '🌋', '❄️', '🌵', '🌺', '🍀', '🌻', '🌴',
    ],
    objects: [
        '📚', '🧩', '🖌️', '🎨', '🧸', '🎁', '🎂', '🚗', '✈️', '🚀', '💎', '🔮', '📱', '💡', '🔑', '🎭',
    ],
};

export function getAllEmojis(packs: string[]): string[] {
    if (!packs || packs.length === 0 || packs.includes('all')) {
        return Object.values(EMOJI_PACKS).flat();
    }
    return packs.filter((p) => EMOJI_PACKS[p]).flatMap((p) => EMOJI_PACKS[p]);
}

export function getRandomEmojis(count: number, packs: string[]): string[] {
    const pool = getAllEmojis(packs);
    const shuffled = [...pool].sort(() => 0.5 - Math.random());
    return shuffled.slice(0, Math.min(count, pool.length));
}
