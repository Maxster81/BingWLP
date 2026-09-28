/** Utilità di formattazione e normalizzazione (nessuna dipendenza esterna). */

/** Normalizza per confronti/ricerca: minuscole, senza diacritici, spazi compattati. */
export function normalizeText(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Slug ASCII-safe (usato per nomi file/meta): `"Wild Animal!"` → `"wild-animal"`. */
export function slugify(input: string): string {
  return normalizeText(input)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

/** Validazione formato market del contratto: `^[a-z]{2}-[A-Z]{2}$`. */
export function isMarketCode(value: unknown): value is string {
  return typeof value === 'string' && /^[a-z]{2}-[A-Z]{2}$/.test(value);
}

/**
 * Numeri con separatore delle migliaia italiano (es. `1.234`).
 * Deliberatamente indipendente da `Intl`: alcune build di Node/CI girano con ICU ridotto
 * e la UI deve comunque mostrare le etichette italiane corrette.
 */
export function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return '—';
  const truncated = Math.trunc(value);
  const sign = truncated < 0 ? '-' : '';
  const grouped = String(Math.abs(truncated)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${sign}${grouped}`;
}

const dateFormatter = new Intl.DateTimeFormat('it-IT', { dateStyle: 'medium' });

/** Data ISO → data leggibile; input non valido → stringa vuota. */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return dateFormatter.format(date);
}

/** Etichetta dimensioni risoluzione: `1920×1080` oppure `Nativa`. */
export function formatResolutionSize(width: number, height: number): string {
  if (!width || !height) return 'Nativa';
  return `${formatNumber(width)}×${formatNumber(height)}`;
}

/** Tronca preservando le parole, aggiungendo ellissi. */
export function truncate(input: string, maxLength: number): string {
  const text = input.trim();
  if (text.length <= maxLength) return text;
  const cut = text.slice(0, Math.max(0, maxLength - 1));
  const lastSpace = cut.lastIndexOf(' ');
  const base = lastSpace > maxLength * 0.6 ? cut.slice(0, lastSpace) : cut;
  return `${base.trimEnd()}…`;
}

/** Iniziali per il placeholder grafico: `"Wild Animal"` → `"WA"`. */
export function initials(input: string, max = 2): string {
  const words = input.split(/[\s_-]+/).filter((word) => word.length > 0);
  return words
    .slice(0, max)
    .map((word) => (word.charAt(0) || '').toUpperCase())
    .join('');
}

/** Hash FNV-1a a 32 bit, stabile fra sessioni (placeholder deterministici). */
export function hashString(input: string): number {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/**
 * Gradiente deterministico "aurora" dal nome del tema: sempre nella fascia blu→viola→rosa.
 * Serve come placeholder quando `coverUrl` è `null` (nessuna immagine disponibile).
 */
export function placeholderGradient(seed: string): string {
  const hash = hashString(seed || 'bingwlp');
  const hue = 188 + (hash % 140); // 188..328
  const hue2 = (hue + 48) % 360;
  const hue3 = (hue + 96) % 360;
  const angle = 120 + (hash % 80);
  return `linear-gradient(${angle}deg, hsl(${hue} 82% 52%), hsl(${hue2} 74% 46%) 52%, hsl(${hue3} 76% 40%))`;
}

/** Indice di immagine valido e dentro i limiti, altrimenti `null`. */
export function clampIndex(index: number | null, length: number): number | null {
  if (index === null || !Number.isInteger(index) || index < 0) return null;
  if (index >= length) return null;
  return index;
}

/** Etichetta gruppo risoluzione in italiano. */
export const RESOLUTION_GROUP_ORDER = ['original', 'desktop', 'ultrawide', 'tablet', 'mobile'] as const;
