import type { Resolution, ResolutionGroup } from './types';

/** Limiti dei parametri w/h e qlt accettati dalle rotte (docs/API.md). */
export const MIN_DIMENSION = 16;
export const MAX_DIMENSION = 8000;
export const MIN_QUALITY = 1;
export const MAX_QUALITY = 100;
export const DEFAULT_QUALITY = 80;

export const DEFAULT_RESOLUTION_KEY = '1920x1080';

/** Ordine di presentazione dei gruppi nel frontend. */
export const RESOLUTION_GROUPS: readonly ResolutionGroup[] = [
  'original',
  'desktop',
  'ultrawide',
  'mobile',
  'tablet',
];

type ResolutionSeed = {
  width: number;
  height: number;
  aspect: string;
  /** Descrizione breve; la label finale è `"<desc> · <w>×<h>"`. */
  description: string;
  recommended?: boolean;
};

/** Dal più grande al più piccolo (ordine di presentazione). */
const DESKTOP_SEEDS: readonly ResolutionSeed[] = [
  { width: 5120, height: 2880, aspect: '16:9', description: '5K 16:9' },
  { width: 3840, height: 2160, aspect: '16:9', description: '4K UHD 16:9' },
  { width: 2560, height: 1440, aspect: '16:9', description: 'QHD 16:9' },
  { width: 1920, height: 1080, aspect: '16:9', description: 'Full HD 16:9', recommended: true },
  { width: 1920, height: 1200, aspect: '16:10', description: 'WUXGA 16:10' },
  { width: 1680, height: 1050, aspect: '16:10', description: 'WSXGA+ 16:10' },
  { width: 1600, height: 900, aspect: '16:9', description: 'HD+ 16:9' },
  { width: 1440, height: 900, aspect: '16:10', description: 'WXGA+ 16:10' },
  { width: 1366, height: 768, aspect: '16:9', description: 'HD 16:9' },
  { width: 1280, height: 800, aspect: '16:10', description: 'WXGA 16:10' },
  { width: 1280, height: 720, aspect: '16:9', description: 'HD 720p 16:9' },
  { width: 1024, height: 768, aspect: '4:3', description: 'XGA 4:3' },
];

const ULTRAWIDE_SEEDS: readonly ResolutionSeed[] = [
  { width: 3440, height: 1440, aspect: '21:9', description: 'UltraWide 21:9' },
  { width: 2560, height: 1080, aspect: '21:9', description: 'UltraWide FHD 21:9' },
];

const MOBILE_SEEDS: readonly ResolutionSeed[] = [
  { width: 1440, height: 3120, aspect: '19.5:9', description: 'QHD+ 19.5:9' },
  { width: 1284, height: 2778, aspect: '19.5:9', description: 'iPhone 6.1" 19.5:9' },
  { width: 1170, height: 2532, aspect: '19.5:9', description: 'iPhone 6.1" 19.5:9' },
  { width: 1080, height: 2400, aspect: '20:9', description: 'FHD+ 20:9' },
  { width: 1080, height: 1920, aspect: '9:16', description: 'FHD 9:16' },
];

const TABLET_SEEDS: readonly ResolutionSeed[] = [
  { width: 2732, height: 2048, aspect: '4:3', description: 'iPad Pro 12.9" 4:3' },
  { width: 2048, height: 1536, aspect: '4:3', description: 'iPad 4:3' },
  { width: 1600, height: 2560, aspect: '10:16', description: 'tablet portrait 10:16' },
];

/** `original` = dimensione nativa: width/height 0 significano "nessun resize". */
const ORIGINAL: Resolution = {
  key: 'original',
  label: 'Originale · dimensione nativa',
  group: 'original',
  width: 0,
  height: 0,
  aspect: 'nativa',
};

function build(seeds: readonly ResolutionSeed[], group: ResolutionGroup): Resolution[] {
  return seeds.map((seed) => ({
    key: `${seed.width}x${seed.height}`,
    label: `${seed.description} · ${seed.width}×${seed.height}`,
    group,
    width: seed.width,
    height: seed.height,
    aspect: seed.aspect,
    ...(seed.recommended === true ? { recommended: true } : {}),
  }));
}

/** Tutti i preset, nell'ordine dei gruppi e dal più grande al più piccolo. */
export const RESOLUTIONS: readonly Resolution[] = [
  ORIGINAL,
  ...build(DESKTOP_SEEDS, 'desktop'),
  ...build(ULTRAWIDE_SEEDS, 'ultrawide'),
  ...build(MOBILE_SEEDS, 'mobile'),
  ...build(TABLET_SEEDS, 'tablet'),
];

const BY_KEY = new Map(RESOLUTIONS.map((resolution) => [resolution.key, resolution]));

/** Lookup per key (`"1920x1080"`, `"original"`); `undefined` se sconosciuta. */
export function findResolution(key: string): Resolution | undefined {
  return BY_KEY.get(key);
}

export function isKnownResolution(key: string): boolean {
  return BY_KEY.has(key);
}

/** Preset raggruppati, per la UI. */
export function resolutionsByGroup(): Record<ResolutionGroup, Resolution[]> {
  const grouped: Record<ResolutionGroup, Resolution[]> = {
    original: [],
    desktop: [],
    ultrawide: [],
    mobile: [],
    tablet: [],
  };
  for (const resolution of RESOLUTIONS) {
    grouped[resolution.group].push(resolution);
  }
  return grouped;
}
