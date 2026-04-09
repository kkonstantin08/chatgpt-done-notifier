import { DEFAULT_SETTINGS, SETTINGS_STORAGE_KEY } from '../shared/constants';
import type { ExtensionSettings } from '../shared/types';
import { clone, isNowWithinTimeRange } from '../shared/utils';

export async function getSettings(): Promise<ExtensionSettings> {
  const stored = await chrome.storage.local.get(SETTINGS_STORAGE_KEY);
  const storedSettings = stored[SETTINGS_STORAGE_KEY] as Partial<ExtensionSettings> | undefined;

  return {
    ...clone(DEFAULT_SETTINGS),
    ...storedSettings,
    quietHours: {
      ...clone(DEFAULT_SETTINGS.quietHours),
      ...(storedSettings?.quietHours ?? {})
    }
  };
}

export async function saveSettings(settings: ExtensionSettings): Promise<ExtensionSettings> {
  await chrome.storage.local.set({
    [SETTINGS_STORAGE_KEY]: settings
  });

  return settings;
}

export async function resetSettings(): Promise<ExtensionSettings> {
  const defaults = clone(DEFAULT_SETTINGS);
  await chrome.storage.local.set({
    [SETTINGS_STORAGE_KEY]: defaults
  });
  return defaults;
}

export function isQuietHoursActive(settings: ExtensionSettings, date = new Date()): boolean {
  if (!settings.quietHours.enabled) {
    return false;
  }

  return isNowWithinTimeRange(settings.quietHours.start, settings.quietHours.end, date);
}
