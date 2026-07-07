import { describe, expect, it } from 'vitest';
import { groupByView } from './date';
import type { DatedEntity } from './types';

describe('date grouping', () => {
  it('groups dated entities by week start', () => {
    expect(groupByView([entity('a', '2026-07-01'), entity('b', '2026-07-05'), entity('c', '2026-07-06')], 'week').map((bucket) => [bucket.date, bucket.items.length])).toEqual([
      ['2026-07-06 周', 1],
      ['2026-06-29 周', 2]
    ]);
  });

  it('groups dated entities by month', () => {
    expect(groupByView([entity('a', '2026-07-01'), entity('b', '2026-07-20'), entity('c', '2026-08-01')], 'month').map((bucket) => [bucket.date, bucket.items.length])).toEqual([
      ['2026-08', 1],
      ['2026-07', 2]
    ]);
  });
});

function entity(id: string, date: string): DatedEntity {
  return {
    id,
    createdAt: `${date}T00:00:00.000Z`,
    updatedAt: `${date}T00:00:00.000Z`
  };
}
