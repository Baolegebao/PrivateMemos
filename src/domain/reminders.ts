import type { Reminder, ReminderRepeat } from './types';

export function applyDueReminder(reminder: Reminder, notifiedIds: string[], now = new Date()) {
  const nextTime = getNextReminderTime(reminder.time, reminder.repeat, now);
  const nextReminder = {
    ...reminder,
    time: nextTime ?? reminder.time,
    acknowledged: nextTime ? false : true,
    updatedAt: now.toISOString()
  };

  return {
    reminder: nextReminder,
    notifiedIds: nextTime ? notifiedIds.filter((id) => id !== reminder.id) : [...new Set([...notifiedIds, reminder.id])]
  };
}

export function getNextReminderTime(time: string, repeat: ReminderRepeat, now = new Date()): string | undefined {
  if (repeat === 'none') {
    return undefined;
  }

  const next = new Date(time);
  const nowTime = now.getTime();

  while (next.getTime() <= nowTime) {
    if (repeat === 'daily') {
      next.setDate(next.getDate() + 1);
    } else if (repeat === 'weekly') {
      next.setDate(next.getDate() + 7);
    } else if (repeat === 'monthly') {
      next.setMonth(next.getMonth() + 1);
    } else if (repeat === 'yearly') {
      next.setFullYear(next.getFullYear() + 1);
    }
  }

  return next.toISOString();
}
