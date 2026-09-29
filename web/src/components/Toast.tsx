import { useEffect } from 'react';
import { Icon } from './Icon';
import { t } from '../lib/i18n';
import './Toast.css';

export type ToastProps = {
  /** `null` = nessuna notifica visibile. */
  message: string | null;
  onDismiss: () => void;
  /** Millisecondi prima della chiusura automatica (default 3200). */
  duration?: number;
};

/** Conferma non bloccante (download avviato, link copiato). `aria-live` polite. */
export function Toast({ message, onDismiss, duration = 3200 }: ToastProps) {
  useEffect(() => {
    if (message === null) return undefined;
    const timer = window.setTimeout(onDismiss, duration);
    return () => window.clearTimeout(timer);
  }, [message, duration, onDismiss]);

  return (
    <div className="bwp-toast-region" role="status" aria-live="polite" aria-atomic="true">
      {message !== null ? (
        <div className="bwp-toast" key={message}>
          <span className="bwp-toast__icon" aria-hidden="true">
            <Icon name="check" size={18} />
          </span>
          <span className="bwp-toast__message">{message}</span>
          <button type="button" className="bwp-toast__close" onClick={onDismiss} aria-label={t.toastDismiss}>
            <Icon name="close" size={16} />
          </button>
        </div>
      ) : null}
    </div>
  );
}
