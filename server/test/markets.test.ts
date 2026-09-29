import { describe, expect, it } from 'vitest';
import { getMarkets, isValidMarket, MARKETS, MARKET_PATTERN, marketName } from '../src/domain/markets';

describe('market supportati', () => {
  it('include it-IT con etichetta italiana e bandiera', () => {
    const italy = MARKETS.find((market) => market.code === 'it-IT');
    expect(italy).toEqual({ code: 'it-IT', name: 'Italiano (Italia)', flag: '\ud83c\uddee\ud83c\uddf9' });
    expect(getMarkets()[0]?.code).toBe('it-IT');
  });

  it('ha codici validi, unici e con nome/bandiera valorizzati', () => {
    const codes = MARKETS.map((market) => market.code);
    expect(new Set(codes).size).toBe(codes.length);
    for (const market of MARKETS) {
      expect(market.code).toMatch(MARKET_PATTERN);
      expect(market.name.length).toBeGreaterThan(0);
      expect(market.flag.length).toBeGreaterThan(0);
    }
    expect(codes).toHaveLength(29);
  });

  it('aggiunge il default market se non è nella lista curata', () => {
    const markets = getMarkets('xx-XX');
    expect(markets[0]).toEqual({ code: 'xx-XX', name: 'xx-XX', flag: '\ud83c\udf10' });
    expect(markets).toHaveLength(MARKETS.length + 1);
    // il default già noto non viene duplicato
    expect(getMarkets('it-IT')).toHaveLength(MARKETS.length);
  });

  it('valida il formato del market e risolve i nomi', () => {
    expect(isValidMarket('it-IT')).toBe(true);
    expect(isValidMarket('IT-it')).toBe(false);
    expect(isValidMarket('italiano')).toBe(false);
    expect(isValidMarket('')).toBe(false);
    expect(marketName('it-IT')).toBe('Italiano (Italia)');
    expect(marketName('zz-ZZ')).toBe('zz-ZZ');
  });
});
