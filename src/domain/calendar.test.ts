import { describe, expect, it } from 'vitest';
import { formatLunarDate, getLunarParts, toLocalDateKey } from './date';
import { isScheduleOnDate } from './selectors';

describe('calendar recurrence', () => {
  it('formats visible lunar dates through Intl', () => {
    expect(formatLunarDate(new Date('2026-07-01T00:00:00'))).toBe('\u4e94\u6708\u5341\u4e03');
    expect(formatLunarDate(new Date('2026-07-07T00:00:00'))).toBe('\u5c0f\u6691');
  });

  it('extracts lunar date parts through Intl', () => {
    expect(getLunarParts(new Date('2026-07-01T00:00:00'))).toMatchObject({ month: '\u4e94\u6708', day: '17' });
  });

  it('shows non-repeating schedules only on the source date', () => {
    expect(isScheduleOnDate('2026-07-01T00:00:00.000Z', 'none', '2026-07-01')).toBe(true);
    expect(isScheduleOnDate('2026-07-01T00:00:00.000Z', 'none', '2026-07-02')).toBe(false);
  });

  it('keeps calendar cell dates in local date keys', () => {
    expect(toLocalDateKey(new Date(2026, 7, 6))).toBe('2026-08-06');
  });

  it('shows monthly solar schedules on the same day of month', () => {
    expect(isScheduleOnDate('2026-07-15T00:00:00.000Z', 'monthlySolar', '2026-08-15')).toBe(true);
    expect(isScheduleOnDate('2026-07-15T00:00:00.000Z', 'monthlySolar', '2026-08-16')).toBe(false);
  });

  it('shows yearly solar schedules on the same month and day', () => {
    expect(isScheduleOnDate('2026-07-15T00:00:00.000Z', 'yearlySolar', '2027-07-15')).toBe(true);
    expect(isScheduleOnDate('2026-07-15T00:00:00.000Z', 'yearlySolar', '2027-07-16')).toBe(false);
  });

  it('shows monthly lunar schedules on the same lunar day', () => {
    expect(isScheduleOnDate('2026-07-01T00:00:00.000Z', 'monthlyLunar', '2026-07-30')).toBe(true);
    expect(isScheduleOnDate('2026-07-01T00:00:00.000Z', 'monthlyLunar', '2026-07-31')).toBe(false);
  });

  it('shows yearly lunar schedules on the same lunar month and day', () => {
    expect(isScheduleOnDate('2026-07-01T00:00:00.000Z', 'yearlyLunar', '2027-06-21')).toBe(true);
    expect(isScheduleOnDate('2026-07-01T00:00:00.000Z', 'yearlyLunar', '2027-06-22')).toBe(false);
  });
});
