import type { AppState, LedgerEntry, LedgerEntryType } from './types';

export function canDeleteLedgerBook(state: AppState, bookId: string) {
  if (!state.ledgerBooks.some((book) => book.id === bookId)) {
    return { ok: false, reason: '账本不存在' };
  }
  if (state.ledgerBooks.length <= 1) {
    return { ok: false, reason: '至少保留一个账本' };
  }
  return { ok: true };
}

export function buildLedgerTypePatch(state: AppState, entry: LedgerEntry, type: LedgerEntryType): Pick<LedgerEntry, 'type' | 'categoryId'> {
  return {
    type,
    categoryId: state.ledgerCategories.find((category) => category.type === type)?.id ?? entry.categoryId
  };
}
