import { describe, expect, it } from 'vitest';
import { buildLedgerTypePatch, canDeleteLedgerBook } from './ledger';
import type { AppState } from './types';

describe('ledger helpers', () => {
  it('allows deleting an empty extra book', () => {
    expect(canDeleteLedgerBook(baseState(), 'b2')).toEqual({ ok: true });
  });

  it('prevents deleting the only book but allows deleting a book with entries', () => {
    expect(canDeleteLedgerBook({ ...baseState(), ledgerBooks: [book('b1')] }, 'b1')).toEqual({ ok: false, reason: '至少保留一个账本' });
    expect(canDeleteLedgerBook({ ...baseState(), ledgerEntries: [entry('e1', 'b2')] }, 'b2')).toEqual({ ok: true });
  });
  it('switches to a category that matches the selected entry type', () => {
    const state = {
      ...baseState(),
      ledgerCategories: [
        category('expense-1', 'expense'),
        category('income-1', 'income')
      ]
    };

    expect(buildLedgerTypePatch(state, entry('e1', 'b1'), 'income')).toEqual({ type: 'income', categoryId: 'income-1' });
  });
});

function baseState(): AppState {
  return {
    displayName: 'test',
    theme: 'system',
    fontScale: 1,
    notes: [],
    privateNotes: [],
    focusNotes: [],
    reminders: [],
    tasks: [],
    ledgerBooks: [book('b1'), book('b2')],
    ledgerPeople: [],
    ledgerCategories: [],
    ledgerEntries: [],
    schedules: [],
    syncQueue: [],
    syncConflicts: []
  };
}

function book(id: string) {
  return { id, name: id, createdAt: '2026-07-01T00:00:00.000Z', updatedAt: '2026-07-01T00:00:00.000Z' };
}

function entry(id: string, bookId: string) {
  return { id, bookId, personId: 'p1', categoryId: 'c1', type: 'expense' as const, amount: 1, date: '2026-07-01T00:00:00.000Z', memo: '', createdAt: '2026-07-01T00:00:00.000Z', updatedAt: '2026-07-01T00:00:00.000Z' };
}

function category(id: string, type: 'income' | 'expense') {
  return { id, name: id, icon: 'settings', type, createdAt: '2026-07-01T00:00:00.000Z', updatedAt: '2026-07-01T00:00:00.000Z' };
}
