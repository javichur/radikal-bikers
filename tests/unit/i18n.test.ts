import { describe, expect, it } from 'vitest';
import { CHARACTERS } from '../../src/content/characters';
import { MAX_LEVEL, PAINTS, rankKey } from '../../src/content/progression';
import { STAGES } from '../../src/content/stages';
import { TRICK_POINTS } from '../../src/sim/combo';
import { detectLocale, I18n } from '../../src/ui/i18n';
import { en } from '../../src/ui/locales/en';
import { es } from '../../src/ui/locales/es';

describe('i18n', () => {
  it('has the same keys and no empty strings in every locale', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(es).sort());
    for (const v of [...Object.values(en), ...Object.values(es)]) expect(v.trim()).not.toBe('');
  });

  it('translates content keys', () => {
    const t = new I18n('es');
    for (const c of CHARACTERS) {
      expect(t.tk(c.nameKey)).not.toBe(c.nameKey);
      expect(t.tk(c.bioKey)).not.toBe(c.bioKey);
    }
    for (const s of STAGES) expect(t.tk(s.nameKey)).not.toBe(s.nameKey);
    expect(t.tk('missing.key')).toBe('missing.key');
    const kinds = new Set(STAGES.flatMap((s) => s.challenges.map((c) => c.kind)));
    for (const k of kinds) expect(t.tk(`challenge.${k}`)).not.toBe(`challenge.${k}`);
    for (const k of Object.keys(TRICK_POINTS)) expect(t.tk(`trick.${k}`)).not.toBe(`trick.${k}`);
    for (const p of PAINTS) expect(t.tk(p.nameKey)).not.toBe(p.nameKey);
    for (let l = 1; l <= MAX_LEVEL; l++) expect(t.tk(rankKey(l))).not.toBe(rankKey(l));
  });

  it('interpolates parameters', () => {
    expect(new I18n('en').t('hud.extended', { s: 20 })).toBe('EXTENDED TIME +20');
    expect(new I18n('es').t('hud.extended', { s: 5 })).toBe('TIEMPO EXTRA +5');
    expect(new I18n('en').t('hud.extended')).toContain('{s}');
  });

  it('detects the browser language', () => {
    expect(detectLocale(['es-ES', 'en'])).toBe('es');
    expect(detectLocale(['fr-FR', 'en-GB'])).toBe('en');
    expect(detectLocale(['de'])).toBe('en');
  });
});
