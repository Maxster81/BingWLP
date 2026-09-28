import { describe, expect, it } from 'vitest';
import { slugify } from '../src/lib/slug';

describe('slugify', () => {
  it('minuscole, spazi → trattini, via gli accenti', () => {
    expect(slugify('Golden Gate Highlands National Park, South Africa')).toBe(
      'golden-gate-highlands-national-park-south-africa',
    );
    expect(slugify('Perché è così')).toBe('perche-e-cosi');
    expect(slugify('Wild   Animal')).toBe('wild-animal');
  });

  it('rimuove i caratteri non ASCII/simboli', () => {
    expect(slugify('© /Shutterstock')).toBe('shutterstock');
    expect(slugify('Ünïcödé — 2026')).toBe('unicode-2026');
    expect(slugify('xbox')).toBe('xbox');
  });

  it('tronca alla lunghezza massima senza trattini finali', () => {
    expect(slugify('abcdefghij', 4)).toBe('abcd');
    expect(slugify('abcd-efgh', 5)).toBe('abcd');
    expect(slugify('a'.repeat(200))).toHaveLength(60);
    expect(slugify('a'.repeat(200), 10)).toHaveLength(10);
  });

  it('ritorna stringa vuota per input vuoto/non valido', () => {
    expect(slugify('')).toBe('');
    expect(slugify('   ')).toBe('');
    expect(slugify('!!!')).toBe('');
    expect(slugify(null)).toBe('');
    expect(slugify(undefined)).toBe('');
  });
});
