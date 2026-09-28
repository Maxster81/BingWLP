import { describe, expect, it } from 'vitest';
import {
  clampIndex,
  formatDate,
  formatNumber,
  formatResolutionSize,
  hashString,
  initials,
  isMarketCode,
  normalizeText,
  placeholderGradient,
  slugify,
  truncate,
} from './format';

describe('lib/format — slugify', () => {
  it('produce slug ASCII-safe', () => {
    expect(slugify('Wild Animal!')).toBe('wild-animal');
    expect(slugify('  Viaggi  &  Natura  ')).toBe('viaggi-natura');
    expect(slugify('Città del Messico')).toBe('citta-del-messico');
    expect(slugify('___')).toBe('');
  });

  it('limita la lunghezza a 80 caratteri', () => {
    expect(slugify('a'.repeat(200))).toHaveLength(80);
  });
});

describe('lib/format — normalizzazione', () => {
  it('normalizeText rimuove accenti, maiuscole e spazi multipli', () => {
    expect(normalizeText('  Città  del   Messico ')).toBe('citta del messico');
    expect(normalizeText('Però')).toBe('pero');
  });

  it('isMarketCode valida il formato del contratto', () => {
    expect(isMarketCode('it-IT')).toBe(true);
    expect(isMarketCode('en-US')).toBe(true);
    expect(isMarketCode('IT-it')).toBe(false);
    expect(isMarketCode('ita-IT')).toBe(false);
    expect(isMarketCode('it_IT')).toBe(false);
    expect(isMarketCode(null)).toBe(false);
    expect(isMarketCode(42)).toBe(false);
  });
});

describe('lib/format — numeri e date', () => {
  it('formatNumber usa il separatore italiano', () => {
    expect(formatNumber(1234)).toBe('1.234');
    expect(formatNumber(8)).toBe('8');
    expect(formatNumber(Number.NaN)).toBe('—');
  });

  it('formatDate gestisce ISO valide e input non validi', () => {
    expect(formatDate('2026-01-01T10:00:00.000Z')).toContain('2026');
    expect(formatDate(null)).toBe('');
    expect(formatDate('non-data')).toBe('');
    expect(formatDate(undefined)).toBe('');
  });

  it('formatResolutionSize', () => {
    expect(formatResolutionSize(1920, 1080)).toBe('1.920×1.080');
    expect(formatResolutionSize(0, 0)).toBe('Nativa');
  });
});

describe('lib/format — testi', () => {
  it('truncate preserva le parole', () => {
    expect(truncate('ciao mondo', 20)).toBe('ciao mondo');
    expect(truncate('un titolo molto lungo da tagliare', 12)).toBe('un titolo…');
  });

  it('initials', () => {
    expect(initials('Wild Animal')).toBe('WA');
    expect(initials('travel')).toBe('T');
    expect(initials('   ')).toBe('');
  });
});

describe('lib/format — placeholder deterministico', () => {
  it('lo stesso seed produce lo stesso gradiente', () => {
    expect(placeholderGradient('travel')).toBe(placeholderGradient('travel'));
    expect(placeholderGradient('travel')).not.toBe(placeholderGradient('animals'));
    expect(placeholderGradient('travel')).toMatch(/^linear-gradient\(/);
  });

  it('hashString è stabile', () => {
    expect(hashString('travel')).toBe(hashString('travel'));
    expect(hashString('travel')).toBeGreaterThanOrEqual(0);
  });
});

describe('lib/format — clampIndex', () => {
  it('accetta solo indici interi dentro il range', () => {
    expect(clampIndex(3, 8)).toBe(3);
    expect(clampIndex(0, 8)).toBe(0);
    expect(clampIndex(8, 8)).toBeNull();
    expect(clampIndex(-1, 8)).toBeNull();
    expect(clampIndex(null, 8)).toBeNull();
    expect(clampIndex(1.5, 8)).toBeNull();
  });
});
