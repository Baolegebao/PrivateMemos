import { describe, expect, it } from 'vitest';
import { buildCloudRecordRows, mergeCloudRecords, decryptCloudSnapshot, encryptCloudSnapshot, getLatestCloudSyncAt, mergeCloudStates, stripCloudRuntimeFields, withCloudDeletionTombstones } from './cloudSync';
import { normalizeState } from './store';

describe('cloud sync encryption', () => {
  it('round-trips app state with the correct passphrase', async () => {
    const state = normalizeState({
      displayName: '同步用户',
      notes: [{ id: 'note_1', body: '加密笔记内容', highlighted: false, createdAt: '2026-07-01T00:00:00.000Z', updatedAt: '2026-07-01T00:00:00.000Z' }]
    });
    const payload = await encryptCloudSnapshot(state, 'correct horse battery staple');
    const restored = await decryptCloudSnapshot(payload, 'correct horse battery staple');

    expect(payload.ciphertext).not.toContain('加密笔记内容');
    expect(restored.displayName).toBe('同步用户');
    expect(restored.notes[0]?.body).toBe('加密笔记内容');
  });

  it('rejects a wrong passphrase', async () => {
    const payload = await encryptCloudSnapshot(normalizeState({ displayName: '同步用户' }), 'right-passphrase');

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

    const rows = await buildCloudRecordRows(state, 'sync_1', 'passphrase');

    expect(rows.some((row) => row.entity === 'notes' && row.record_id === 'note_1')).toBe(true);
    expect(rows.some((row) => row.sync_id === 'sync_1')).toBe(true);
    expect(rows.some((row) => 'user_id' in row)).toBe(false);
    expect(rows.some((row) => row.entity === 'clipboardItems')).toBe(false);
  });

  it('includes focus notes in cloud record rows', async () => {
    const state = normalizeState({
      focusNotes: [{ id: 'focus_1', title: '重点', body: '同步到手机', createdAt: '2026-07-01T00:00:00.000Z', updatedAt: '2026-07-01T00:00:00.000Z' }]
    });

    const rows = await buildCloudRecordRows(state, 'sync_1', 'passphrase');

    expect(rows.some((row) => row.entity === 'focusNotes' && row.record_id === 'focus_1')).toBe(true);
  });

  it('deduplicates record rows before upsert', async () => {
    const state = normalizeState({
      notes: [{ id: 'note_1', body: 'cloud-note', highlighted: false, createdAt: '2026-07-01T00:00:00.000Z', updatedAt: '2026-07-01T00:00:00.000Z' }],
      cloudDeletedRecords: [{ entity: 'notes', recordId: 'note_1', deletedAt: '2026-07-02T00:00:00.000Z' }]
    });

    const rows = await buildCloudRecordRows(state, 'sync_1', 'passphrase');
    const noteRows = rows.filter((row) => row.entity === 'notes' && row.record_id === 'note_1');

    expect(noteRows).toHaveLength(1);
    expect(noteRows[0]?.deleted).toBe(true);
    expect(noteRows[0]?.record_updated_at).toBe('2026-07-02T00:00:00.000Z');
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

  it('applies a cloud deletion tombstone to another device state', () => {
    const note = { id: 'note_1', body: 'delete-me', highlighted: false, createdAt: '2026-07-01T00:00:00.000Z', updatedAt: '2026-07-01T00:00:00.000Z' };
    const current = normalizeState({ notes: [note] });
    const cloud = normalizeState({
      notes: [],
      cloudDeletedRecords: [{ entity: 'notes', recordId: 'note_1', deletedAt: '2026-07-02T00:00:00.000Z' }]
    });

    const merged = mergeCloudStates(current, cloud);

    expect(merged.notes).toEqual([]);
    expect(merged.cloudDeletedRecords).toContainEqual({ entity: 'notes', recordId: 'note_1', deletedAt: '2026-07-02T00:00:00.000Z' });
  });

  it('keeps a newer local note when cloud has an older copy', () => {
    const current = normalizeState({
      notes: [{ id: 'note_1', body: 'local edit', highlighted: false, createdAt: '2026-07-01T00:00:00.000Z', updatedAt: '2026-07-02T00:00:00.000Z' }]
    });
    const cloud = normalizeState({
      notes: [{ id: 'note_1', body: 'old cloud', highlighted: false, createdAt: '2026-07-01T00:00:00.000Z', updatedAt: '2026-07-01T00:00:00.000Z' }]
    });

    const merged = mergeCloudStates(current, cloud);

    expect(merged.notes[0]?.body).toBe('local edit');
  });

  it('applies a newer cloud note over an older local copy', () => {
    const current = normalizeState({
      notes: [{ id: 'note_1', body: 'old local', highlighted: false, createdAt: '2026-07-01T00:00:00.000Z', updatedAt: '2026-07-01T00:00:00.000Z' }]
    });
    const cloud = normalizeState({
      notes: [{ id: 'note_1', body: 'cloud edit', highlighted: false, createdAt: '2026-07-01T00:00:00.000Z', updatedAt: '2026-07-02T00:00:00.000Z' }]
    });

    const merged = mergeCloudStates(current, cloud);

    expect(merged.notes[0]?.body).toBe('cloud edit');
  });

  it('uses the latest pull or upload timestamp as the sync time', () => {
    expect(getLatestCloudSyncAt('2026-07-07T02:23:00.000Z', '2026-07-08T03:30:00.000Z')).toBe('2026-07-08T03:30:00.000Z');
    expect(getLatestCloudSyncAt('2026-07-08T03:30:00.000Z', '2026-07-07T02:23:00.000Z')).toBe('2026-07-08T03:30:00.000Z');
    expect(getLatestCloudSyncAt(undefined, '2026-07-08T03:30:00.000Z')).toBe('2026-07-08T03:30:00.000Z');
  });
});
