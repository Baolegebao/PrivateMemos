import type { CalendarBucket, DatedEntity, ViewMode } from './types';

export function todayIso(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export function toDateKey(value: string): string {
  return value.slice(0, 10);
}

export function formatDateTime(value: string): string {
  const date = new Date(value);
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date);
}

export function formatLunarDate(value: Date): string {
  const term = getSolarTerm(value);
  if (term) return term;
  const lunar = getLunarParts(value);
  const day = Number(lunar.day);
  const dayName = LUNAR_DAY_NAMES[day - 1];
  if (dayName) return `${lunar.month}${dayName}`;
  return new Intl.DateTimeFormat('zh-CN-u-ca-chinese', {
    month: 'short',
    day: 'numeric'
  }).format(value);
}

export function getLunarParts(value: Date) {
  const parts = new Intl.DateTimeFormat('zh-CN-u-ca-chinese', {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric'
  }).formatToParts(value);

  return {
    year: parts.find((part) => String(part.type) === 'relatedYear')?.value ?? '',
    month: parts.find((part) => part.type === 'month')?.value ?? '',
    day: parts.find((part) => part.type === 'day')?.value ?? ''
  };
}

export function groupByDate<T extends DatedEntity>(items: T[]): CalendarBucket<T>[] {
  return groupByKey(items, (item) => toDateKey(item.createdAt));
}

export function groupByView<T extends DatedEntity>(items: T[], view: Exclude<ViewMode, 'list'>): CalendarBucket<T>[] {
  if (view === 'month') {
    return groupByKey(items, (item) => toDateKey(item.createdAt).slice(0, 7));
  }

  return groupByKey(items, (item) => `${toLocalDateKey(getWeekStart(new Date(item.createdAt)))} 周`);
}

function groupByKey<T extends DatedEntity>(items: T[], keyOf: (item: T) => string): CalendarBucket<T>[] {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key = keyOf(item);
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }

  return [...groups.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([date, groupedItems]) => ({ date, items: groupedItems }));
}

function getWeekStart(date: Date) {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  return start;
}

export function toLocalDateKey(date: Date) {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

export function isToday(value: string, now = new Date()): boolean {
  return toDateKey(value) === todayIso(now);
}

export function isYesterday(value: string, now = new Date()): boolean {
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  return toDateKey(value) === todayIso(yesterday);
}

const LUNAR_DAY_NAMES = [
  '初一',
  '初二',
  '初三',
  '初四',
  '初五',
  '初六',
  '初七',
  '初八',
  '初九',
  '初十',
  '十一',
  '十二',
  '十三',
  '十四',
  '十五',
  '十六',
  '十七',
  '十八',
  '十九',
  '二十',
  '廿一',
  '廿二',
  '廿三',
  '廿四',
  '廿五',
  '廿六',
  '廿七',
  '廿八',
  '廿九',
  '三十'
];

const SOLAR_TERM_INFO: Array<[string, number]> = [
  ['小寒', 0],
  ['大寒', 21208],
  ['立春', 42467],
  ['雨水', 63836],
  ['惊蛰', 85337],
  ['春分', 107014],
  ['清明', 128867],
  ['谷雨', 150921],
  ['立夏', 173149],
  ['小满', 195551],
  ['芒种', 218072],
  ['夏至', 240693],
  ['小暑', 263343],
  ['大暑', 285989],
  ['立秋', 308563],
  ['处暑', 331033],
  ['白露', 353350],
  ['秋分', 375494],
  ['寒露', 397447],
  ['霜降', 419210],
  ['立冬', 440795],
  ['小雪', 462224],
  ['大雪', 483532],
  ['冬至', 504758]
];

function getSolarTerm(value: Date): string {
  const year = value.getFullYear();
  if (year < 1900 || year > 2100) return '';
  const dayKey = toLocalDateKey(value);
  const match = SOLAR_TERM_INFO.find(([, minutes]) => {
    const termDate = new Date(31556925974.7 * (year - 1900) + minutes * 60000 + Date.UTC(1900, 0, 6, 2, 5));
    return toLocalDateKey(termDate) === dayKey;
  });
  return match?.[0] ?? '';
}
