import type { ExtensionSettings, GenerationCycleSnapshot } from './types';

export const CHATGPT_MATCH_PATTERNS = [
  'https://chatgpt.com/*',
  'https://chat.openai.com/*'
] as const;

export const CHATGPT_HOME_URL = 'https://chatgpt.com/';
export const SETTINGS_STORAGE_KEY = 'settings';
export const RUNTIME_SESSIONS_STORAGE_KEY = 'runtimeSessions';
export const DEBUG_LOGS_STORAGE_KEY = 'debugLogs';

export const COMPLETION_STABILIZATION_MS = 1400;
export const ACTIVE_POLL_INTERVAL_MS = 500;
export const STREAMING_IDLE_GRACE_MS = 900;
export const MANUAL_STOP_GRACE_MS = 3000;
export const RUNTIME_STALE_MS = 1000 * 60 * 60 * 12;
export const MAX_DEBUG_LOG_ENTRIES = 250;

export const NOTIFICATION_ID_PREFIX = 'chatgpt-done';
export const NOTIFICATION_TITLE = 'ChatGPT finished responding';
export const NOTIFICATION_MESSAGE = 'Click to return to ChatGPT.';
export const TEST_NOTIFICATION_TITLE = 'ChatGPT Done Notifier test';
export const TEST_NOTIFICATION_MESSAGE = 'Your notification settings are working.';

export const OFFSCREEN_DOCUMENT_PATH = 'src/offscreen/offscreen.html';
export const SOUND_ASSET_PATH = 'src/assets/sounds/notification.wav';
export const ICON_PATH = 'src/assets/icons/icon128.png';
export const MAX_CUSTOM_SOUND_BYTES = 1024 * 1024;

export const STOP_BUTTON_TOKENS = [
  'stop generating',
  'stop streaming',
  'stop'
] as const;

export const STOP_BUTTON_DATA_TOKENS = ['stop', 'composer-stop', 'stop-button'] as const;

export const ERROR_TEXT_TOKENS = [
  'something went wrong',
  'there was an error generating a response',
  'an error occurred',
  'network error',
  'unable to load conversation',
  'failed to get service status'
] as const;

export const DEFAULT_SETTINGS: ExtensionSettings = {
  enabled: true,
  notificationMode: 'desktop_sound',
  quietHours: {
    enabled: false,
    start: '22:00',
    end: '07:00'
  },
  suppressWhenChatGptVisible: true,
  duplicateCooldownMs: 3000,
  customSoundDataUrl: null,
  customSoundName: null,
  debugLoggingEnabled: false
};

export function createEmptyCycleSnapshot(cycleId = 0): GenerationCycleSnapshot {
  return {
    cycleId,
    sawStopButton: false,
    sawAssistantActivity: false,
    sawStreamingMutation: false,
    hadError: false,
    manualStop: false,
    startedAt: 0,
    stopSeenAt: null,
    lastActivityAt: null,
    completedAt: null,
    completionReason: null,
    initialAssistantFingerprint: null,
    assistantFingerprint: null,
    stopButtonSignature: null
  };
}
