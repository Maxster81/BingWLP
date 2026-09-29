import { useEffect, useId, useRef, useState } from 'react';
import type { Resolution, ResolutionGroup } from '../api/types';
import { RESOLUTION_GROUP_ORDER } from '../lib/format';
import { RESOLUTION_GROUP_LABELS, t } from '../lib/i18n';
import { Icon } from './Icon';
import type { IconName } from './Icon';
import './ResolutionPicker.css';

export type ResolutionBucket = {
  group: ResolutionGroup;
  label: string;
  icon: IconName;
  items: Resolution[];
};

const GROUP_ICONS: Record<ResolutionGroup, IconName> = {
  original: 'sparkles',
  desktop: 'monitor',
  ultrawide: 'monitor',
  tablet: 'tablet',
  mobile: 'smartphone',
};

/** Raggruppa le risoluzioni del contratto per `group`, in ordine stabile. */
export function groupResolutions(resolutions: Resolution[]): ResolutionBucket[] {
  const buckets = new Map<ResolutionGroup, Resolution[]>();
  for (const resolution of resolutions) {
    const bucket = buckets.get(resolution.group);
    if (bucket) bucket.push(resolution);
    else buckets.set(resolution.group, [resolution]);
  }

  const ordered: ResolutionBucket[] = [];
  for (const group of RESOLUTION_GROUP_ORDER) {
    const items = buckets.get(group);
    if (!items || items.length === 0) continue;
    ordered.push({ group, label: RESOLUTION_GROUP_LABELS[group], icon: GROUP_ICONS[group], items });
  }
  return ordered;
}

export type ResolutionPickerProps = {
  resolutions: Resolution[];
  value: string;
  onChange: (key: string) => void;
  className?: string;
  disabled?: boolean;
};

/** Dropdown raggruppato per gruppo di risoluzione (desktop / mobile / originale…). */
export function ResolutionPicker({ resolutions, value, onChange, className, disabled = false }: ResolutionPickerProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const panelId = useId();
  const buckets = groupResolutions(resolutions);
  const selected = resolutions.find((item) => item.key === value) ?? null;

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event: MouseEvent): void => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [open]);

  const select = (key: string): void => {
    onChange(key);
    setOpen(false);
  };

  return (
    <div
      className={className ? `bwp-resolution ${className}` : 'bwp-resolution'}
      ref={containerRef}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && open) {
          event.stopPropagation();
          setOpen(false);
        }
      }}
    >
      <button
        type="button"
        className="bwp-resolution__trigger"
        onClick={() => setOpen((prev) => !prev)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        disabled={disabled}
        title={t.resolutionHint}
      >
        <Icon name={selected ? GROUP_ICONS[selected.group] : 'monitor'} size={17} />
        <span className="bwp-resolution__trigger-text">
          <span className="bwp-resolution__trigger-label">{t.resolutionLabel}</span>
          <span className="bwp-resolution__trigger-value">{selected ? selected.label : value}</span>
        </span>
        <span className={open ? 'bwp-resolution__chevron is-open' : 'bwp-resolution__chevron'} aria-hidden="true">
          <Icon name="chevron-down" size={16} />
        </span>
      </button>

      {open ? (
        <div className="bwp-resolution__panel" role="listbox" aria-label={t.resolutionLabel} id={panelId}>
          {buckets.map((bucket) => (
            <div className="bwp-resolution__group" key={bucket.group} role="group" aria-label={bucket.label}>
              <p className="bwp-resolution__group-title">
                <Icon name={bucket.icon} size={14} />
                <span>{bucket.label}</span>
              </p>
              <div className="bwp-resolution__options">
                {bucket.items.map((item) => {
                  const isSelected = item.key === value;
                  return (
                    <button
                      key={item.key}
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      className={isSelected ? 'bwp-resolution__option is-selected' : 'bwp-resolution__option'}
                      onClick={() => select(item.key)}
                    >
                      <span className="bwp-resolution__option-label">{item.label}</span>
                      <span className="bwp-resolution__option-tags">
                        {item.recommended ? (
                          <span className="bwp-badge bwp-badge--pack">{t.resolutionRecommended}</span>
                        ) : null}
                        <span className="bwp-resolution__option-aspect">{item.aspect}</span>
                      </span>
                      {isSelected ? <Icon name="check" size={16} /> : null}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
