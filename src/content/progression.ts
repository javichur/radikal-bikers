/** Rider career: experience (points earned in every race, delivered or not) → level → unlocks. */

export const MAX_LEVEL = 10;
const XP_STEP = 20000;

/** Total XP needed to reach `level` (level 1 = 0 XP). */
export const xpForLevel = (level: number): number => (XP_STEP * (level - 1) * level) / 2;

export const levelFor = (xp: number): number => {
  let l = 1;
  while (l < MAX_LEVEL && xp >= xpForLevel(l + 1)) l++;
  return l;
};

/** Progress 0..1 towards the next level (1 at max level). */
export const levelProgress = (xp: number): number => {
  const l = levelFor(xp);
  if (l >= MAX_LEVEL) return 1;
  const from = xpForLevel(l);
  return (xp - from) / (xpForLevel(l + 1) - from);
};

/** i18n key of the rank title for a level. */
export const rankKey = (level: number): string => `rank.${Math.min(4, Math.floor((level - 1) / 2))}`;

export interface PaintDef {
  readonly nameKey: string;
  /** null keeps the rider's own colour. */
  readonly color: number | null;
  readonly level: number;
}

/** Cosmetic bike paints, unlocked by level. */
export const PAINTS: readonly PaintDef[] = [
  { nameKey: 'paint.stock', color: null, level: 1 },
  { nameKey: 'paint.gold', color: 0xffd166, level: 2 },
  { nameKey: 'paint.violet', color: 0x8338ec, level: 3 },
  { nameKey: 'paint.mint', color: 0x06d6a0, level: 4 },
  { nameKey: 'paint.neon', color: 0xff006e, level: 5 },
  { nameKey: 'paint.midnight', color: 0x22223b, level: 7 },
];

export const paintUnlocked = (i: number, level: number): boolean => (PAINTS[i]?.level ?? Infinity) <= level;
