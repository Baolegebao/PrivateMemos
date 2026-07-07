import { describe, expect, it } from 'vitest';
import { buildCloudRecordRows, mergeCloudRecords, decryptCloudSnapshot, encryptCloudSnapshot, stripCloudRuntimeFields, withCloudDeletionTombstones } from './cloudSync';
import { normalizeState } from './store';

describe('cloud sync encryption', () => {
  it('round-trips app state with the correct passphrase', async () => {
    const state = normalizeState({
      displayName: 'cloud-test',
      notes: [{ id: 'note_1', body: 'cloud-secret-note', highlighted: false, createdAt: '2026-07-01T00:00:00.000Z', updatedAt: '2026-07-01T00:00:00.000Z' }]
    });
    const payload = await encryptCloudSnapshot(state, 'correct horse battery staple');
    const restored = await decryptCloudSnapshot(payload, 'correct horse battery staple');

    expect(payload.ciphertext).not.toContain('cloud-secret-note');
    expect(restored.displayName).toBe('cloud-test');
    expect(restored.notes[0]?.body).toBe('cloud-secret-note');
  });

  it('rejects a wrong passphrase', async () => {
    const payload = await encryptCloudSnapshot(normalizeState({ displayName: 'cloud-test' }), 'right-passphrase');

    await expect(decryptCloudSnapshot(payload, 'wrong-passphrase')).rejects.toThrow();
  });

  it('keeps clipboard data out of cloud snapshots', () => {
    const state = normalizeState({
      clipboardItems: [{ id: 'clip_1', type: 'text', content: 'local-only', signature: 'text:1', createdAt: '2026-07-01T00:00:00.000Z', updatedAt: '2026-07-01T00:00:00.000Z' }],
      clipboardSaveDirectory: 'D:/Private Memos Clipboard',
      clipboardLastError: 'local error'
    });

    const stripped = stripCloudRuntimeFields(state);

    expect(stripped.clipboardItems).toEqual([]);
    expect(stripped.clipboardSaveDirectory).toBe('');
    expect(stripped.clipboardLastError).toBe('');
  });

  it('keeps clipboard data out of cloud record rows', async () => {
    const state = normalizeState({
      notes: [{ id: 'note_1', body: 'cloud-note', highlighted: false, createdAt: '2026-07-01T00:00:00.000Z', updatedAt: '2026-07-01T00:00:00.000Z' }],
      clipboardItems: [{ id: 'clip_1', type: 'text', content: 'local-only', signature: 'text:1', createdAt: '2026-07-01T00:00:00.000Z', updatedAt: '2026-07-01T00:00:00.000Z' }]
    });

    const rows = await buildCloudRecordRows(state, 'user_1', 'passphrase');

    expect(rows.some((row) => row.entity === 'notes' && row.record_id === 'note_1')).toBe(true);
    expect(rows.some((row) => row.entity === 'clipboardItems')).toBe(false);
  });

  it('records and applies cloud deletion tombstones', () => {
    const note = { id: 'note_1', body: 'delete-me', highlighted: false, createdAt: '2026-07-01T00:00:00.000Z', updatedAt: '2026-07-01T00:00:00.000Z' };
    const before = normalizeState({ notes: [note] });
    const after = withCloudDeletionTombstones(before, normalizeState({ ...before, notes: [] }), '2026-07-02T00:00:00.000Z');

    const merged = mergeCloudRecords(normalizeState({ notes: [note] }), [{
      entity: 'notes',
      recordId: 'note_1',
      recordUpdatedAt: '2026-07-02T00:00:00.000Z',
      deleted: true,
      record: null
    }]);

    expect(after.cloudDeletedRecords).toContainEqual({ entity: 'notes', recordId: 'note_1', deletedAt: '2026-07-02T00:00:00.000Z' });
    expect(merged.notes).toEqual([]);
  });
});
