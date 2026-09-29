import type { Market, MarketCode } from './types';

/** Formato del market accettato dalle rotte (`?mkt=it-IT`). */
export const MARKET_PATTERN = /^[a-z]{2}-[A-Z]{2}$/;

export function isValidMarket(value: string): boolean {
  return MARKET_PATTERN.test(value);
}

/** Lista curata di market con etichetta italiana e bandiera. */
export const MARKETS: readonly Market[] = [
  { code: 'it-IT', name: 'Italiano (Italia)', flag: '🇮🇹' },
  { code: 'en-US', name: 'Inglese (Stati Uniti)', flag: '🇺🇸' },
  { code: 'en-GB', name: 'Inglese (Regno Unito)', flag: '🇬🇧' },
  { code: 'de-DE', name: 'Tedesco (Germania)', flag: '🇩🇪' },
  { code: 'fr-FR', name: 'Francese (Francia)', flag: '🇫🇷' },
  { code: 'es-ES', name: 'Spagnolo (Spagna)', flag: '🇪🇸' },
  { code: 'pt-BR', name: 'Portoghese (Brasile)', flag: '🇧🇷' },
  { code: 'pt-PT', name: 'Portoghese (Portogallo)', flag: '🇵🇹' },
  { code: 'nl-NL', name: 'Olandese (Paesi Bassi)', flag: '🇳🇱' },
  { code: 'sv-SE', name: 'Svedese (Svezia)', flag: '🇸🇪' },
  { code: 'da-DK', name: 'Danese (Danimarca)', flag: '🇩🇰' },
  { code: 'nb-NO', name: 'Norvegese (Norvegia)', flag: '🇳🇴' },
  { code: 'fi-FI', name: 'Finlandese (Finlandia)', flag: '🇫🇮' },
  { code: 'pl-PL', name: 'Polacco (Polonia)', flag: '🇵🇱' },
  { code: 'cs-CZ', name: 'Ceco (Repubblica Ceca)', flag: '🇨🇿' },
  { code: 'hu-HU', name: 'Ungherese (Ungheria)', flag: '🇭🇺' },
  { code: 'el-GR', name: 'Greco (Grecia)', flag: '🇬🇷' },
  { code: 'ru-RU', name: 'Russo (Russia)', flag: '🇷🇺' },
  { code: 'tr-TR', name: 'Turco (Turchia)', flag: '🇹🇷' },
  { code: 'uk-UA', name: 'Ucraino (Ucraina)', flag: '🇺🇦' },
  { code: 'ar-SA', name: 'Arabo (Arabia Saudita)', flag: '🇸🇦' },
  { code: 'he-IL', name: 'Ebraico (Israele)', flag: '🇮🇱' },
  { code: 'hi-IN', name: 'Hindi (India)', flag: '🇮🇳' },
  { code: 'id-ID', name: 'Indonesiano (Indonesia)', flag: '🇮🇩' },
  { code: 'th-TH', name: 'Thai (Thailandia)', flag: '🇹🇭' },
  { code: 'vi-VN', name: 'Vietnamita (Vietnam)', flag: '🇻🇳' },
  { code: 'zh-CN', name: 'Cinese (Cina)', flag: '🇨🇳' },
  { code: 'ja-JP', name: 'Giapponese (Giappone)', flag: '🇯🇵' },
  { code: 'ko-KR', name: 'Coreano (Corea del Sud)', flag: '🇰🇷' },
];

/**
 * Market per il frontend partendo dal default di configurazione: se il market
 * configurato non è nella lista curata viene aggiunto in testa (bandiera generica),
 * così `defaultMarket` è sempre presente nell'elenco.
 */
export function getMarkets(defaultMarket?: string): Market[] {
  if (!defaultMarket) return [...MARKETS];
  const known = MARKETS.find((market) => market.code === defaultMarket);
  if (known) return [...MARKETS];
  return [{ code: defaultMarket, name: defaultMarket, flag: '🌐' }, ...MARKETS];
}

/** Etichetta di un market (fallback: il codice stesso). */
export function marketName(code: MarketCode): string {
  return MARKETS.find((market) => market.code === code)?.name ?? code;
}
