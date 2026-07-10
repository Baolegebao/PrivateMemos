import { describe, expect, it } from 'vitest';
import { createTask } from './store';
import {
  getOpenTasks,
  getMonthSchedules,
  getOverdueTasks,
  getUpcomingWeekTasks,
  getTodayReminders,
  getYesterdaySummary,
  searchState,
  shouldHighlightLimitedTask
} from './selectors';
import type { AppState } from './types';

function baseState(): AppState {
  return {
    displayName: '本地用户',
    theme: 'system',
    fontScale: 1,
    notes: [],
    privateNotes: [],
    focusNotes: [],
    reminders: [],
    tasks: [],
    ledgerBooks: [],
    ledgerPeople: [],
    ledgerCategories: [],
    ledgerEntries: [],
    schedules: [],
    syncQueue: [],
    syncConflicts: []
  };
}

describe('core selectors', () => {
  it('keeps daily tasks before normal open tasks', () => {
    const normal = createTask({ title: '普通任务', type: 'normal' });
    const daily = createTask({ title: '每日任务', type: 'daily' });
    const state = { ...baseState(), tasks: [normal, daily] };

    expect(getOpenTasks(state).map((task) => task.title)).toEqual(['每日任务', '普通任务']);
  });

  it('detects limited tasks when the reminder window starts', () => {
    const task = createTask({
      title: '限时任务',
      type: 'limited',
      dueAt: '2026-07-01T12:00:00.000Z',
      remindHoursBefore: 2
    });

    expect(shouldHighlightLimitedTask(task, new Date('2026-07-01T10:30:00.000Z'))).toBe(true);
    expect(shouldHighlightLimitedTask(task, new Date('2026-07-01T09:59:00.000Z'))).toBe(false);
  });

  it('finds overdue unfinished tasks only', () => {
    const overdue = createTask({ title: '过期', type: 'limited', dueAt: '2026-07-01T08:00:00.000Z' });
    const done = { ...createTask({ title: '已完成', type: 'limited', dueAt: '2026-07-01T08:00:00.000Z' }), completed: true };
    const state = { ...baseState(), tasks: [overdue, done] };

    expect(getOverdueTasks(state, new Date('2026-07-01T09:00:00.000Z'))).toEqual([overdue]);
  });

  it('returns unfinished tasks due in the next week', () => {
    const soon = createTask({ title: '三天后', type: 'limited', dueAt: '2026-07-04T09:00:00.000Z' });
    const later = createTask({ title: '八天后', type: 'limited', dueAt: '2026-07-09T09:00:00.000Z' });
    const overdue = createTask({ title: '已过期', type: 'limited', dueAt: '2026-06-30T09:00:00.000Z' });
    const done = { ...createTask({ title: '已完成', type: 'limited', dueAt: '2026-07-03T09:00:00.000Z' }), completed: true };
    const state = { ...baseState(), tasks: [later, soon, overdue, done] };

    expect(getUpcomingWeekTasks(state, new Date('2026-07-01T09:00:00.000Z'))).toEqual([soon]);
  });

  it('returns schedules that occur in the current month', () => {
    const state: AppState = {
      ...baseState(),
      schedules: [
        { id: 's1', title: '本月一次', date: '2026-07-05T00:00:00', repeat: 'none', createdAt: '2026-07-01T00:00:00.000Z', updatedAt: '2026-07-01T00:00:00.000Z' },
        { id: 's2', title: '下月一次', date: '2026-08-05T00:00:00', repeat: 'none', createdAt: '2026-07-01T00:00:00.000Z', updatedAt: '2026-07-01T00:00:00.000Z' },
        { id: 's3', title: '年度重复', date: '2025-07-10T00:00:00', repeat: 'yearlySolar', createdAt: '2026-07-01T00:00:00.000Z', updatedAt: '2026-07-01T00:00:00.000Z' }
      ]
    };

    expect(getMonthSchedules(state, new Date('2026-07-02T09:00:00.000Z')).map((item) => `${item.date} ${item.title}`)).toEqual([
      '2026-07-05 本月一次',
      '2026-07-10 年度重复'
    ]);
  });

  it('returns today reminders and ignores acknowledged reminders', () => {
    const state: AppState = {
      ...baseState(),
      reminders: [
        {
          id: 'r1',
          time: '2026-07-01T09:00:00.000Z',
          memo: '开会',
          repeat: 'none',
          acknowledged: false,
          createdAt: '2026-07-01T09:00:00.000Z',
          updatedAt: '2026-07-01T09:00:00.000Z'
        },
        {
          id: 'r2',
          time: '2026-07-01T10:00:00.000Z',
          memo: '已处理',
          repeat: 'none',
          acknowledged: true,
          createdAt: '2026-07-01T10:00:00.000Z',
          updatedAt: '2026-07-01T10:00:00.000Z'
        }
      ]
    };

    expect(getTodayReminders(state, new Date('2026-07-01T12:00:00.000Z')).map((item) => item.memo)).toEqual(['开会']);
  });

  it('summarizes yesterday updates across modules', () => {
    const state: AppState = {
      ...baseState(),
      notes: [{ id: 'n1', body: '昨天记事', highlighted: false, createdAt: '2026-06-30T10:00:00.000Z', updatedAt: '2026-06-30T10:00:00.000Z' }],
      privateNotes: [
        {
          id: 'p1',
          title: '昨天笔记',
          body: '',
          highlighted: false,
          locked: false,
          createdAt: '2026-06-30T11:00:00.000Z',
          updatedAt: '2026-06-30T11:00:00.000Z'
        }
      ]
    };

    expect(getYesterdaySummary(state, new Date('2026-07-01T12:00:00.000Z'))).toMatchObject({
      notes: 1,
      privateNotes: 1,
      total: 2
    });
  });

  it('searches notes, private notes, reminders and tasks', () => {
    const state: AppState = {
      ...baseState(),
      notes: [{ id: 'n1', body: 'shared-key note', highlighted: false, createdAt: '2026-07-01T10:00:00.000Z', updatedAt: '2026-07-01T10:00:00.000Z' }],
      privateNotes: [
        {
          id: 'p1',
          title: 'shared-key private',
          body: 'body',
          highlighted: false,
          locked: false,
          createdAt: '2026-07-01T10:00:00.000Z',
          updatedAt: '2026-07-01T10:00:00.000Z'
        }
      ],
      reminders: [
        {
          id: 'r1',
          time: '2026-07-01T10:00:00.000Z',
          memo: 'shared-key reminder',
          repeat: 'none',
          acknowledged: false,
          createdAt: '2026-07-01T10:00:00.000Z',
          updatedAt: '2026-07-01T10:00:00.000Z'
        }
      ],
      tasks: [createTask({ title: 'shared-key task', type: 'normal' })]
    };

    expect(searchState(state, 'shared-key').map((item) => item.type)).toEqual(['记事', '私人笔记', '提醒', '任务']);
  });

  it('searches limited tasks by due date range', () => {
    const task = createTask({
      title: 'pay rent',
      type: 'limited',
      dueAt: '2026-07-10T09:00:00.000Z'
    });
    const state: AppState = {
      ...baseState(),
      tasks: [{ ...task, createdAt: '2026-07-01T09:00:00.000Z', updatedAt: '2026-07-01T09:00:00.000Z' }]
    };

    expect(searchState(state, '', { from: '2026-07-10', to: '2026-07-10' }).map((item) => item.id)).toEqual([task.id]);
  });

  it('summarizes ledger entries by income, expense and category', async () => {
    const { summarizeLedger, summarizeLedgerByCategory } = await import('./selectors');
    const state: AppState = {
      ...baseState(),
      ledgerCategories: [
        { id: 'c1', name: '餐饮', icon: 'food', type: 'expense', createdAt: '2026-07-01T00:00:00.000Z', updatedAt: '2026-07-01T00:00:00.000Z' },
        { id: 'c2', name: '工资', icon: 'work', type: 'income', createdAt: '2026-07-01T00:00:00.000Z', updatedAt: '2026-07-01T00:00:00.000Z' }
      ],
      ledgerEntries: [
        { id: 'e1', bookId: 'b1', personId: 'p1', categoryId: 'c1', type: 'expense', amount: 20, date: '2026-07-01T00:00:00.000Z', memo: '', createdAt: '2026-07-01T00:00:00.000Z', updatedAt: '2026-07-01T00:00:00.000Z' },
        { id: 'e2', bookId: 'b1', personId: 'p1', categoryId: 'c2', type: 'income', amount: 100, date: '2026-07-01T00:00:00.000Z', memo: '', createdAt: '2026-07-01T00:00:00.000Z', updatedAt: '2026-07-01T00:00:00.000Z' }
      ]
    };

    expect(summarizeLedger(state.ledgerEntries)).toEqual({ income: 100, expense: 20, balance: 80 });
    expect(summarizeLedgerByCategory(state, state.ledgerEntries).map((item) => item.name)).toEqual(['工资', '餐饮']);
  });

  it('filters ledger entries by type, category, date range and keyword', async () => {
    const { filterLedgerEntries } = await import('./selectors');
    const state: AppState = {
      ...baseState(),
      ledgerPeople: [{ id: 'p1', name: '本人', createdAt: '2026-07-01T00:00:00.000Z', updatedAt: '2026-07-01T00:00:00.000Z' }],
      ledgerCategories: [
        { id: 'c1', name: '餐饮', icon: 'utensils', type: 'expense', createdAt: '2026-07-01T00:00:00.000Z', updatedAt: '2026-07-01T00:00:00.000Z' },
        { id: 'c2', name: '工资', icon: 'wallet-cards', type: 'income', createdAt: '2026-07-01T00:00:00.000Z', updatedAt: '2026-07-01T00:00:00.000Z' }
      ],
      ledgerEntries: [
        { id: 'e1', bookId: 'b1', personId: 'p1', categoryId: 'c1', type: 'expense', amount: 20, date: '2026-07-01T00:00:00.000Z', memo: 'lunch', createdAt: '2026-07-01T00:00:00.000Z', updatedAt: '2026-07-01T00:00:00.000Z' },
        { id: 'e2', bookId: 'b1', personId: 'p1', categoryId: 'c2', type: 'income', amount: 100, date: '2026-07-02T00:00:00.000Z', memo: 'salary', createdAt: '2026-07-02T00:00:00.000Z', updatedAt: '2026-07-02T00:00:00.000Z' }
      ]
    };

    expect(filterLedgerEntries(state, state.ledgerEntries, { type: 'expense' }).map((item) => item.id)).toEqual(['e1']);
    expect(filterLedgerEntries(state, state.ledgerEntries, { categoryId: 'c2' }).map((item) => item.id)).toEqual(['e2']);
    expect(filterLedgerEntries(state, state.ledgerEntries, { from: '2026-07-02' }).map((item) => item.id)).toEqual(['e2']);
    expect(filterLedgerEntries(state, state.ledgerEntries, { query: '餐饮' }).map((item) => item.id)).toEqual(['e1']);
  });

  it('filters ledger entries by day, week, month and year periods', async () => {
    const { getLedgerEntries, getLedgerPeriodRange } = await import('./selectors');
    const state: AppState = {
      ...baseState(),
      ledgerEntries: [
        { id: 'day', bookId: 'b1', personId: 'p1', categoryId: 'c1', type: 'expense', amount: 1, date: '2026-07-01T00:00:00.000Z', memo: '', createdAt: '2026-07-01T00:00:00.000Z', updatedAt: '2026-07-01T00:00:00.000Z' },
        { id: 'week', bookId: 'b1', personId: 'p1', categoryId: 'c1', type: 'expense', amount: 1, date: '2026-07-03T00:00:00.000Z', memo: '', createdAt: '2026-07-03T00:00:00.000Z', updatedAt: '2026-07-03T00:00:00.000Z' },
        { id: 'month', bookId: 'b1', personId: 'p1', categoryId: 'c1', type: 'expense', amount: 1, date: '2026-07-20T00:00:00.000Z', memo: '', createdAt: '2026-07-20T00:00:00.000Z', updatedAt: '2026-07-20T00:00:00.000Z' },
        { id: 'year', bookId: 'b1', personId: 'p1', categoryId: 'c1', type: 'expense', amount: 1, date: '2026-12-01T00:00:00.000Z', memo: '', createdAt: '2026-12-01T00:00:00.000Z', updatedAt: '2026-12-01T00:00:00.000Z' },
        { id: 'other', bookId: 'b1', personId: 'p1', categoryId: 'c1', type: 'expense', amount: 1, date: '2025-12-31T00:00:00.000Z', memo: '', createdAt: '2025-12-31T00:00:00.000Z', updatedAt: '2025-12-31T00:00:00.000Z' }
      ]
    };
    const now = new Date('2026-07-01T12:00:00');

    expect(getLedgerPeriodRange('week', now)).toEqual({ from: '2026-06-29', to: '2026-07-05' });
    expect(getLedgerEntries(state, 'all', 'day', now).map((item) => item.id)).toEqual(['day']);
    expect(getLedgerEntries(state, 'all', 'week', now).map((item) => item.id)).toEqual(['week', 'day']);
    expect(getLedgerEntries(state, 'all', 'month', now).map((item) => item.id)).toEqual(['month', 'week', 'day']);
    expect(getLedgerEntries(state, 'all', 'year', now).map((item) => item.id)).toEqual(['year', 'month', 'week', 'day']);
  });

  it('groups ledger entries by date with daily income and expense totals', async () => {
    const { groupLedgerEntriesByDate } = await import('./selectors');
    const entries: AppState['ledgerEntries'] = [
      { id: 'e1', bookId: 'b1', personId: 'p1', categoryId: 'c1', type: 'expense', amount: 20, date: '2026-07-01T00:00:00.000Z', memo: '', createdAt: '2026-07-01T00:00:00.000Z', updatedAt: '2026-07-01T00:00:00.000Z' },
      { id: 'e2', bookId: 'b1', personId: 'p1', categoryId: 'c2', type: 'income', amount: 100, date: '2026-07-01T10:00:00.000Z', memo: '', createdAt: '2026-07-01T10:00:00.000Z', updatedAt: '2026-07-01T10:00:00.000Z' },
      { id: 'e3', bookId: 'b1', personId: 'p1', categoryId: 'c1', type: 'expense', amount: 5, date: '2026-07-02T00:00:00.000Z', memo: '', createdAt: '2026-07-02T00:00:00.000Z', updatedAt: '2026-07-02T00:00:00.000Z' }
    ];

    expect(groupLedgerEntriesByDate(entries).map((bucket) => [bucket.date, bucket.items.length, bucket.income, bucket.expense])).toEqual([
      ['2026-07-02', 1, 0, 5],
      ['2026-07-01', 2, 100, 20]
    ]);
  });

  it('normalizes older persisted state with new sync fields', async () => {
    const { normalizeState } = await import('./store');
    const state = normalizeState({ notes: [], syncQueue: undefined, syncConflicts: undefined });

    expect(state.syncQueue).toEqual([]);
    expect(state.syncConflicts).toEqual([]);
    expect(state.focusNotes).toEqual([]);
    expect(state.syncTargetUrl).toBe('');
    expect(state.ledgerCategories.length).toBeGreaterThan(0);
  });
});
