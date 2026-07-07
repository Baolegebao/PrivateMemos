import { getLunarParts, isToday, isYesterday } from './date';
import type { AppState, LedgerEntry, LedgerEntryType, LedgerPeriod, ModuleKey, Reminder, Task } from './types';

export interface LedgerEntryFilters {
  query?: string;
  type?: LedgerEntryType | 'all';
  categoryId?: string | 'all';
  from?: string;
  to?: string;
}

export interface SearchResult {
  type: string;
  id: string;
  title: string;
  module: ModuleKey;
}

export interface MonthScheduleItem {
  id: string;
  title: string;
  date: string;
}

export function getTodayReminders(state: AppState, now = new Date()): Reminder[] {
  return state.reminders
    .filter((reminder) => !reminder.acknowledged && isToday(reminder.time, now))
    .sort((a, b) => a.time.localeCompare(b.time));
}

export function getOpenTasks(state: AppState): Task[] {
  return state.tasks
    .filter((task) => !task.completed)
    .sort((a, b) => {
      if (a.type === 'daily' && b.type !== 'daily') return -1;
      if (b.type === 'daily' && a.type !== 'daily') return 1;
      return (a.dueAt ?? a.createdAt).localeCompare(b.dueAt ?? b.createdAt);
    });
}

export function getOverdueTasks(state: AppState, now = new Date()): Task[] {
  return state.tasks.filter((task) => {
    if (task.completed || !task.dueAt) return false;
    return new Date(task.dueAt).getTime() < now.getTime();
  });
}

export function getUpcomingWeekTasks(state: AppState, now = new Date()): Task[] {
  const start = now.getTime();
  const end = start + 7 * 24 * 60 * 60 * 1000;
  return state.tasks
    .filter((task) => {
      if (task.completed || !task.dueAt) return false;
      const due = new Date(task.dueAt).getTime();
      return due >= start && due <= end;
    })
    .sort((a, b) => (a.dueAt ?? '').localeCompare(b.dueAt ?? ''));
}

export function getYesterdaySummary(state: AppState, now = new Date()) {
  const notes = state.notes.filter((item) => isYesterday(item.createdAt, now)).length;
  const privateNotes = state.privateNotes.filter((item) => isYesterday(item.createdAt, now)).length;
  const reminders = state.reminders.filter((item) => isYesterday(item.createdAt, now)).length;
  const tasks = state.tasks.filter((item) => isYesterday(item.createdAt, now)).length;

  return {
    notes,
    privateNotes,
    reminders,
    tasks,
    total: notes + privateNotes + reminders + tasks
  };
}

export function searchState(state: AppState, query: string, dateRange?: { from?: string; to?: string }): SearchResult[] {
  const keyword = query.trim().toLowerCase();
  if (!keyword && !dateRange?.from && !dateRange?.to) {
    return [];
  }

  const inRange = (value: string) => {
    const key = value.slice(0, 10);
    if (dateRange?.from && key < dateRange.from) return false;
    if (dateRange?.to && key > dateRange.to) return false;
    return true;
  };

  const matches = (value: string) => !keyword || value.toLowerCase().includes(keyword);

  return [
    ...state.notes
      .filter((item) => inRange(item.createdAt) && matches(item.body))
      .map((item) => ({ type: '记事', id: item.id, title: item.body || '空记事', module: 'notes' as const })),
    ...state.privateNotes
      .filter((item) => inRange(item.createdAt) && matches(`${item.title} ${item.body}`))
      .map((item) => ({ type: '私人笔记', id: item.id, title: item.title, module: 'privateNotes' as const })),
    ...state.focusNotes
      .filter((item) => inRange(item.createdAt) && matches(`${item.title} ${item.body}`))
      .map((item) => ({ type: '重点', id: item.id, title: item.title, module: 'home' as const })),
    ...state.reminders
      .filter((item) => inRange(item.time) && matches(item.memo))
      .map((item) => ({ type: '提醒', id: item.id, title: item.memo || '无备注提醒', module: 'reminders' as const })),
    ...state.tasks
      .filter((item) => (inRange(item.createdAt) || (item.dueAt ? inRange(item.dueAt) : false)) && matches(`${item.title} ${item.steps.map((step) => step.body).join(' ')}`))
      .map((item) => ({ type: '任务', id: item.id, title: item.title, module: 'tasks' as const })),
    ...state.ledgerEntries
      .filter((item) => {
        const category = state.ledgerCategories.find((categoryItem) => categoryItem.id === item.categoryId);
        const person = state.ledgerPeople.find((personItem) => personItem.id === item.personId);
        return inRange(item.date) && matches(`${item.memo} ${category?.name ?? ''} ${person?.name ?? ''}`);
      })
      .map((item) => ({ type: '记账', id: item.id, title: `${item.type === 'income' ? '收入' : '支出'} ${item.amount}`, module: 'ledger' as const })),
    ...state.schedules
      .filter((item) => inRange(item.date) && matches(item.title))
      .map((item) => ({ type: '日程', id: item.id, title: item.title, module: 'calendar' as const }))
  ];
}

export function shouldHighlightLimitedTask(task: Task, now = new Date()): boolean {
  if (task.completed || task.type !== 'limited' || !task.dueAt) {
    return false;
  }

  if (!task.remindHoursBefore) {
    return new Date(task.dueAt).getTime() < now.getTime();
  }

  const warnAt = new Date(task.dueAt).getTime() - task.remindHoursBefore * 60 * 60 * 1000;
  return now.getTime() >= warnAt;
}

export function getLedgerEntries(state: AppState, bookId: string | 'all', period?: LedgerPeriod, now = new Date()): LedgerEntry[] {
  const range = period ? getLedgerPeriodRange(period, now) : undefined;
  return state.ledgerEntries
    .filter((entry) => bookId === 'all' || entry.bookId === bookId)
    .filter((entry) => !range || (entry.date.slice(0, 10) >= range.from && entry.date.slice(0, 10) <= range.to))
    .sort((a, b) => b.date.localeCompare(a.date));
}

export function getLedgerPeriodRange(period: LedgerPeriod, now = new Date()) {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  let end = new Date(start);

  if (period === 'week') {
    start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
    end = new Date(start);
    end.setDate(start.getDate() + 6);
  } else if (period === 'month') {
    start.setDate(1);
    end = new Date(start);
    end.setMonth(start.getMonth() + 1, 0);
  } else if (period === 'year') {
    start.setMonth(0, 1);
    end = new Date(start);
    end.setMonth(11, 31);
  }

  return {
    from: toLocalDateKey(start),
    to: toLocalDateKey(end)
  };
}

function toLocalDateKey(date: Date) {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

export function filterLedgerEntries(state: AppState, entries: LedgerEntry[], filters: LedgerEntryFilters): LedgerEntry[] {
  const query = filters.query?.trim().toLowerCase() ?? '';

  return entries.filter((entry) => {
    if (filters.type && filters.type !== 'all' && entry.type !== filters.type) return false;
    if (filters.categoryId && filters.categoryId !== 'all' && entry.categoryId !== filters.categoryId) return false;
    if (filters.from && entry.date.slice(0, 10) < filters.from) return false;
    if (filters.to && entry.date.slice(0, 10) > filters.to) return false;

    if (!query) return true;
    const category = state.ledgerCategories.find((item) => item.id === entry.categoryId);
    const person = state.ledgerPeople.find((item) => item.id === entry.personId);
    return `${entry.memo} ${category?.name ?? ''} ${person?.name ?? ''} ${entry.amount}`.toLowerCase().includes(query);
  });
}

export function summarizeLedger(entries: LedgerEntry[]) {
  const income = entries.filter((entry) => entry.type === 'income').reduce((sum, entry) => sum + entry.amount, 0);
  const expense = entries.filter((entry) => entry.type === 'expense').reduce((sum, entry) => sum + entry.amount, 0);
  return {
    income,
    expense,
    balance: income - expense
  };
}

export function summarizeLedgerByCategory(state: AppState, entries: LedgerEntry[]) {
  const totals = new Map<string, { name: string; icon: string; income: number; expense: number }>();
  for (const entry of entries) {
    const category = state.ledgerCategories.find((item) => item.id === entry.categoryId);
    const key = entry.categoryId;
    const current = totals.get(key) ?? {
      name: category?.name ?? '未分类',
      icon: category?.icon ?? '•',
      income: 0,
      expense: 0
    };
    current[entry.type] += entry.amount;
    totals.set(key, current);
  }

  return [...totals.values()].sort((a, b) => b.income + b.expense - (a.income + a.expense));
}

export function groupLedgerEntriesByDate(entries: LedgerEntry[]) {
  const groups = new Map<string, LedgerEntry[]>();
  for (const entry of entries) {
    const key = entry.date.slice(0, 10);
    groups.set(key, [...(groups.get(key) ?? []), entry]);
  }

  return [...groups.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([date, items]) => ({
      date,
      items,
      income: items.filter((entry) => entry.type === 'income').reduce((sum, entry) => sum + entry.amount, 0),
      expense: items.filter((entry) => entry.type === 'expense').reduce((sum, entry) => sum + entry.amount, 0)
    }));
}

export function getLedgerPeriodLabel(period: LedgerPeriod): string {
  return {
    day: '日汇总',
    week: '周汇总',
    month: '月汇总',
    year: '年汇总'
  }[period];
}

export function getCalendarAgenda(state: AppState, date: string) {
  return [
    ...state.schedules.filter((item) => isScheduleOnDate(item.date, item.repeat, date)).map((item) => ({ type: '特殊日程', title: item.title })),
    ...state.reminders.filter((item) => item.time.slice(0, 10) === date).map((item) => ({ type: '提醒', title: item.memo || '无备注提醒' })),
    ...state.tasks.filter((item) => item.createdAt.slice(0, 10) === date || item.dueAt?.slice(0, 10) === date).map((item) => ({ type: '任务', title: item.title })),
    ...state.notes.filter((item) => item.createdAt.slice(0, 10) === date).map((item) => ({ type: '记事', title: item.body || '空记事' })),
    ...state.privateNotes.filter((item) => item.createdAt.slice(0, 10) === date).map((item) => ({ type: '私人笔记', title: item.title }))
  ];
}

export function getMonthSchedules(state: AppState, now = new Date()): MonthScheduleItem[] {
  return getSchedulesForMonth(state, now);
}

export function getSchedulesForMonth(state: AppState, monthDate = new Date()): MonthScheduleItem[] {
  const firstDay = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
  const dayCount = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0).getDate();
  const dates = Array.from({ length: dayCount }, (_, index) => toLocalDateKey(new Date(firstDay.getFullYear(), firstDay.getMonth(), index + 1)));

  return state.schedules
    .flatMap((schedule) => {
      const date = dates.find((targetDate) => isScheduleOnDate(schedule.date, schedule.repeat, targetDate));
      return date ? [{ id: schedule.id, title: schedule.title, date }] : [];
    })
    .sort((a, b) => a.date.localeCompare(b.date));
}

export function isScheduleOnDate(sourceDate: string, repeat: AppState['schedules'][number]['repeat'], targetDate: string): boolean {
  const source = sourceDate.slice(0, 10);
  if (source === targetDate) return true;
  if (repeat === 'monthlySolar') return source.slice(8, 10) === targetDate.slice(8, 10);
  if (repeat === 'yearlySolar') return source.slice(5, 10) === targetDate.slice(5, 10);
  if (repeat === 'monthlyLunar' || repeat === 'yearlyLunar') {
    const sourceLunar = getLunarParts(new Date(`${source}T00:00:00`));
    const targetLunar = getLunarParts(new Date(`${targetDate}T00:00:00`));
    if (repeat === 'monthlyLunar') return sourceLunar.day === targetLunar.day;
    return sourceLunar.month === targetLunar.month && sourceLunar.day === targetLunar.day;
  }
  return false;
}
