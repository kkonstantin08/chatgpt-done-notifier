export type NotificationMode = 'desktop' | 'desktop_sound';

export interface QuietHoursSettings {
  enabled: boolean;
  start: string;
  end: string;
}

export interface ExtensionSettings {
  enabled: boolean;
  notificationMode: NotificationMode;
  quietHours: QuietHoursSettings;
  suppressWhenChatGptVisible: boolean;
  duplicateCooldownMs: number;
  customSoundDataUrl: string | null;
  customSoundName: string | null;
  debugLoggingEnabled: boolean;
}

export type DebugLogLevel = 'info' | 'warn' | 'error';
export type DebugLogSource = 'background' | 'content' | 'ui' | 'offscreen';

export interface DebugLogEntry {
  id: string;
  timestamp: number;
  level: DebugLogLevel;
  source: DebugLogSource;
  event: string;
  details?: string;
}

export type ObserverState =
  | 'idle'
  | 'generation_detected'
  | 'actively_generating'
  | 'generation_completed'
  | 'user_stopped'
  | 'error_state'
  | 'notification_sent';

export type CompletionReason = 'natural' | 'manual_stop' | 'error' | null;

export interface VisibilitySnapshot {
  documentVisible: boolean;
  documentHasFocus: boolean;
  windowFocused: boolean;
  href: string;
  updatedAt: number;
}

export interface GenerationCycleSnapshot {
  cycleId: number;
  sawStopButton: boolean;
  sawAssistantActivity: boolean;
  sawStreamingMutation: boolean;
  hadError: boolean;
  manualStop: boolean;
  startedAt: number;
  stopSeenAt: number | null;
  lastActivityAt: number | null;
  completedAt: number | null;
  completionReason: CompletionReason;
  initialAssistantFingerprint: string | null;
  assistantFingerprint: string | null;
  stopButtonSignature: string | null;
}

export interface DomInspectionSnapshot {
  observedAt: number;
  stopButtonPresent: boolean;
  stopButtonSignature: string | null;
  assistantFingerprint: string | null;
  assistantTurnPresent: boolean;
  errorPresent: boolean;
}

export interface ObserverStatusPayload {
  pageSessionId: string;
  locationHref: string;
  state: ObserverState;
  cycle: GenerationCycleSnapshot;
  visibility: VisibilitySnapshot;
  sentAt: number;
}

export interface RuntimeTabSession {
  tabId: number;
  windowId: number | null;
  pageSessionId: string;
  locationHref: string;
  lastState: ObserverState;
  lastVisibility: VisibilitySnapshot | null;
  cycle: GenerationCycleSnapshot;
  lastUpdatedAt: number;
  lastNotificationId: string | null;
  lastNotifiedAt: number | null;
}

export interface UiTestResponse {
  delivered: boolean;
  reason: 'sent' | 'disabled' | 'quiet_hours' | 'unsupported';
}

export interface UiStateResponse {
  settings: ExtensionSettings;
}

export interface UiMutationResponse {
  settings: ExtensionSettings;
}

export interface UiLogsResponse {
  logs: DebugLogEntry[];
}

export type ContentToBackgroundMessage = {
  type: 'observer/status';
  payload: ObserverStatusPayload;
};

export type RuntimeLogMessage = {
  type: 'runtime/log';
  payload: {
    source: DebugLogSource;
    level: DebugLogLevel;
    event: string;
    details?: string;
  };
};

export type UiToBackgroundMessage =
  | { type: 'ui/get-settings' }
  | { type: 'ui/save-settings'; settings: ExtensionSettings }
  | { type: 'ui/reset-settings' }
  | { type: 'ui/test-notification' }
  | { type: 'ui/test-sound' }
  | { type: 'ui/get-logs' }
  | { type: 'ui/clear-logs' };

export type BackgroundToOffscreenMessage = {
  type: 'offscreen/play-sound';
  soundUrl: string;
};

export interface UiResponse<T> {
  ok: boolean;
  data?: T;
  error?: string;
}
