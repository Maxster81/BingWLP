import { api } from '../api/client';
import type { WallpaperImage } from '../api/types';
import { absoluteUrl } from '../lib/urls';
import { t } from '../lib/i18n';
import { Icon } from './Icon';
import './DownloadButton.css';

/** Copia negli appunti con fallback per browser senza Clipboard API. */
async function copyText(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* proviamo il fallback */
  }
  try {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    const ok = typeof document.execCommand === 'function' ? document.execCommand('copy') : false;
    document.body.removeChild(area);
    return ok;
  } catch {
    return false;
  }
}

export type DownloadButtonProps = {
  image: WallpaperImage;
  resolutionKey: string;
  onNotify: (message: string) => void;
  variant?: 'primary' | 'default';
  size?: 'md' | 'sm';
  label?: string;
};

/**
 * Pulsante di download alla risoluzione corrente (scelta nel ResolutionPicker
 * accanto) + bottone-icona "copia link". Niente menu' a tendina: la scelta
 * della risoluzione vive in un unico posto.
 * Il download usa `window.location.assign` (mai `fetch`): nessun file in memoria.
 */
export function DownloadButton({
  image,
  resolutionKey,
  onNotify,
  variant = 'default',
  size = 'md',
  label,
}: DownloadButtonProps) {
  const downloadHref = api.downloadUrl(image.downloadBase, resolutionKey);

  const startDownload = (): void => {
    onNotify(t.downloadStarted(resolutionKey));
    try {
      window.location.assign(downloadHref);
    } catch {
      /* ambiente senza navigazione (test/jsdom): la notifica e' gia' stata mostrata */
    }
  };

  const handleCopy = async (): Promise<void> => {
    const ok = await copyText(absoluteUrl(downloadHref));
    onNotify(ok ? t.linkCopied : t.copyFailed);
  };

  return (
    <div className={`bwp-download bwp-download--${variant} bwp-download--${size}`}>
      <a
        className={
          variant === 'primary' ? 'bwp-button bwp-button--primary bwp-download__main' : 'bwp-button bwp-download__main'
        }
        href={downloadHref}
        onClick={(event) => {
          if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
          event.preventDefault();
          startDownload();
        }}
      >
        <Icon name="download" size={17} />
        <span>{label ?? t.download}</span>
      </a>

      <button
        type="button"
        className="bwp-download__copy"
        onClick={() => void handleCopy()}
        title={t.copyLink}
        aria-label={t.copyLink}
      >
        <Icon name="copy" size={16} />
      </button>
    </div>
  );
}
