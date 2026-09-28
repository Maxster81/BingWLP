import { Icon } from './Icon';
import { t } from '../lib/i18n';
import './ErrorState.css';

export type ErrorStateProps = {
  /** Titolo generico; default `t.errorTitle`. */
  title?: string;
  message: string;
  /** Codice errore del contratto (es. `UPSTREAM_TIMEOUT`), mostrato in piccolo. */
  code?: string;
  onRetry?: () => void;
  retryLabel?: string;
  compact?: boolean;
};

/** Stato di errore upstream con azione "Riprova". */
export function ErrorState({ title = t.errorTitle, message, code, onRetry, retryLabel = t.retry, compact = false }: ErrorStateProps) {
  return (
    <div className={compact ? 'bwp-state bwp-state--compact' : 'bwp-state'} role="alert">
      <span className="bwp-state__icon bwp-state__icon--error" aria-hidden="true">
        <Icon name="alert" size={compact ? 22 : 30} />
      </span>
      <div className="bwp-state__body">
        <h2 className="bwp-state__title">{title}</h2>
        <p className="bwp-state__message">{message}</p>
        {code ? <p className="bwp-state__code">{code}</p> : null}
      </div>
      {onRetry ? (
        <button type="button" className="bwp-button bwp-button--primary" onClick={onRetry}>
          <Icon name="retry" size={18} />
          <span>{retryLabel}</span>
        </button>
      ) : null}
    </div>
  );
}
