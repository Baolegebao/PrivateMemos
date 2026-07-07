import { createClient } from '@supabase/supabase-js';
import { normalizeState } from './store';
import type { AppState, CloudDeletedRecord, DatedEntity } from './types';

const SNAPSHOT_TABLE = 'private_memos_snapshots';
const RECORD_TABLE = 'private_memos_records';
const KDF_ITERATIONS = 210000;

type CloudRecordEntity = CloudDeletedRecord['entity'];
type SyncableRecord = DatedEntity & object;

const RECORD_COLLECTIONS: Array<{ entity: CloudRecordEntity; key: CloudRecordEntity }> = [
  { entity: 'notes', key: 'notes' },
  { entity: 'privateNotes', key: 'privateNotes' },
  { entity: 'focusNotes', key: 'focusNotes' },
  { entity: 'reminders', key: 'reminders' },
  { entity: 'tasks', key: 'tasks' },
  { entity: 'ledgerBooks', key: 'ledgerBooks' },
  { entity: 'ledgerPeople', key: 'ledgerPeople' },
  { entity: 'ledgerCategories', key: 'ledgerCategories' },
  { entity: 'ledgerEntries', key: 'ledgerEntries' },
  { entity: 'schedules', key: 'schedules' },
  { entity: 'countdownTimers', key: 'countdownTimers' }
];

export interface CloudSyncConfig {
  url: string;
  publishableKey: string;
  passphrase: string;
}

export interface CloudSyncResult {
  updatedAt?: string;
}

export interface CloudPullResult extends CloudSyncResult {
  state: AppState;
}

interface EncryptedCloudPayload {
  app: 'private-memos';
  version: 1;
  exportedAt: string;
  algorithm: 'AES-GCM';
  kdf: 'PBKDF2-SHA256';
  iterations: number;
  salt: string;
  iv: string;
  ciphertext: string;
}

interface EncryptedCloudRecordPayload extends EncryptedCloudPayload {
  recordEntity: CloudRecordEntity;
  recordId: string;
}

interface SnapshotRow {
  encrypted_payload: EncryptedCloudPayload;
  updated_at?: string;
}

interface CloudRecordRow {
  sync_id?: string;
  entity: CloudRecordEntity;
  record_id: string;
  encrypted_payload: EncryptedCloudRecordPayload;
  record_updated_at: string;
  deleted: boolean;
  updated_at?: string;
}

function cleanConfig(config: CloudSyncConfig): CloudSyncConfig {
  return {
    url: config.url.trim(),
    publishableKey: config.publishableKey.trim(),
    passphrase: config.passphrase
  };
}

function requireConfig(config: CloudSyncConfig) {
  const clean = cleanConfig(config);
  if (!clean.url || !clean.publishableKey || !clean.passphrase) {
    throw new Error('请填写 Supabase URL、publishable key 和同步口令。');
  }
  return clean;
}

function bytesToBase64(bytes: Uint8Array) {
  const binary = Array.from(bytes, (byte) => String.fromCharCode(byte)).join('');
  if (typeof btoa === 'function') return btoa(binary);
  return (globalThis as unknown as { Buffer: typeof Buffer }).Buffer.from(bytes).toString('base64');
}

function base64ToBytes(value: string) {
  const binary = typeof atob === 'function'
    ? atob(value)
    : (globalThis as unknown as { Buffer: typeof Buffer }).Buffer.from(value, 'base64').toString('binary');
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

async function deriveKey(passphrase: string, salt: Uint8Array, iterations: number) {
  const keyMaterial = await crypto.subtle.importKey('raw', new TextEncoder().encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: toArrayBuffer(salt), iterations, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function getSyncContext(config: CloudSyncConfig) {
  const clean = requireConfig(config);
  const client = createClient(clean.url, clean.publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  return {
    client,
    syncId: await sha256Hex(`private-memos:${clean.passphrase}`),
    config: clean
  };
}

export function stripCloudRuntimeFields(state: AppState): AppState {
  return {
    ...state,
    cloudSyncUrl: '',
    cloudSyncPublishableKey: '',
    cloudSyncEmail: '',
    cloudSyncRememberCredentials: false,
    cloudSyncSavedPassword: '',
    cloudSyncSavedPassphrase: '',
    cloudSyncLastSyncedAt: '',
    cloudSyncLastError: '',
    cloudDeletedRecords: [],
    clipboardItems: [],
    clipboardSaveDirectory: '',
    clipboardLastError: ''
  };
}

function getCollection(state: AppState, key: CloudRecordEntity): SyncableRecord[] {
  return ((state[key] ?? []) as SyncableRecord[]);
}

function getRecordUpdatedAt(record: DatedEntity): string {
  return record.updatedAt || record.createdAt;
}

function latestIso(a?: string, b?: string): string {
  if (!a) return b ?? '';
  if (!b) return a;
  return a > b ? a : b;
}

async function encryptCloudRecord(entity: CloudRecordEntity, recordId: string, record: unknown, updatedAt: string, passphrase: string): Promise<EncryptedCloudRecordPayload> {
  const payload = await encryptJsonPayload({ app: 'private-memos', version: 1, entity, recordId, updatedAt, record }, passphrase);
  return { ...payload, recordEntity: entity, recordId };
}

async function decryptCloudRecord(payload: EncryptedCloudRecordPayload, passphrase: string): Promise<{ entity: CloudRecordEntity; recordId: string; updatedAt: string; record: SyncableRecord | null }> {
  const parsed = await decryptJsonPayload(payload, passphrase);
  return {
    entity: parsed.entity as CloudRecordEntity,
    recordId: String(parsed.recordId),
    updatedAt: String(parsed.updatedAt),
    record: parsed.record as SyncableRecord | null
  };
}

async function encryptJsonPayload(value: unknown, passphrase: string): Promise<EncryptedCloudPayload> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(passphrase, salt, KDF_ITERATIONS);
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: toArrayBuffer(iv) }, key, new TextEncoder().encode(JSON.stringify(value)));
  return {
    app: 'private-memos',
    version: 1,
    exportedAt: new Date().toISOString(),
    algorithm: 'AES-GCM',
    kdf: 'PBKDF2-SHA256',
    iterations: KDF_ITERATIONS,
    salt: bytesToBase64(salt),
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(new Uint8Array(ciphertext))
  };
}

async function decryptJsonPayload<T = Record<string, unknown>>(payload: EncryptedCloudPayload, passphrase: string): Promise<T> {
  const salt = base64ToBytes(payload.salt);
  const iv = base64ToBytes(payload.iv);
  const key = await deriveKey(passphrase, salt, payload.iterations);
  const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: toArrayBuffer(iv) }, key, toArrayBuffer(base64ToBytes(payload.ciphertext)));
  return JSON.parse(new TextDecoder().decode(plaintext)) as T;
}

export async function encryptCloudSnapshot(state: AppState, passphrase: string): Promise<EncryptedCloudPayload> {
  return encryptJsonPayload({
    app: 'private-memos',
    version: 1,
    exportedAt: new Date().toISOString(),
    state: stripCloudRuntimeFields(state)
  }, passphrase);
}

export async function decryptCloudSnapshot(payload: EncryptedCloudPayload, passphrase: string): Promise<AppState> {
  const parsed = await decryptJsonPayload<{ state?: AppState } & Partial<AppState>>(payload, passphrase);
  return normalizeState(parsed.state ?? parsed);
}

export async function uploadCloudSnapshot(config: CloudSyncConfig, state: AppState): Promise<CloudSyncResult> {
  const { client, syncId, config: clean } = await getSyncContext(config);
  const encryptedPayload = await encryptCloudSnapshot(state, clean.passphrase);
  const { data, error } = await client
    .from(SNAPSHOT_TABLE)
    .upsert({ sync_id: syncId, snapshot_version: 1, encrypted_payload: encryptedPayload }, { onConflict: 'sync_id' })
    .select('updated_at')
    .single();
  if (error) throw new Error(error.message);
  return { updatedAt: data?.updated_at };
}

export async function downloadCloudSnapshot(config: CloudSyncConfig): Promise<CloudPullResult> {
  const { client, syncId, config: clean } = await getSyncContext(config);
  const { data, error } = await client
    .from(SNAPSHOT_TABLE)
    .select('encrypted_payload, updated_at')
    .eq('sync_id', syncId)
    .maybeSingle<SnapshotRow>();
  if (error) throw new Error(error.message);
  if (!data) throw new Error('云端还没有可恢复的数据快照。');
  return {
    state: await decryptCloudSnapshot(data.encrypted_payload, clean.passphrase),
    updatedAt: data.updated_at
  };
}

export function getCloudRecordIds(state: AppState): Record<CloudRecordEntity, Set<string>> {
  return RECORD_COLLECTIONS.reduce((result, { entity, key }) => {
    result[entity] = new Set(getCollection(state, key).map((record) => record.id));
    return result;
  }, {} as Record<CloudRecordEntity, Set<string>>);
}

export function withCloudDeletionTombstones(previous: AppState, next: AppState, deletedAt = new Date().toISOString()): AppState {
  const previousIds = getCloudRecordIds(previous);
  const nextIds = getCloudRecordIds(next);
  const existing = new Set((next.cloudDeletedRecords ?? []).map((item) => `${item.entity}:${item.recordId}`));
  const deleted: CloudDeletedRecord[] = [];

  RECORD_COLLECTIONS.forEach(({ entity }) => {
    previousIds[entity].forEach((recordId) => {
      if (!nextIds[entity].has(recordId) && !existing.has(`${entity}:${recordId}`)) {
        deleted.push({ entity, recordId, deletedAt });
      }
    });
  });

  return deleted.length > 0 ? { ...next, cloudDeletedRecords: [...(next.cloudDeletedRecords ?? []), ...deleted] } : next;
}

export async function buildCloudRecordRows(state: AppState, syncId: string, passphrase: string): Promise<Array<Record<string, unknown>>> {
  const rows: Array<Record<string, unknown>> = [];

  for (const { entity, key } of RECORD_COLLECTIONS) {
    for (const record of getCollection(state, key)) {
      const updatedAt = getRecordUpdatedAt(record);
      rows.push({
        sync_id: syncId,
        entity,
        record_id: record.id,
        encrypted_payload: await encryptCloudRecord(entity, record.id, record, updatedAt, passphrase),
        record_updated_at: updatedAt,
        deleted: false
      });
    }
  }

  for (const deleted of state.cloudDeletedRecords ?? []) {
    rows.push({
      sync_id: syncId,
      entity: deleted.entity,
      record_id: deleted.recordId,
      encrypted_payload: await encryptCloudRecord(deleted.entity, deleted.recordId, null, deleted.deletedAt, passphrase),
      record_updated_at: deleted.deletedAt,
      deleted: true
    });
  }

  return rows;
}

export async function uploadCloudRecords(config: CloudSyncConfig, state: AppState): Promise<CloudSyncResult> {
  const { client, syncId, config: clean } = await getSyncContext(config);
  const rows = await buildCloudRecordRows(state, syncId, clean.passphrase);
  if (rows.length === 0) return { updatedAt: new Date().toISOString() };

  const { data, error } = await client
    .from(RECORD_TABLE)
    .upsert(rows, { onConflict: 'sync_id,entity,record_id' })
    .select('updated_at')
    .order('updated_at', { ascending: false })
    .limit(1);
  if (error) throw new Error(error.message);
  return { updatedAt: data?.[0]?.updated_at ?? new Date().toISOString() };
}

export async function downloadCloudRecords(config: CloudSyncConfig): Promise<CloudPullResult> {
  const { rows, updatedAt } = await downloadCloudRecordRows(config);
  return {
    state: mergeCloudRecords(emptyCloudState(), rows),
    updatedAt
  };
}

export async function pullCloudRecords(config: CloudSyncConfig, state: AppState): Promise<CloudPullResult> {
  const { rows, updatedAt } = await downloadCloudRecordRows(config);
  return {
    state: mergeCloudRecords(state, rows),
    updatedAt
  };
}

async function downloadCloudRecordRows(config: CloudSyncConfig): Promise<{
  rows: Array<{ entity: CloudRecordEntity; recordId: string; recordUpdatedAt: string; deleted: boolean; record: SyncableRecord | null }>;
  updatedAt?: string;
}> {
  const { client, syncId, config: clean } = await getSyncContext(config);
  const { data, error } = await client
    .from(RECORD_TABLE)
    .select('entity, record_id, encrypted_payload, record_updated_at, deleted, updated_at')
    .eq('sync_id', syncId)
    .order('record_updated_at', { ascending: true });
  if (error) throw new Error(error.message);

  const rows = (data ?? []) as CloudRecordRow[];
  const records = await Promise.all(rows.map(async (row) => ({
    ...row,
    decrypted: await decryptCloudRecord(row.encrypted_payload, clean.passphrase)
  })));

  return {
    rows: records.map((row) => ({
      entity: row.entity,
      recordId: row.record_id,
      recordUpdatedAt: row.record_updated_at,
      deleted: row.deleted,
      record: row.decrypted.record
    })),
    updatedAt: rows.reduce((max, row) => latestIso(max, row.updated_at), '')
  };
}

function emptyCloudState(): AppState {
  const base = normalizeState({
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
    countdownTimers: []
  });
  return {
    ...base,
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
    countdownTimers: []
  };
}

export function mergeCloudRecords(
  baseState: AppState,
  rows: Array<{ entity: CloudRecordEntity; recordId: string; recordUpdatedAt: string; deleted: boolean; record: SyncableRecord | null }>
): AppState {
  let next = normalizeState(baseState);
  const tombstones = [...(next.cloudDeletedRecords ?? [])];

  for (const { entity, recordId, recordUpdatedAt, deleted, record } of rows) {
    const currentRecords = getCollection(next, entity);
    const currentRecord = currentRecords.find((item) => item.id === recordId);
    const localUpdatedAt = currentRecord ? getRecordUpdatedAt(currentRecord) : '';
    const localDeletedAt = tombstones.find((item) => item.entity === entity && item.recordId === recordId)?.deletedAt ?? '';
    const localClock = latestIso(localUpdatedAt, localDeletedAt);
    if (localClock && localClock > recordUpdatedAt) continue;

    if (deleted) {
      next = { ...next, [entity]: currentRecords.filter((item) => item.id !== recordId) };
      if (!tombstones.some((item) => item.entity === entity && item.recordId === recordId)) {
        tombstones.push({ entity, recordId, deletedAt: recordUpdatedAt });
      }
      continue;
    }

    if (!record) continue;
    const withoutCurrent = currentRecords.filter((item) => item.id !== recordId);
    next = { ...next, [entity]: [...withoutCurrent, record].sort((a, b) => getRecordUpdatedAt(b).localeCompare(getRecordUpdatedAt(a))) };
  }

  return normalizeState({ ...next, cloudDeletedRecords: tombstones });
}

export function mergeCloudStates(baseState: AppState, cloudState: AppState): AppState {
  const rows = RECORD_COLLECTIONS.flatMap(({ entity, key }) => (
    getCollection(cloudState, key).map((record) => ({
      entity,
      recordId: record.id,
      recordUpdatedAt: getRecordUpdatedAt(record),
      deleted: false,
      record
    }))
  ));
  const deletions = (cloudState.cloudDeletedRecords ?? []).map((deleted) => ({
    entity: deleted.entity,
    recordId: deleted.recordId,
    recordUpdatedAt: deleted.deletedAt,
    deleted: true,
    record: null
  }));
  return mergeCloudRecords(baseState, [...rows, ...deletions]);
}

export function getLatestCloudSyncAt(pullUpdatedAt?: string, uploadUpdatedAt?: string) {
  return latestIso(pullUpdatedAt, uploadUpdatedAt) || undefined;
}

export async function syncCloudRecords(config: CloudSyncConfig, state: AppState): Promise<CloudPullResult> {
  const pullResult = await downloadCloudRecordRows(config);
  const mergedState = mergeCloudRecords(state, pullResult.rows);
  const uploadResult = await uploadCloudRecords(config, mergedState);
  return {
    state: mergedState,
    updatedAt: getLatestCloudSyncAt(pullResult.updatedAt, uploadResult.updatedAt)
  };
}
