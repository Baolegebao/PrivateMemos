import { describe, expect, it } from 'vitest';
import { createTask } from './store';
import { rolloverRecurringTasks } from './tasks';

describe('task recurrence', () => {
  it('does not reset normal completed tasks', () => {
    const task = {
      ...createTask({ title: 'normal', type: 'normal', steps: ['done'] }),
      completed: true,
      completedAt: '2026-06-30T10:00:00.000Z'
    };

    expect(rolloverRecurringTasks([task], new Date('2026-07-01T08:00:00.000Z'))[0].completed).toBe(true);
  });

  it('resets completed daily tasks on the next day', () => {
    const task = {
      ...createTask({ title: 'daily', type: 'daily', steps: ['step'] }),
      completed: true,
      completedAt: '2026-06-30T10:00:00.000Z',
      steps: [{ id: 's1', body: 'step', completed: true }]
    };

    const [rolled] = rolloverRecurringTasks([task], new Date('2026-07-01T08:00:00.000Z'));

    expect(rolled.completed).toBe(false);
    expect(rolled.completedAt).toBeUndefined();
    expect(rolled.steps[0].completed).toBe(false);
  });

  it('keeps recurring tasks completed during the same day', () => {
    const task = {
      ...createTask({ title: 'daily', type: 'daily', steps: ['step'] }),
      completed: true,
      completedAt: '2026-07-01T07:00:00.000Z'
    };

    expect(rolloverRecurringTasks([task], new Date('2026-07-01T08:00:00.000Z'))[0].completed).toBe(true);
  });

  it('resets weekly tasks only after the week changes', () => {
    const task = {
      ...createTask({ title: 'weekly', type: 'weekly', steps: ['step'] }),
      completed: true,
      completedAt: '2026-07-01T07:00:00.000Z'
    };

    expect(rolloverRecurringTasks([task], new Date('2026-07-03T08:00:00.000Z'))[0].completed).toBe(true);
    expect(rolloverRecurringTasks([task], new Date('2026-07-08T08:00:00.000Z'))[0].completed).toBe(false);
  });

  it('resets monthly tasks only after the month changes', () => {
    const task = {
      ...createTask({ title: 'monthly', type: 'monthly', steps: ['step'] }),
      completed: true,
      completedAt: '2026-07-01T07:00:00.000Z'
    };

    expect(rolloverRecurringTasks([task], new Date('2026-07-20T08:00:00.000Z'))[0].completed).toBe(true);
    expect(rolloverRecurringTasks([task], new Date('2026-08-01T08:00:00.000Z'))[0].completed).toBe(false);
  });
});
