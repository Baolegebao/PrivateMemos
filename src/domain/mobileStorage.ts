import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';
import { normalizeState } from './store';
import type { AppState } from './types';

const STORAGE_KEY = 'personal-assistant-ai-state-v1';

export function isMobileApp() {
  return Capacitor.isNativePlatform();
}

export async function loadMobileState(): Promise<AppState | undefined> {
  const result = await Preferences.get({ key: STORAGE_KEY });
  return result.value ? normalizeState(JSON.parse(result.value)) : undefined;
}

export async function saveMobileState(state: AppState): Promise<void> {
  await Preferences.set({ key: STORAGE_KEY, value: JSON.stringify(state) });
}
