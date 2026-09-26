/** Look of a store that a shortcut runs straight through: facade colour, sign and awning. */
export interface ShopStyle {
  /** Text on the sign above the shop window. */
  readonly name: string;
  /** Facade colour. */
  readonly color: number;
  /** Sign background. */
  readonly sign: string;
  /** Sign lettering (white by default). */
  readonly text?: string;
  readonly awning: string;
}

/** Generic high-street shops. */
export const GENERIC_SHOPS = [
  { name: 'SUPER', color: 0xf1faee, sign: '#2a9d8f', awning: '#2a9d8f' },
  { name: 'MODA', color: 0xffc6ff, sign: '#7209b7', awning: '#b5179e' },
  { name: 'TV·HIFI', color: 0xa0c4ff, sign: '#1d3557', awning: '#e63946' },
  { name: 'CAFÉ', color: 0xffd6a5, sign: '#6f4518', awning: '#e76f51' },
] as const satisfies readonly ShopStyle[];

/**
 * Typical shops of València: the two supermarket chains born in the Valencian Community (Mercadona, green lettering
 * on white; Consum, lowercase orange lettering on white), horchata bars, fartons and bunyols, bakeries, rice
 * restaurants, Manises ceramics, fallas dress makers, fireworks, fans, espadrilles, oranges and the market.
 */
export const VALENCIA_SHOPS = {
  mercadona: { name: 'MERCADONA', color: 0xf7f7f2, sign: '#ffffff', text: '#00873e', awning: '#00873e' },
  consum: { name: 'consum', color: 0xfffaf2, sign: '#ffffff', text: '#f39400', awning: '#f39400' },
  orxateria: { name: 'ORXATERIA', color: 0xfdf6e3, sign: '#8a5a2b', awning: '#2a9d8f' },
  fartons: { name: 'FARTONS', color: 0xffe8c2, sign: '#c8643b', awning: '#ffbe0b' },
  forn: { name: 'FORN', color: 0xf3e0c0, sign: '#7a4a1e', awning: '#b5651d' },
  arrosseria: { name: 'ARROSSERIA', color: 0xfff1c9, sign: '#d68a00', awning: '#e63946' },
  bunyols: { name: 'BUNYOLS', color: 0xffe3c9, sign: '#9c2f2f', awning: '#ffbe0b' },
  ceramica: { name: 'CERÀMICA', color: 0xe0f0ff, sign: '#1d4e89', awning: '#2a6fb0' },
  indumentaria: { name: 'INDUMENTÀRIA', color: 0xffd6e0, sign: '#8e1b3b', awning: '#8338ec' },
  pirotecnia: { name: 'PIROTÈCNIA', color: 0xfff0f0, sign: '#c1121f', awning: '#ffd166' },
  ventalls: { name: 'VENTALLS', color: 0xf6e7ff, sign: '#5a189a', awning: '#e63946' },
  espardenyes: { name: 'ESPARDENYES', color: 0xf5ecd7, sign: '#6b4f2a', awning: '#2a9d8f' },
  taronges: { name: 'TARONGES', color: 0xfff4e0, sign: '#f77f00', awning: '#2d6a4f' },
  mercat: { name: 'MERCAT', color: 0xfff1d0, sign: '#2a6fb0', awning: '#f4a261' },
} as const satisfies Record<string, ShopStyle>;

export type ValenciaShop = keyof typeof VALENCIA_SHOPS;
