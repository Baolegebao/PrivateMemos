import { afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const testDataDirectory = path.join(os.tmpdir(), 'private-memos-data-store-test');

vi.mock('electron', () => ({
  app: {
    isPackaged: false,
    getPath: (name: string) => name === 'userData'
      ? path.join(os.tmpdir(), 'personal-assistant-ai-test')
      : process.execPath,
  }
}));

afterEach(async () => {
  await fs.rm(path.join(os.tmpdir(), 'personal-assistant-ai-test'), { recursive: true, force: true });
  await fs.rm(testDataDirectory, { recursive: true, force: true });
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('data store', () => {
  it('saves and loads app data as json text', async () => {
    vi.stubEnv('PRIVATE_MEMOS_DATA_DIR', testDataDirectory);
    const { getDataStoreStatus, loadAppData, saveAppData } = await import('./dataStore.js');
    const payload = JSON.stringify({ notes: [{ body: 'saved' }] });

    expect(await loadAppData()).toBeNull();
    const saved = await saveAppData(payload);

    expect(saved.exists).toBe(true);
    expect(saved.path.endsWith('assistant-data.json')).toBe(true);
    expect(await loadAppData()).toBe(payload);
    expect(await getDataStoreStatus()).toMatchObject({ exists: true });
  });

  it('can move the app data file to a selected directory', async () => {
    vi.stubEnv('PRIVATE_MEMOS_DATA_DIR', testDataDirectory);
    const selectedDirectory = path.join(os.tmpdir(), 'private-memos-selected-data');
    const { clearDataStoreDirectory, loadAppData, setDataStoreDirectory } = await import('./dataStore.js');

    const status = await setDataStoreDirectory(selectedDirectory, '{"moved":true}');

    expect(status.path).toBe(path.join(selectedDirectory, 'assistant-data.json'));
    expect(await loadAppData()).toBe('{"moved":true}');
    await clearDataStoreDirectory('{"default":true}');
    await fs.rm(selectedDirectory, { recursive: true, force: true });
  });
});
