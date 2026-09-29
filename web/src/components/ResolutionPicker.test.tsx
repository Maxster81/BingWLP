import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { groupResolutions, ResolutionPicker } from './ResolutionPicker';
import { t } from '../lib/i18n';
import { makeResolutions } from '../test/fixtures';

describe('groupResolutions', () => {
  it('raggruppa per gruppo nell’ordine stabile del design system', () => {
    const buckets = groupResolutions(makeResolutions());
    expect(buckets.map((bucket) => bucket.group)).toEqual(['original', 'desktop', 'mobile']);
    expect(buckets[0]?.label).toBe(t.resolutionGroup('original'));
    expect(buckets[1]?.items).toHaveLength(2);
  });

  it('scarta i gruppi senza elementi', () => {
    const buckets = groupResolutions(makeResolutions().filter((item) => item.group === 'mobile'));
    expect(buckets).toHaveLength(1);
    expect(buckets[0]?.group).toBe('mobile');
  });
});

describe('ResolutionPicker', () => {
  it('mostra la risoluzione corrente nel trigger', () => {
    render(<ResolutionPicker resolutions={makeResolutions()} value="1920x1080" onChange={() => {}} />);
    expect(screen.getByRole('button', { name: /Full HD/ })).toHaveAttribute('aria-expanded', 'false');
  });

  it('apre il pannello raggruppato con le etichette di gruppo', async () => {
    const user = userEvent.setup();
    render(<ResolutionPicker resolutions={makeResolutions()} value="1920x1080" onChange={() => {}} />);

    await user.click(screen.getByRole('button', { name: /Full HD/ }));

    expect(screen.getByRole('listbox', { name: t.resolutionLabel })).toBeInTheDocument();
    expect(screen.getByText(t.resolutionGroup('original'))).toBeInTheDocument();
    expect(screen.getByText(t.resolutionGroup('desktop'))).toBeInTheDocument();
    expect(screen.getByText(t.resolutionGroup('mobile'))).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /Ultra HD/ })).toBeInTheDocument();
  });

  it('selezionando un’opzione chiama onChange e chiude il pannello', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<ResolutionPicker resolutions={makeResolutions()} value="1920x1080" onChange={onChange} />);

    await user.click(screen.getByRole('button', { name: /Full HD/ }));
    await user.click(screen.getByRole('option', { name: /Ultra HD/ }));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('3840x2160');
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('marca l’opzione corrente come selezionata', async () => {
    const user = userEvent.setup();
    render(<ResolutionPicker resolutions={makeResolutions()} value="original" onChange={() => {}} />);

    await user.click(screen.getByRole('button', { name: /Originale/ }));
    expect(screen.getByRole('option', { name: /Originale/ })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('option', { name: /Full HD/ })).toHaveAttribute('aria-selected', 'false');
  });
});
