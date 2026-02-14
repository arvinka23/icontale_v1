// ═══════════════════════════════════════════════════════════════
//  Constants
// ═══════════════════════════════════════════════════════════════

export const EMOJIS = [
    '😀','😂','😍','😎','🤔','😱','🥳','😡','😭','😴','👻','🤖',
    '🐶','🐱','🦄','🐉','🍕','🍔','🍟','🍎','🍌','🍉','⚽','🏀',
    '🏈','🚗','✈️','🚀','🌈','🔥','⭐','🎲','🎸','🎮','🎤','🎧',
    '📚','🧩','🖌️','🎨','🏆','🥇','🥈','🥉','🎯','🎳','🕹️','🧸',
    '🎁','🎂','🍰','🍩','🍪','🍫','🍿','🍦','🍭','🐟','🐬','🐋',
    '🦈','🐊','🐢','🐍','🦎','🦖','🐅','🐆','🦓','🦍','🐘','🦛',
    '🦏','🐪','🦒','🦘','🦥','🦦','🐇','🐿️','🦔',
];

export const EMOJI_NAMES = {
    '😀':'Lächeln','😂':'Freudentränen','😍':'Verliebt','😎':'Cool',
    '🤔':'Denkend','😱':'Schock','🥳':'Party','😡':'Wütend',
    '😭':'Weinen','😴':'Schlafend','👻':'Geist','🤖':'Roboter',
    '🐶':'Hund','🐱':'Katze','🦄':'Einhorn','🐉':'Drache',
    '🍕':'Pizza','🍔':'Burger','🍟':'Pommes','🍎':'Apfel',
    '🍌':'Banane','🍉':'Wassermelone','⚽':'Fussball','🏀':'Basketball',
    '🏈':'Football','🚗':'Auto','✈️':'Flugzeug','🚀':'Rakete',
    '🌈':'Regenbogen','🔥':'Feuer','⭐':'Stern','🎲':'Würfel',
    '🎸':'Gitarre','🎮':'Controller','🎤':'Mikrofon','🎧':'Kopfhörer',
    '📚':'Bücher','🧩':'Puzzle','🖌️':'Pinsel','🎨':'Palette',
    '🏆':'Pokal','🥇':'Gold','🥈':'Silber','🥉':'Bronze',
    '🎯':'Zielscheibe','🎳':'Bowling','🕹️':'Joystick','🧸':'Teddy',
    '🎁':'Geschenk','🎂':'Kuchen','🍰':'Torte','🍩':'Donut',
    '🍪':'Keks','🍫':'Schokolade','🍿':'Popcorn','🍦':'Eis',
    '🍭':'Lutscher',
};

export const MODE_DESCRIPTIONS = {
    classic: 'Schreibe Geschichten und errate Emojis + Autor.',
    speed:   '60 Sekunden, max 100 Wörter — sei schnell!',
    blind:   'Keine Emoji-Auswahl beim Raten — nur den Autor erraten.',
    team:    'Spieler werden in zwei Teams aufgeteilt. Teampunkte zählen!',
};
