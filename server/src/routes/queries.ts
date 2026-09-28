import { z } from 'zod';
import { isValidMarket } from '../domain/markets';
import { parseOrBadRequest } from '../errors';

/** Query string condivise: `mkt` opzionale (default da env) e `refresh=1` opzionale. */
export const marketSchema = z
  .string()
  .refine(isValidMarket, { message: 'formato atteso xx-XX (es. it-IT)' });

export const refreshSchema = z
  .union([z.literal('1'), z.literal('true'), z.literal('0'), z.literal('false'), z.literal('')])
  .transform((value) => value === '1' || value === 'true');

export const themesQuerySchema = z.object({
  mkt: marketSchema.optional(),
  include: z.literal('images').optional(),
  refresh: refreshSchema.optional(),
});

/** Legge la query di /api/themes o /api/themes/:key/images e risolve il market. */
export function parseListQuery(
  query: unknown,
  defaultMarket: string,
): { market: string; refresh: boolean; includeImages: boolean } {
  const parsed = parseOrBadRequest(themesQuerySchema, query, 'query');
  return {
    market: parsed.mkt ?? defaultMarket,
    refresh: parsed.refresh === true,
    includeImages: parsed.include === 'images',
  };
}
