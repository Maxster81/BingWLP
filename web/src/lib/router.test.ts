import { describe, expect, it } from 'vitest';
import { parseHash, parseIndex, routeHref, sameRoute, serializeRoute, themeRoute, withMarket } from './router';

describe('lib/router — parseHash', () => {
  it('hash vuoto/nullo o "#/" → griglia temi', () => {
    expect(parseHash('')).toEqual({ kind: 'themes', market: null });
    expect(parseHash(null)).toEqual({ kind: 'themes', market: null });
    expect(parseHash(undefined)).toEqual({ kind: 'themes', market: null });
    expect(parseHash('#')).toEqual({ kind: 'themes', market: null });
    expect(parseHash('#/')).toEqual({ kind: 'themes', market: null });
  });

  it('legge il market dalla query string', () => {
    expect(parseHash('#/?mkt=it-IT')).toEqual({ kind: 'themes', market: 'it-IT' });
    expect(parseHash('#/tema/travel?mkt=en-US')).toEqual({
      kind: 'theme',
      market: 'en-US',
      themeKey: 'travel',
      index: null,
    });
  });

  it('parsa il dettaglio tema', () => {
    expect(parseHash('#/tema/travel')).toEqual({ kind: 'theme', market: null, themeKey: 'travel', index: null });
  });

  it('parsa il deep-link con lightbox aperta', () => {
    expect(parseHash('#/tema/travel/3?mkt=it-IT')).toEqual({
      kind: 'theme',
      market: 'it-IT',
      themeKey: 'travel',
      index: 3,
    });
  });

  it('decodifica le themeKey con spazi (%20 e +)', () => {
    expect(parseHash('#/tema/wild%20animal')).toMatchObject({ themeKey: 'wild animal' });
    expect(parseHash('#/tema/wild+animal')).toMatchObject({ themeKey: 'wild animal' });
  });

  it('casi invalidi ricadono sulla griglia temi', () => {
    expect(parseHash('#/pippo')).toEqual({ kind: 'themes', market: null });
    expect(parseHash('#/tema')).toEqual({ kind: 'themes', market: null });
    expect(parseHash('#/tema/')).toEqual({ kind: 'themes', market: null });
    expect(parseHash('#/tema/travel/3/extra')).toEqual({ kind: 'themes', market: null });
    expect(parseHash('#/altro/travel')).toEqual({ kind: 'themes', market: null });
    // l'assenza dello slash iniziale è tollerata
    expect(parseHash('tema/travel/abc')).toEqual({
      kind: 'theme',
      market: null,
      themeKey: 'travel',
      index: null,
    });
  });

  it('market non conforme al formato → null (nessuna route rotta)', () => {
    expect(parseHash('#/?mkt=INVALID')).toEqual({ kind: 'themes', market: null });
    expect(parseHash('#/tema/travel/1?mkt=ita-IT')).toEqual({
      kind: 'theme',
      market: null,
      themeKey: 'travel',
      index: 1,
    });
  });

  it('indice non valido → dettaglio senza lightbox', () => {
    expect(parseHash('#/tema/travel/abc')).toMatchObject({ kind: 'theme', index: null });
    expect(parseHash('#/tema/travel/-1')).toMatchObject({ kind: 'theme', index: null });
    expect(parseHash('#/tema/travel/1.5')).toMatchObject({ kind: 'theme', index: null });
  });

  it('parseIndex', () => {
    expect(parseIndex('0')).toBe(0);
    expect(parseIndex('12')).toBe(12);
    expect(parseIndex('1.5')).toBeNull();
    expect(parseIndex('-2')).toBeNull();
    expect(parseIndex('abc')).toBeNull();
    expect(parseIndex('')).toBeNull();
  });
});

describe('lib/router — serializeRoute', () => {
  it('griglia temi', () => {
    expect(serializeRoute({ kind: 'themes', market: null })).toBe('#/');
    expect(serializeRoute({ kind: 'themes', market: 'it-IT' })).toBe('#/?mkt=it-IT');
  });

  it('dettaglio tema, con e senza lightbox', () => {
    expect(serializeRoute(themeRoute('travel', null))).toBe('#/tema/travel');
    expect(serializeRoute(themeRoute('travel', 'it-IT', 3))).toBe('#/tema/travel/3?mkt=it-IT');
    expect(serializeRoute(themeRoute('travel', 'it-IT', 0))).toBe('#/tema/travel/0?mkt=it-IT');
  });

  it('codifica le themeKey con spazi', () => {
    expect(serializeRoute(themeRoute('wild animal', null))).toBe('#/tema/wild%20animal');
  });

  it('ignora market non conformi', () => {
    expect(serializeRoute(themeRoute('travel', 'ITA'))).toBe('#/tema/travel');
  });

  it('round-trip parse → serialize', () => {
    const hashes = [
      '#/',
      '#/?mkt=en-US',
      '#/tema/travel',
      '#/tema/travel?mkt=it-IT',
      '#/tema/travel/0?mkt=it-IT',
      '#/tema/wild%20animal/7?mkt=de-DE',
    ];
    for (const hash of hashes) {
      expect(serializeRoute(parseHash(hash))).toBe(hash);
    }
  });
});

describe('lib/router — helper', () => {
  it('routeHref', () => {
    expect(routeHref(themeRoute('travel', 'it-IT'))).toBe('#/tema/travel?mkt=it-IT');
    expect(routeHref({ kind: 'themes', market: 'it-IT' })).toBe('#/?mkt=it-IT');
  });

  it('withMarket conserva tema e indice', () => {
    expect(withMarket(themeRoute('travel', 'it-IT', 2), 'en-US')).toEqual({
      kind: 'theme',
      market: 'en-US',
      themeKey: 'travel',
      index: 2,
    });
    expect(withMarket({ kind: 'themes', market: null }, 'fr-FR')).toEqual({ kind: 'themes', market: 'fr-FR' });
  });

  it('sameRoute confronta la route serializzata', () => {
    expect(sameRoute(themeRoute('travel', 'it-IT', 1), themeRoute('travel', 'it-IT', 1))).toBe(true);
    expect(sameRoute(themeRoute('travel', 'it-IT'), themeRoute('travel', 'en-US'))).toBe(false);
    expect(sameRoute({ kind: 'themes', market: null }, { kind: 'themes', market: null })).toBe(true);
  });
});
