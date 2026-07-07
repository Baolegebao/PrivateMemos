import fs from 'node:fs/promises';
import path from 'node:path';
import { app } from 'electron';

const fileName = 'assistant-data.json';
const configName = 'data-store-config.json';

export interface DataStoreStatus {
  path: string;
  exists: boolean;
  directory: string;
  defaultDirectory: string;
  customDirectory?: string;
}

export async function loadAppData(): Promise<string | null> {
  const filePath = await getDataPath();
  try {
    return await fs.readFile(filePath, 'utf8');
  } catch (error: unknown) {
    if (isMissingFile(error)) {
      return loadLegacyData(filePath);
    }
    throw error;
  }
}

export async function saveAppData(payload: string): Promise<DataStoreStatus> {
  const filePath = await getDataPath();
  await writePayload(filePath, payload);
  return getDataStoreStatus(true);
}

export async function getDataStoreStatus(forceExists?: boolean): Promise<DataStoreStatus> {
  const config = await readConfig();
  const defaultDirectory = getDefaultDataDirectory();
  const directory = config.directory || defaultDirectory;
  const filePath = path.join(directory, fileName);
  const base = config.directory
    ? { path: filePath, directory, defaultDirectory, customDirectory: config.directory }
    : { path: filePath, directory, defaultDirectory };
  if (forceExists !== undefined) {
    return { ...base, exists: forceExists };
  }

  try {
    await fs.access(filePath);
    return { ...base, exists: true };
  } catch (error: unknown) {
    if (isMissingFile(error)) {
      return { ...base, exists: false };
    }
    throw error;
  }
}

export async function setDataStoreDirectory(directory: string, payload?: string): Promise<DataStoreStatus> {
  const cleanDirectory = directory.trim();
  if (!cleanDirectory) throw new Error('Data directory is required.');
  await saveConfig({ directory: cleanDirectory });
  if (payload !== undefined) {
    await writePayload(path.join(cleanDirectory, fileName), payload);
    return getDataStoreStatus(true);
  }
  return getDataStoreStatus();
}

export async function clearDataStoreDirectory(payload?: string): Promise<DataStoreStatus> {
  await saveConfig({});
  if (payload !== undefined) {
    await writePayload(await getDataPath(), payload);
    return getDataStoreStatus(true);
  }
  return getDataStoreStatus();
}

async function getDataPath() {
  const config = await readConfig();
  return path.join(config.directory || getDefaultDataDirectory(), fileName);
}

function getDefaultDataDirectory() {
  if (process.env.PRIVATE_MEMOS_DATA_DIR) return process.env.PRIVATE_MEMOS_DATA_DIR;
  const baseDirectory = app.isPackaged ? path.dirname(app.getPath('exe')) : process.cwd();
  return path.join(baseDirectory, 'Private Memos Data');
}

function getLegacyDataPath() {
  return path.join(app.getPath('userData'), fileName);
}

function getConfigPath() {
  return path.join(getDefaultDataDirectory(), configName);
}

async function readConfig(): Promise<{ directory?: string }> {
  try {
    const parsed = JSON.parse(await fs.readFile(getConfigPath(), 'utf8'));
    const directory = typeof parsed.directory === 'string' ? parsed.directory.trim() : '';
    return directory ? { directory } : {};
  } catch (error: unknown) {
    if (isMissingFile(error)) return {};
    return {};
  }
}

async function saveConfig(config: { directory?: string }) {
  const filePath = getConfigPath();
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(config, null, 2), 'utf8');
}

async function loadLegacyData(activePath: string) {
  const legacyPath = getLegacyDataPath();
  if (legacyPath === activePath) return null;
  try {
    return await fs.readFile(legacyPath, 'utf8');
  } catch (error: unknown) {
    if (isMissingFile(error)) return null;
    throw error;
  }
}

async function writePayload(filePath: string, payload: string) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, payload, 'utf8');
}

function isMissingFile(error: unknown) {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';
}
