// @vitest-environment jsdom
import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider, useAuth, type UserStats } from '@/app/components/AuthProvider';

const user = { id: 1, username: 'pixel_qa', hp: 85, sylph: 72, characterConfig: { outfit: 'sylf', density: 'chunky' } } as UserStats;
function Probe() {
 const auth = useAuth();
 return <><output data-testid="user">{JSON.stringify(auth.user)}</output><button onClick={() => auth.mutateUser({ id: 1, characterConfig: { outfit: 'sylf', density: 'original' } })}>Apply</button><button onClick={() => void auth.refreshStats()}>Refresh</button><button onClick={() => auth.login({ ...user, id: 2, username: 'other_qa' })}>Other account</button></>;
}
describe('Auth customization and refresh ordering', () => {
 afterEach(() => vi.unstubAllGlobals());
 it('retains an applied partial customization when an older stats read arrives, then accepts a fresh read', async () => {
  let finish!: (response: Response) => void;
  const fetcher = vi.fn().mockImplementationOnce(() => new Promise<Response>(resolve => { finish = resolve; })).mockResolvedValueOnce(new Response(JSON.stringify({ ...user, hp: 75, characterConfig: { outfit: 'sylf', density: 'original' } })));
  vi.stubGlobal('fetch', fetcher);
  render(<AuthProvider initialUser={user}><Probe /></AuthProvider>);
  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
  fireEvent.click(screen.getByText('Apply'));
  await act(async () => finish(new Response(JSON.stringify(user))));
  expect(JSON.parse(screen.getByTestId('user').textContent!)).toMatchObject({ hp: 85, sylph: 72, characterConfig: { density: 'original' } });
  fireEvent.click(screen.getByText('Refresh'));
  await waitFor(() => expect(JSON.parse(screen.getByTestId('user').textContent!)).toMatchObject({ hp: 75, characterConfig: { density: 'original' } }));
 });
 it('cannot restore the previous account from a delayed read after login changes owner', async () => {
  let finish!: (response: Response) => void;
  vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(resolve => { finish = resolve; })));
  render(<AuthProvider initialUser={user}><Probe /></AuthProvider>);
  fireEvent.click(screen.getByText('Other account'));
  await act(async () => finish(new Response(JSON.stringify(user))));
  expect(JSON.parse(screen.getByTestId('user').textContent!)).toMatchObject({ id: 2, username: 'other_qa' });
 });
});
