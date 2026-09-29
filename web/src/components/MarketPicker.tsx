import { useEffect, useId, useRef, useState } from 'react';
import type { Market, MarketCode } from '../api/types';
import { t } from '../lib/i18n';
import { Icon } from './Icon';
import './MarketPicker.css';

export type MarketPickerProps = {
  markets: Market[];
  value: MarketCode | null;
  onChange: (code: MarketCode) => void;
};

/**
 * Selettore del mercato con dropdown completamente custom (stile aurora):
 * niente <select> nativo, quindi trigger E panel seguono il tema del sito.
 * Accessibile: pattern listbox (freccette, Esc, focus management).
 */
export function MarketPicker({ markets, value, onChange }: MarketPickerProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const panelId = useId();
  const labelId = `${panelId}-label`;
  const valueId = `${panelId}-value`;

  const selected = markets.find((item) => item.code === value) ?? null;

  // Chiusura su click fuori dal componente.
  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event: MouseEvent): void => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [open]);

  // All'apertura il focus va sull'opzione attualmente selezionata.
  useEffect(() => {
    if (!open || !panelRef.current) return;
    const current =
      panelRef.current.querySelector<HTMLButtonElement>('.bwp-market-picker__option.is-selected') ??
      panelRef.current.querySelector<HTMLButtonElement>('.bwp-market-picker__option');
    current?.focus();
  }, [open]);

  const select = (code: MarketCode): void => {
    onChange(code);
    setOpen(false);
  };

  const closeAndFocusTrigger = (): void => {
    setOpen(false);
    containerRef.current?.querySelector<HTMLButtonElement>('.bwp-market-picker__trigger')?.focus();
  };

  // Freccette su/giu': spostano il focus tra le opzioni (circolare).
  const moveFocus = (delta: number): void => {
    const options = panelRef.current?.querySelectorAll<HTMLButtonElement>('.bwp-market-picker__option');
    if (!options || options.length === 0) return;
    const list = Array.from(options);
    const current = list.findIndex((option) => option === document.activeElement);
    const next = list[(current + delta + list.length) % list.length];
    next?.focus();
  };

  return (
    <div
      className="bwp-market-picker"
      ref={containerRef}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && open) {
          event.stopPropagation();
          closeAndFocusTrigger();
        }
        if (open && event.key === 'ArrowDown') {
          event.preventDefault();
          moveFocus(1);
        }
        if (open && event.key === 'ArrowUp') {
          event.preventDefault();
          moveFocus(-1);
        }
      }}
    >
      <span className="bwp-market-picker__label" id={labelId}>
        {t.marketLabel}
      </span>
      <button
        type="button"
        className="bwp-market-picker__trigger"
        onClick={() => setOpen((prev) => !prev)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        aria-labelledby={`${labelId} ${valueId}`}
        title={t.marketHint}
      >
        <span className="bwp-market-picker__flag" aria-hidden="true">
          {selected?.flag ?? '🌍'}
        </span>
        <span className="bwp-market-picker__value" id={valueId}>
          {selected ? selected.name : (value ?? '…')}
        </span>
        <span
          className={open ? 'bwp-market-picker__chevron is-open' : 'bwp-market-picker__chevron'}
          aria-hidden="true"
        >
          <Icon name="chevron-down" size={16} />
        </span>
      </button>

      {open ? (
        <div
          className="bwp-market-picker__panel"
          role="listbox"
          id={panelId}
          aria-labelledby={labelId}
          ref={panelRef}
        >
          {markets.map((item) => {
            const isSelected = item.code === value;
            return (
              <button
                key={item.code}
                type="button"
                role="option"
                aria-selected={isSelected}
                className={isSelected ? 'bwp-market-picker__option is-selected' : 'bwp-market-picker__option'}
                onClick={() => select(item.code)}
              >
                <span className="bwp-market-picker__flag" aria-hidden="true">
                  {item.flag}
                </span>
                <span className="bwp-market-picker__option-name">{item.name}</span>
                <span className="bwp-market-picker__option-code">{item.code}</span>
                {isSelected ? <Icon name="check" size={16} /> : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
