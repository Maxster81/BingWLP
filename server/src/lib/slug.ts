/**
 * Slug per i nomi file dei download: minuscole ASCII, solo `[a-z0-9-]`.
 * Rimuove accenti (NFD + strip dei combining mark), spazi e caratteri non-ASCII,
 * collassa i separatori e taglia a `maxLength` caratteri (senza `-` finale).
 */
export function slugify(input: string | null | undefined, maxLength = 60): string {
  if (typeof input !== 'string') return '';
  const slug = input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, Math.max(0, maxLength))
    .replace(/-+$/g, '');
  return slug;
}
