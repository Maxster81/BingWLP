import { describe, expect, it } from 'vitest';
import {
  DEFAULT_QUALITY,
  DEFAULT_RESOLUTION_KEY,
  findResolution,
  isKnownResolution,
  RESOLUTIONS,
  RESOLUTION_GROUPS,
  resolutionsByGroup,
} from '../src/domain/resolutions';

describe('preset di risoluzione', () => {
  it('espone il default 1920x1080 raccomandato', () => {
    expect(DEFAULT_RESOLUTION_KEY).toBe('1920x1080');
    const fullHd = findResolution(DEFAULT_RESOLUTION_KEY);
    expect(fullHd).toEqual({
      key: '1920x1080',
      label: 'Full HD 16:9 \u00b7 1920\u00d71080',
      group: 'desktop',
      width: 1920,
      height: 1080,
      aspect: '16:9',
      recommended: true,
    });
    expect(DEFAULT_QUALITY).toBe(80);
  });

  it('ha i gruppi nell\'ordine original, desktop, ultrawide, mobile, tablet', () => {
    expect(RESOLUTION_GROUPS).toEqual(['original', 'desktop', 'ultrawide', 'mobile', 'tablet']);
    const grouped = resolutionsByGroup();
    expect(grouped.original).toHaveLength(1);
    expect(grouped.desktop).toHaveLength(12);
    expect(grouped.ultrawide).toHaveLength(2);
    expect(grouped.mobile).toHaveLength(5);
    expect(grouped.tablet).toHaveLength(3);
    const indexOf = (key: string) => RESOLUTIONS.findIndex((item) => item.key === key);
    expect(indexOf('original')).toBeLessThan(indexOf('5120x2880'));
    expect(indexOf('1024x768')).toBeLessThan(indexOf('3440x1440'));
    expect(indexOf('2560x1080')).toBeLessThan(indexOf('1440x3120'));
    expect(indexOf('1080x1920')).toBeLessThan(indexOf('2732x2048'));
  });

  it('descrive la risoluzione nativa con width/height 0', () => {
    expect(findResolution('original')).toEqual({
      key: 'original',
      label: 'Originale \u00b7 dimensione nativa',
      group: 'original',
      width: 0,
      height: 0,
      aspect: 'nativa',
    });
  });

  it('ordina ogni gruppo dal più grande al più piccolo e assegna gli aspect corretti', () => {
    const grouped = resolutionsByGroup();
    for (const group of RESOLUTION_GROUPS) {
      const widths = grouped[group].map((item) => item.width);
      expect([...widths].sort((a, b) => b - a)).toEqual(widths);
    }
    expect(grouped.desktop.map((item) => item.key)).toContain('5120x2880');
    expect(findResolution('1920x1200')?.aspect).toBe('16:10');
    expect(findResolution('1024x768')?.aspect).toBe('4:3');
    expect(findResolution('3440x1440')?.aspect).toBe('21:9');
    expect(findResolution('1080x1920')?.aspect).toBe('9:16');
    expect(findResolution('1600x2560')?.aspect).toBe('10:16');
    expect(findResolution('2732x2048')?.group).toBe('tablet');
    expect(findResolution('1080x2400')?.group).toBe('mobile');
  });

  it('ha key uniche e coerenti con width×height', () => {
    const keys = RESOLUTIONS.map((item) => item.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const item of RESOLUTIONS) {
      if (item.key === 'original') continue;
      expect(item.key).toBe(`${item.width}x${item.height}`);
      expect(item.label).toContain(`${item.width}\u00d7${item.height}`);
    }
  });

  it('lookup di key sconosciute', () => {
    expect(findResolution('9999x9999')).toBeUndefined();
    expect(findResolution('1920X1080')).toBeUndefined();
    expect(isKnownResolution('original')).toBe(true);
    expect(isKnownResolution('123x456')).toBe(false);
  });
});
