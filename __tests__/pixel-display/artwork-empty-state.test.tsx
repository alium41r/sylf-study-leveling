import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PixelCompanion } from '@/app/components/companion/PixelCompanion';
import { TargetPixelCompanion } from '@/app/components/companion/TargetPixelCompanion';

afterEach(cleanup);

describe('empty artwork presentation', () => {
  it('invites the owner directly into Pixel Studio without painting a default character', () => {
    const view = render(<PixelCompanion config={{ outfit: 'sylf' }} emptyState={{ own: true }} />);
    expect(screen.getByText('Your canvas awaits')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Create artwork in Pixel Studio' })).toHaveAttribute('href', '/locker?tab=identity&view=pixel-studio');
    expect(view.container.querySelector('canvas')).toBeNull();
  });

  it('uses an in-place editor action when the owner supplies one', () => {
    const onCreate = vi.fn();
    render(<PixelCompanion emptyState={{ own: true, onCreate }} />);
    fireEvent.click(screen.getByRole('button', { name: 'Create artwork in Pixel Studio' }));
    expect(onCreate).toHaveBeenCalledOnce();
  });

  it('shows a neutral state on another person’s display without an owner action', () => {
    render(<TargetPixelCompanion size={48} label="Friend artwork" companion={{ ownerId: 2, config: { outfit: 'sylf' }, creation: null, revision: null, unavailable: false }} />);
    expect(screen.getByLabelText('No artwork')).toBeTruthy();
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('distinguishes private or missing artwork from a first-time empty display', () => {
    render(<TargetPixelCompanion size={100} label="Friend artwork" companion={{ ownerId: 2, config: null, creation: null, revision: null, unavailable: true }} />);
    expect(screen.getByLabelText('Artwork unavailable')).toBeTruthy();
    expect(screen.queryByText('Your canvas awaits')).toBeNull();
  });

  it('does not suggest creating replacement artwork while an owned selection is loading', () => {
    render(<PixelCompanion config={{ outfit: 'user:moon' }} emptyState={{ own: true, status: 'Loading artwork…' }} />);
    expect(screen.getByLabelText('Loading artwork…')).toBeTruthy();
    expect(screen.queryByRole('link')).toBeNull();
  });
});
