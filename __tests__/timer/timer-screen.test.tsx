import React from 'react';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { TimerScreen } from '@/app/timer/components/TimerScreen';

const { push } = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));
vi.mock('@/app/components/AuthProvider', () => ({
  useAuth: () => ({ user: { id: 1, completedTodaySeconds: 3601 } }),
}));

const subjects = [
  { id: 7, name: 'Further maths & calculus', code: '9231', examBoard: 'CAIE', level: 'A-Level', todaySeconds: 601 },
];
const quests = [
  { id: 9, title: 'Review integration techniques', status: 'PENDING', subjectId: 7, subject: subjects[0], difficulty: 'HARD', targetMinutes: 45, elapsedSeconds: 61 },
  { id: 10, title: 'Completed quest', status: 'COMPLETED', elapsedSeconds: 3600 },
];

beforeEach(() => {
  push.mockClear();
  vi.stubGlobal('fetch', vi.fn(async (url: string) => ({
    ok: true,
    json: async () => url === '/api/subjects' ? subjects : quests,
  })));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('Timer session choices', () => {
  it('keeps quests and subjects in named regions with their own times and focus destinations', async () => {
    render(<TimerScreen />);
    const questRegion = screen.getByRole('region', { name: 'Active Quests' });
    const subjectRegion = screen.getByRole('region', { name: 'Subjects' });
    await within(subjectRegion).findByText('Further maths & calculus');

    expect(within(questRegion).getByRole('heading', { name: 'Review integration techniques' })).toBeVisible();
    expect(within(questRegion).queryByText('Completed quest')).not.toBeInTheDocument();
    expect(within(subjectRegion).getByText('00:10:01')).toBeVisible();
    expect(screen.getByText('01:00:01')).toBeVisible();

    fireEvent.click(within(questRegion).getByRole('button', { name: 'Start focus session for Review integration techniques' }));
    expect(push).toHaveBeenLastCalledWith('/focus?questId=9&subjectId=7&subjectName=Further%20maths%20%26%20calculus');
    fireEvent.click(within(subjectRegion).getByRole('button', { name: 'Start focus session for Further maths & calculus' }));
    expect(push).toHaveBeenLastCalledWith('/focus?subjectId=7&subjectName=Further%20maths%20%26%20calculus');
  });

  it('keeps subject management and the single add action available after reflow', async () => {
    render(<TimerScreen />);
    const manage = await screen.findByRole('button', { name: 'Manage Further maths & calculus' });
    fireEvent.click(manage);
    expect(manage).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('menuitem', { name: 'Edit subject' })).toBeVisible();
    expect(screen.getByRole('menuitem', { name: /Delete subject/ })).toBeVisible();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Add Subject' })).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Add Subject' }));
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Add Subject' })).toBeVisible());
  });

  it('retains both empty sections and their next actions', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => [] })));
    render(<TimerScreen />);
    await screen.findByText('No active quests today.');
    expect(screen.getByText('No subjects configured yet.')).toBeVisible();
    expect(screen.getByRole('link', { name: 'View Quests in Dashboard' })).toHaveAttribute('href', '/dashboard');
    fireEvent.click(screen.getByRole('button', { name: 'Add your first subject' }));
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Add Subject' })).toBeVisible());
  });
});
