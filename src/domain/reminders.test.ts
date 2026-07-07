import { describe, expect, it } from 'vitest';
import { applyDueReminder, getNextReminderTime } from './reminders';
import type { Reminder } from './types';

describe('reminder recurrence', () => {
  it('does not advance one-time reminders', () => {
    expect(getNextReminderTime('2026-07-01T08:00:00.000Z', 'none', new Date('2026-07-01T09:00:00.000Z'))).toBeUndefined();
  });

  it('advances daily reminders past now', () => {
    expect(getNextReminderTime('2026-07-01T08:00:00.000Z', 'daily', new Date('2026-07-03T09:00:00.000Z'))).toBe('2026-07-04T08:00:00.000Z');
  });

  it('advances weekly reminders', () => {
    expect(getNextReminderTime('2026-07-01T08:00:00.000Z', 'weekly', new Date('2026-07-03T09:00:00.000Z'))).toBe('2026-07-08T08:00:00.000Z');
  });

  it('advances monthly reminders', () => {
    expect(getNextReminderTime('2026-07-01T08:00:00.000Z', 'monthly', new Date('2026-07-03T09:00:00.000Z'))).toBe('2026-08-01T08:00:00.000Z');
  });

  it('advances yearly reminders', () => {
    expect(getNextReminderTime('2026-07-01T08:00:00.000Z', 'yearly', new Date('2027-07-03T09:00:00.000Z'))).toBe('2028-07-01T08:00:00.000Z');
  });

  it('acknowledges one-time due reminders and records notification id', () => {
    const result = applyDueReminder(makeReminder('none'), [], new Date('2026-07-01T09:00:00.000Z'));

    expect(result.reminder.acknowledged).toBe(true);
    expect(result.notifiedIds).toEqual(['r1']);
  });

  it('advances recurring due reminders without permanently blocking future alerts', () => {
    const result = applyDueReminder(makeReminder('daily'), ['r1'], new Date('2026-07-01T09:00:00.000Z'));

    expect(result.reminder.time).toBe('2026-07-02T08:00:00.000Z');
    expect(result.reminder.acknowledged).toBe(false);
    expect(result.notifiedIds).toEqual([]);
  });
});

function makeReminder(repeat: Reminder['repeat']): Reminder {
  return {
    id: 'r1',
    time: '2026-07-01T08:00:00.000Z',
    memo: 'test',
    repeat,
    acknowledged: false,
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z'
  };
}
