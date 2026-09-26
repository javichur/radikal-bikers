export type SimEvent =
  | { readonly type: 'crash'; readonly cause: 'vehicle' | 'landing' }
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
  | { readonly type: 'pickup'; readonly kind: 'explosive' }
  | { readonly type: 'explode'; readonly vehicleId: number; readonly s: number; readonly d: number }
  | { readonly type: 'glass'; readonly route: number; readonly pane: number }
  | { readonly type: 'shortcut'; readonly route: number };
