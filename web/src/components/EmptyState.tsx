import type { ReactNode } from 'react';
import { Icon } from './Icon';
import type { IconName } from './Icon';
import './EmptyState.css';

export type EmptyStateProps = {
  title: string;
  message?: string;
  icon?: IconName;
  actionLabel?: string;
  onAction?: () => void;
  compact?: boolean;
  children?: ReactNode;
};

/** Stato vuoto (tema senza immagini, ricerca senza risultati, catalogo vuoto). */
export function EmptyState({
  title,
  message,
  icon = 'image',
  actionLabel,
  onAction,
  compact = false,
  children,
}: EmptyStateProps) {
  return (
    <div className={compact ? 'bwp-state bwp-state--empty bwp-state--compact' : 'bwp-state bwp-state--empty'}>
      <span className="bwp-state__icon" aria-hidden="true">
        <Icon name={icon} size={compact ? 22 : 30} />
      </span>
      <div className="bwp-state__body">
        <h2 className="bwp-state__title">{title}</h2>
        {message ? <p className="bwp-state__message">{message}</p> : null}
      </div>
      {children}
      {actionLabel && onAction ? (
        <button type="button" className="bwp-button" onClick={onAction}>
          {actionLabel}
        </button>
      ) : null}
    </div>
  );
}
