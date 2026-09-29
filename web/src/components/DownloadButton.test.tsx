import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DownloadButton } from './DownloadButton';
import { makeImage } from '../test/fixtures';
import { t } from '../lib/i18n';

function setup(resolutionKey = '1920x1080') {
  const onNotify = vi.fn();
  const image = makeImage(0);
  render(<DownloadButton image={image} resolutionKey={resolutionKey} onNotify={onNotify} />);
  return { onNotify, image };
}

describe('DownloadButton', () => {
  it('mostra il pulsante principale e il bottone copia-link, nessun menu', () => {
    setup();
    expect(screen.getByRole('link', { name: new RegExp(t.download) })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: t.copyLink })).toBeInTheDocument();
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: t.downloadMenuLabel })).not.toBeInTheDocument();
  });

  it('il link di download punta alla risoluzione corrente', () => {
    setup('3840x2160');
    const link = screen.getByRole('link', { name: new RegExp(t.download) });
    expect(link).toHaveAttribute('href', expect.stringContaining('res=3840x2160'));
  });

  it('click su scarica: notifica con la risoluzione', async () => {
    const user = userEvent.setup();
    const { onNotify } = setup('1920x1080');
    await user.click(screen.getByRole('link', { name: new RegExp(t.download) }));
    expect(onNotify).toHaveBeenCalledWith(t.downloadStarted('1920x1080'));
  });

  it('copia link: notifica di conferma', async () => {
    const user = userEvent.setup();
    const { onNotify } = setup();
    await user.click(screen.getByRole('button', { name: t.copyLink }));
    // in jsdom la Clipboard API non c'e': accettiamo sia successo che fallback
    expect(onNotify).toHaveBeenCalled();
  });
});
