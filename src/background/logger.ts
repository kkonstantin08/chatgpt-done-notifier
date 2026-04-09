import { DEBUG_LOGS_STORAGE_KEY, DEFAULT_SETTINGS, MAX_DEBUG_LOG_ENTRIES, SETTINGS_STORAGE_KEY } from '../shared/constants';
import type { DebugLogEntry, DebugLogLevel, DebugLogSource, ExtensionSettings } from '../shared/types';
import { generateId } from '../shared/utils';

async function isLoggingEnabled(): Promise<boolean> {
  const stored = await chrome.storage.local.get(SETTINGS_STORAGE_KEY);
  const settings = stored[SETTINGS_STORAGE_KEY] as Partial<ExtensionSettings> | undefined;
  return settings?.debugLoggingEnabled ?? DEFAULT_SETTINGS.debugLoggingEnabled;
}

export async function getLogs(): Promise<DebugLogEntry[]> {
  const stored = await chrome.storage.local.get(DEBUG_LOGS_STORAGE_KEY);
  return (stored[DEBUG_LOGS_STORAGE_KEY] as DebugLogEntry[] | undefined) ?? [];
}

export async function clearLogs(): Promise<void> {
  await chrome.storage.local.set({
    [DEBUG_LOGS_STORAGE_KEY]: []
  });
}

export async function appendLog(
  source: DebugLogSource,
  level: DebugLogLevel,
  event: string,
  details?: string,
  force = false
): Promise<void> {
  if (!force && !(await isLoggingEnabled())) {
    return;
  }

  const logs = await getLogs();
  logs.push({
    id: generateId('log'),
    timestamp: Date.now(),
    source,
    level,
    event,
    details
  });

  await chrome.storage.local.set({
    [DEBUG_LOGS_STORAGE_KEY]: logs.slice(-MAX_DEBUG_LOG_ENTRIES)
  });
}
