export interface CharacterStats {
  /** Top speed on flat road, m/s. */
  readonly topSpeed: number;
  /** Forward acceleration at low speed, m/s². */
  readonly acceleration: number;
  /** Max yaw rate, rad/s. */
  readonly handling: number;
  /** Mass factor: heavier riders lose less speed when scraping walls. */
  readonly weight: number;
}

export interface CharacterDef {
  readonly id: string;
  /** i18n key of the display name. */
  readonly nameKey: string;
  readonly bioKey: string;
  readonly colors: { readonly body: number; readonly jacket: number; readonly helmet: number };
  readonly stats: CharacterStats;
}

export const CHARACTERS: readonly CharacterDef[] = [
  {
    id: 'rocco',
    nameKey: 'char.rocco.name',
    bioKey: 'char.rocco.bio',
    colors: { body: 0xe63946, jacket: 0x1d3557, helmet: 0xf1faee },
    stats: { topSpeed: 36, acceleration: 9, handling: 1.55, weight: 1.2 },
  },
  {
    id: 'luna',
    nameKey: 'char.luna.name',
    bioKey: 'char.luna.bio',
    colors: { body: 0x2ec4b6, jacket: 0xff9f1c, helmet: 0x3a0ca3 },
    stats: { topSpeed: 33, acceleration: 11, handling: 1.95, weight: 0.9 },
  },
];

export const getCharacter = (id: string): CharacterDef => {
  const c = CHARACTERS.find((x) => x.id === id);
  if (!c) throw new Error(`Unknown character: ${id}`);
  return c;
};

/** Normalised 0..1 stats for UI bars. */
export const normalisedStats = (
  s: CharacterStats,
): { speed: number; accel: number; handling: number; weight: number } => ({
  speed: s.topSpeed / 40,
  accel: s.acceleration / 12,
  handling: s.handling / 2.2,
  weight: s.weight / 1.4,
});
