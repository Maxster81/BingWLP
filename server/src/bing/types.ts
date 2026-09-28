import { z } from 'zod';

/**
 * Tipi (e schema di validazione) del JSON GREZZO di Bing.
 *
 * Gli schema sono volutamente permissivi (`nullish()` + `passthrough()`): Bing cambia
 * campi con frequenza e un payload con campi mancanti o extra NON deve far fallire la
 * richiesta. I campi che non ci servono restano nel payload e vengono semplicemente
 * ignorati dai mapper.
 */

export const bingThemeCategorySchema = z
  .object({
    Name: z.string().nullish(),
    Type: z.string().nullish(),
    IsNew: z.boolean().nullish(),
    Images: z.array(z.unknown()).nullish(),
  })
  .passthrough();

export const bingThemeCategoriesSchema = z.record(bingThemeCategorySchema);

export const bingAnimatedAssetSchema = z
  .object({
    Url: z.string().nullish(),
    FileName: z.string().nullish(),
  })
  .passthrough();

export const bingAnimatedWpSchema = z
  .object({
    Version: z.string().nullish(),
    Name: z.string().nullish(),
    Assets: z.array(bingAnimatedAssetSchema).nullish(),
  })
  .passthrough();

export const bingCtaSchema = z
  .object({
    SearchUrls: z.array(z.string()).nullish(),
  })
  .passthrough();

export const bingImageSchema = z
  .object({
    startdate: z.string().nullish(),
    urlbase: z.string().nullish(),
    copyrighttext: z.string().nullish(),
    copyrightlink: z.string().nullish(),
    title: z.string().nullish(),
    description: z.string().nullish(),
    headline: z.string().nullish(),
    theme: z.array(z.string()).nullish(),
    sourceType: z.string().nullish(),
    topRightCTAData: bingCtaSchema.nullish(),
    AnimatedWP: bingAnimatedWpSchema.nullish(),
    /** Deliberatamente ignorato dai mapper: hotspot visivi non usati dal frontend. */
    imageHotspots: z.unknown().nullish(),
  })
  .passthrough();

export const bingImagesSchema = z
  .object({
    images: z.array(bingImageSchema).nullish(),
    imageCount: z.number().nullish(),
    tooltips: z.unknown().nullish(),
  })
  .passthrough();

export type BingThemeCategory = z.infer<typeof bingThemeCategorySchema>;
export type BingThemeCategoriesResponse = z.infer<typeof bingThemeCategoriesSchema>;
export type BingAnimatedAsset = z.infer<typeof bingAnimatedAssetSchema>;
export type BingAnimatedWp = z.infer<typeof bingAnimatedWpSchema>;
export type BingCta = z.infer<typeof bingCtaSchema>;
export type BingImage = z.infer<typeof bingImageSchema>;
export type BingImagesResponse = z.infer<typeof bingImagesSchema>;
