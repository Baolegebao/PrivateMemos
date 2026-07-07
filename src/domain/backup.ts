import { normalizeState } from './store';
import type { AppState } from './types';

export function buildStateBackup(state: AppState) {
  return JSON.stringify(
    {
      app: 'private-memos',
      version: 1,
      exportedAt: new Date().toISOString(),
      state
    },
    null,
    2
  );
}

export function parseStateBackup(raw: string): AppState {
  const parsed = JSON.parse(raw);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Invalid backup payload');
  }
  return normalizeState(parsed.state ?? parsed);
}
