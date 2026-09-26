/** Bonus boxes: explosives blow vehicles up, turbo fires the rockets. */
export type PickupKind = 'explosive' | 'turbo';

export type TrickKind = 'nearMiss' | 'wheelie' | 'jump' | 'glass' | 'shortcut' | 'explode' | 'turbo';

export type SimEvent =
  | { readonly type: 'crash'; readonly cause: 'wall' | 'vehicle' | 'landing' | 'obstacle' }
  | { readonly type: 'respawn' }
  | { readonly type: 'scrape' }
  | { readonly type: 'jump' }
  | { readonly type: 'land' }
  | { readonly type: 'wheelie' }
  | { readonly type: 'checkpoint'; readonly index: number; readonly bonus: number }
  | { readonly type: 'finish' }
  | { readonly type: 'timeUp' }
  | { readonly type: 'honk'; readonly vehicleId: number }
  | { readonly type: 'hurryUp' }
  | { readonly type: 'pickup'; readonly kind: PickupKind }
  | { readonly type: 'explode'; readonly vehicleId: number; readonly s: number; readonly d: number }
  | { readonly type: 'glass'; readonly route: number; readonly pane: number }
  | { readonly type: 'shortcut'; readonly route: number }
  | { readonly type: 'knock'; readonly index: number }
  | { readonly type: 'nearMiss'; readonly vehicleId: number }
  | { readonly type: 'trick'; readonly kind: TrickKind; readonly points: number; readonly multiplier: number }
  | { readonly type: 'comboBanked'; readonly points: number; readonly count: number }
  | { readonly type: 'comboLost'; readonly points: number }
  | { readonly type: 'cone'; readonly index: number }
  | { readonly type: 'crossingBell'; readonly index: number }
  | { readonly type: 'rivalPassed'; readonly ahead: boolean };
