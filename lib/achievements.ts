// ═══════════════════════════════════════════════════════════════
//  Achievement System
// ═══════════════════════════════════════════════════════════════

import type { Achievement, PlayerStats } from './types';
import * as store from './store';
import log from './logger';

// ── Achievement Definitions ─────────────────────────────────

export const ACHIEVEMENTS: Achievement[] = [
    {
        id: 'first-game',
        name: 'Erster Schritt',
        description: 'Spiel zum ersten Mal gespielt',
        icon: '🎮',
    },
    {
        id: 'master-storyteller',
        name: 'Meistererzähler',
        description: '10+ Spiele gewonnen',
        icon: '📖',
    },
    {
        id: 'speed-demon',
        name: 'Geschwindigkeitsdämon',
        description: 'Speed-Mode in unter 30 Sekunden abgeschickt',
        icon: '⚡',
    },
    {
        id: 'invisible',
        name: 'Unsichtbar',
        description: '3 Runden lang nie erraten worden',
        icon: '👻',
    },
    {
        id: 'detective',
        name: 'Detektiv',
        description: '5x den Autor korrekt erraten',
        icon: '🔍',
    },
    {
        id: 'blind-master',
        name: 'Blind-Meister',
        description: 'Blind-Mode gewonnen',
        icon: '🙈',
    },
    {
        id: 'team-captain',
        name: 'Team-Kapitän',
        description: 'In einem Team-Spiel die meisten Punkte',
        icon: '👥',
    },
    {
        id: 'minimalist',
        name: 'Wortkarg',
        description: 'Geschichte mit weniger als 20 Wörtern geschrieben',
        icon: '🤫',
    },
    {
        id: 'novelist',
        name: 'Romanautor',
        description: 'Geschichte mit 400+ Wörtern geschrieben',
        icon: '📝',
    },
    {
        id: 'perfect-round',
        name: 'Perfekte Runde',
        description: 'Maximale Punkte in einer Runde erzielt',
        icon: '💯',
    },
    {
        id: 'streak',
        name: 'Serien-Sieger',
        description: '3 Runden hintereinander gewonnen',
        icon: '🔥',
    },
    {
        id: 'allrounder',
        name: 'Allrounder',
        description: 'Alle 4 Modi mindestens einmal gespielt',
        icon: '🌐',
    },
    {
        id: 'spectator-pro',
        name: 'Zuschauer-Profi',
        description: '5 Spiele als Spectator gesehen',
        icon: '👁️',
    },
    {
        id: 'comeback',
        name: 'Comeback',
        description: 'Nach Disconnect reconnected und trotzdem gewonnen',
        icon: '🔄',
    },
    {
        id: 'marathon',
        name: 'Marathon',
        description: 'Best-of-5 Spiel abgeschlossen',
        icon: '🏃',
    },
];

// ── Achievement Condition Checkers ──────────────────────────

type ConditionFn = (_stats: PlayerStats) => boolean;

const CONDITIONS: Record<string, ConditionFn> = {
    'first-game':        (s) => s.gamesPlayed >= 1,
    'master-storyteller': (s) => s.gamesWon >= 10,
    'speed-demon':       (s) => (s.fastestStoryTime ?? Infinity) < 30,
    'invisible':         (s) => s.timesNeverGuessed >= 3,
    'detective':         (s) => s.correctAuthorGuesses >= 5,
    'blind-master':      (s) => s.modesPlayed.has('blind') && s.gamesWon >= 1,
    'team-captain':      (_) => false, // checked contextually in game-over
    'minimalist':        (s) => (s.shortestStoryWords ?? Infinity) < 20,
    'novelist':          (s) => (s.longestStoryWords ?? 0) >= 400,
    'perfect-round':     (_) => false, // checked contextually in results
    'streak':            (s) => s.roundsWonConsecutive >= 3,
    'allrounder':        (s) => s.modesPlayed.size >= 4,
    'spectator-pro':     (s) => s.spectatedGames >= 5,
    'comeback':          (s) => s.reconnectedAndWon,
    'marathon':          (s) => s.bestOf5Completed,
};

// ── Check and Award ─────────────────────────────────────────

/**
 * Check all achievements for a player and return any newly unlocked ones.
 */
export async function checkAchievements(
    playerId: string,
    stats: PlayerStats,
    extraChecks?: string[],
): Promise<Achievement[]> {
    const unlocked = await store.getUnlockedAchievements(playerId);
    const newlyUnlocked: Achievement[] = [];

    for (const achievement of ACHIEVEMENTS) {
        if (unlocked.includes(achievement.id)) continue;

        // Check via standard conditions
        const condition = CONDITIONS[achievement.id];
        let earned = condition ? condition(stats) : false;

        // Check extra contextual achievements
        if (!earned && extraChecks?.includes(achievement.id)) {
            earned = true;
        }

        if (earned) {
            const isNew = await store.unlockAchievement(playerId, achievement.id);
            if (isNew) {
                newlyUnlocked.push(achievement);
                log.info({ playerId, achievement: achievement.id }, 'Achievement unlocked');
            }
        }
    }

    return newlyUnlocked;
}

/**
 * Update player stats after a game event and check for achievements.
 */
export async function updateStatsAndCheck(
    playerId: string,
    updater: (_stats: PlayerStats) => void,
    extraChecks?: string[],
): Promise<Achievement[]> {
    const stats = await store.getPlayerStats(playerId);
    updater(stats);
    await store.savePlayerStats(playerId, stats);
    return checkAchievements(playerId, stats, extraChecks);
}

export function getAchievementById(id: string): Achievement | undefined {
    return ACHIEVEMENTS.find((a) => a.id === id);
}
