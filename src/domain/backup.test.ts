import { describe, expect, it } from 'vitest';
import { buildStateBackup, parseStateBackup } from './backup';
import type { AppState } from './types';

describe('state backup', () => {
  it('exports and imports normalized app state', () => {
    const state = baseState();
    const parsed = parseStateBackup(buildStateBackup(state));

    expect(parsed.displayName).toBe('test');
    expect(parsed.syncConflicts).toEqual([]);
    expect(parsed.ledgerCategories.length).toBeGreaterThan(0);
  });

  it('does not export local cloud credentials', () => {
    const backup = buildStateBackup({
      ...baseState(),
      cloudSyncRememberCredentials: true,
      cloudSyncSavedPassword: 'local-password',
      cloudSyncSavedPassphrase: 'local-passphrase'
    });

    expect(backup).not.toContain('local-password');
    expect(backup).not.toContain('local-passphrase');
    expect(parseStateBackup(backup).cloudSyncRememberCredentials).toBe(false);
  });

  it('imports legacy raw state objects', () => {
    const parsed = parseStateBackup(JSON.stringify({ displayName: 'legacy', notes: [] }));

    expect(parsed.displayName).toBe('legacy');
    expect(parsed.syncQueue).toEqual([]);
  });

  it('rejects invalid payload shapes', () => {
    expect(() => parseStateBackup('[]')).toThrow('Invalid backup payload');
    expect(() => parseStateBackup('"bad"')).toThrow('Invalid backup payload');
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
    ledgerBooks: [],
    ledgerPeople: [],
    ledgerCategories: [],
    ledgerEntries: [],
    schedules: [],
    syncQueue: [],
    syncConflicts: []
  };
}
