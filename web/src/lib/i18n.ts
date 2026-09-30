import type { ResolutionGroup } from '../api/types';
import { formatNumber } from './format';

/** Etichette italiane dei gruppi di risoluzione del contratto. */
export const RESOLUTION_GROUP_LABELS: Record<ResolutionGroup, string> = {
  original: 'Originale',
  desktop: 'Desktop',
  ultrawide: 'Ultrawide',
  tablet: 'Tablet',
  mobile: 'Smartphone',
};

/**
 * Dizionario unico di TUTTE le stringhe UI (italiano).
 * Le funzioni gestiscono i plurali: niente concatenazioni sparse nei componenti.
 */
export const t = {
  /* --- Generali --- */
  appName: 'Bing Wallpaper',
  appNameAccent: 'Gallery',
  appTagline: 'I temi di Bing, in un carosello da urlo.',
  skipToContent: 'Vai al contenuto principale',
  footerNote: 'Immagini e crediti appartengono a Microsoft Bing e ai rispettivi autori.',
  footerSource: 'Sorgente dati: Bing Wallpaper (API pubbliche)',

  /* --- Header --- */
  headerHome: 'Torna alla galleria dei temi',
  marketLabel: 'Mercato',
  marketHint: 'Cambia paese e lingua dei temi',
  refreshLabel: 'Aggiorna',
  refreshHint: 'Forza il ricaricamento dei contenuti da Bing (bypassa la cache)',
  refreshDone: 'Contenuti aggiornati da Bing',
  refreshError: 'Aggiornamento non riuscito, riprova',
  searchLabel: 'Cerca temi',
  searchPlaceholder: 'Cerca un tema…',
  searchClear: 'Cancella la ricerca',
  onlyNewLabel: 'Solo novità',
  onlyNewHint: 'Mostra soltanto i temi appena aggiunti',

  /* --- Stati --- */
  loading: 'Caricamento…',
  loadingConfig: 'Caricamento della configurazione…',
  loadingThemes: 'Caricamento dei temi…',
  loadingImages: 'Caricamento delle immagini…',
  loadingImage: 'Caricamento immagine…',
  retry: 'Riprova',
  errorTitle: 'Ops, qualcosa è andato storto',
  errorConfig: 'Non è stato possibile caricare la configurazione dell’app.',
  errorThemes: 'Non è stato possibile caricare i temi.',
  errorImages: 'Non è stato possibile caricare le immagini di questo tema.',
  errorImageLoad: 'Immagine non disponibile',
  emptyThemesTitle: 'Nessun tema disponibile',
  emptyThemesMessage: 'Il catalogo per questo mercato è vuoto. Prova a cambiare mercato.',
  emptySearchTitle: 'Nessun tema trovato',
  emptySearchMessage: 'Nessun tema corrisponde ai filtri attivi.',
  emptySearchAction: 'Azzera i filtri',
  emptyImagesTitle: 'Tema senza immagini',
  emptyImagesMessage: 'Questo tema non ha immagini disponibili al momento.',
  emptyImagesAction: 'Torna alla galleria',
  staleBadge: 'Dati dalla cache',
  staleHint: 'Il servizio upstream non è raggiungibile: questi dati provengono dalla cache.',

  /* --- Galleria --- */
  galleryTitle: 'Esplora i temi',
  gallerySubtitle: 'Scegli un tema per sfogliare il carosello e scaricare il wallpaper.',
  featuredBadge: 'In evidenza',
  featuredCta: 'Esplora il tema',
  themeCount: (n: number): string => (n === 1 ? '1 tema' : `${formatNumber(n)} temi`),
  imageCount: (n: number): string => (n === 1 ? '1 immagine' : `${formatNumber(n)} immagini`),
  imageCountUnknown: 'Immagini non disponibili',
  badgeNew: 'Novità',
  badgePack: 'Pacchetto',
  badgeAnimated: 'Animato',
  themeTypeRegular: 'Semplice',
  openTheme: (name: string): string => `Apri il tema ${name}`,
  cardOverlay: 'Vedi le immagini',

  /* --- Dettaglio tema --- */
  breadcrumbHome: 'Temi',
  breadcrumbCurrent: 'Dettaglio tema',
  backToGallery: 'Torna alla galleria',
  themeInfoTitle: 'Informazioni sul tema',
  imagesOfTheme: 'Immagini del tema',
  autoplayStart: 'Avvia presentazione',
  autoplayStop: 'Ferma presentazione',
  autoplayLabel: 'Presentazione automatica',
  carouselLabel: 'Carosello immagini',
  carouselRole: 'carosello',
  previousImage: 'Immagine precedente',
  nextImage: 'Immagine successiva',
  goToImage: (n: number): string => `Vai all’immagine ${n}`,
  thumbnailsLabel: 'Miniature delle immagini',
  openLightbox: 'Apri a schermo intero',
  lightboxLabel: 'Anteprima a schermo intero',
  closeLightbox: 'Chiudi anteprima',
  zoomIn: 'Ingrandisci 2×',
  zoomOut: 'Riporta a 1×',
  zoomLevel: (level: number): string => `Zoom ${level}×`,
  imageCounter: (current: number, total: number): string => `${current} / ${total}`,
  imagePosition: (current: number, total: number): string => `Immagine ${current} di ${total}`,

  /* --- Metadata / crediti --- */
  credits: 'Crediti',
  discoverMore: 'Scopri di più',
  photoTitle: 'Titolo',
  photoDescription: 'Descrizione',
  photoSource: 'Fonte',
  photoDate: 'Periodo',
  photoTags: 'Tag',
  copyrightLinkLabel: (text: string): string => `Apri il link di credito: ${text}`,
  externalHint: 'Si apre in una nuova scheda',
  animatedTitle: 'Wallpaper animato',
  watchVideo: 'Guarda il video',
  downloadVideo: 'Scarica il video',

  /* --- Risoluzione / download --- */
  resolutionLabel: 'Risoluzione',
  resolutionHint: 'Le opzioni arrivano dalla configurazione del server',
  resolutionRecommended: 'Consigliata',
  resolutionNative: 'Nativa',
  resolutionGroup: (group: ResolutionGroup): string => RESOLUTION_GROUP_LABELS[group],
  download: 'Scarica',
  downloadNow: 'Scarica ora',
  downloadMenuLabel: 'Scegli la risoluzione e scarica',
  copyLink: 'Copia link',
  linkCopied: 'Link copiato negli appunti',
  copyFailed: 'Impossibile copiare il link',
  downloadStarted: (resolution: string): string => `Download avviato · ${resolution}`,
  downloadFallback: 'Download avviato',

  /* --- Toast --- */
  toastDismiss: 'Chiudi notifica',
} as const;

export type Dictionary = typeof t;
