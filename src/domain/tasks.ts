import type { Task } from './types';

export function rolloverRecurringTasks(tasks: Task[], now = new Date()): Task[] {
  const today = now.toISOString().slice(0, 10);

  return tasks.map((task) => {
    if (!task.completed || !task.completedAt || !isRecurringTask(task)) {
      return task;
    }

    if (!shouldResetRecurringTask(task, now, today)) {
      return task;
    }

    return {
      ...task,
      completed: false,
      completedAt: undefined,
      updatedAt: now.toISOString(),
      steps: task.steps.map((step) => ({ ...step, completed: false }))
    };
  });
}

function isRecurringTask(task: Task) {
  return task.type === 'daily' || task.type === 'weekly' || task.type === 'monthly';
}

function shouldResetRecurringTask(task: Task, now: Date, today: string) {
  const completed = new Date(task.completedAt!);
  if (task.type === 'daily') {
    return task.completedAt!.slice(0, 10) !== today;
  }

  if (task.type === 'weekly') {
    return getWeekKey(completed) !== getWeekKey(now);
  }

  if (task.type === 'monthly') {
    return completed.getFullYear() !== now.getFullYear() || completed.getMonth() !== now.getMonth();
  }

  return false;
}

function getWeekKey(date: Date) {
  const value = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = value.getUTCDay() || 7;
  value.setUTCDate(value.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(value.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((value.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${value.getUTCFullYear()}-${week}`;
}
