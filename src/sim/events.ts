export type SimEvent =
  | { readonly type: 'crash'; readonly cause: 'wall' | 'vehicle' | 'landing' }
  | { readonly type: 'respawn' }
  | { readonly type: 'scrape' }
  | { readonly type: 'jump' }
  | { readonly type: 'land' }
  | { readonly type: 'wheelie' }
  | { readonly type: 'checkpoint'; readonly index: number; readonly bonus: number }
  | { readonly type: 'finish' }
  | { readonly type: 'timeUp' }
  | { readonly type: 'honk'; readonly vehicleId: number }
  | { readonly type: 'hurryUp' };
