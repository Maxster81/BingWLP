import './Spinner.css';

export type SpinnerProps = {
  size?: number;
  /** Testo per lo screen reader; se omesso lo spinner è puramente decorativo. */
  label?: string;
  className?: string;
};

export function Spinner({ size = 22, label, className }: SpinnerProps) {
  const classes = className ? `bwp-spinner ${className}` : 'bwp-spinner';
  return (
    <span className={classes} role={label ? 'status' : undefined} aria-live={label ? 'polite' : undefined}>
      <span className="bwp-spinner__ring" style={{ width: size, height: size }} aria-hidden="true" />
      {label ? <span className="bwp-visually-hidden">{label}</span> : null}
    </span>
  );
}
