import { DEFAULT_SETTINGS, NOTIFICATION_ID_PREFIX } from '../shared/constants';
import { isObserverStatusMessage, isRuntimeLogMessage, isUiMessage } from '../shared/messaging';
import type {
  ContentToBackgroundMessage,
  ObserverStatusPayload,
  RuntimeTabSession,
  RuntimeLogMessage,
  UiLogsResponse,
  UiMutationResponse,
  UiResponse,
  UiStateResponse,
  UiTestResponse
} from '../shared/types';
import { isChatGptUrl } from '../shared/utils';
import { appendLog, clearLogs, getLogs } from './logger';
import { showCompletionNotification, showTestNotification } from './notifications';
import { getRuntimeSession, pruneRuntimeSessions, removeRuntimeSession, upsertRuntimeSession } from './runtime-state';
import { getSettings, isQuietHoursActive, resetSettings, saveSettings } from './settings';
import { getSoundUrl, playNotificationSound } from './sound';
import { focusOrOpenChatGpt, getTabVisibilityContext } from './tabs';

async function initializeExtension(): Promise<void> {
  await chrome.storage.local.set({
    settings: await getSettings().catch(() => DEFAULT_SETTINGS)
  });

  const tabs = await chrome.tabs.query({});
  await pruneRuntimeSessions(tabs.map((tab) => tab.id).filter((id): id is number => id !== undefined));
  await appendLog('background', 'info', 'extension_initialized', `Tracked tabs on startup: ${tabs.length}`);
}

async function reloadOpenChatGptTabs(): Promise<void> {
  const tabs = await chrome.tabs.query({
    url: ['https://chatgpt.com/*', 'https://chat.openai.com/*']
  });

  for (const tab of tabs) {
    if (tab.id !== undefined) {
      await chrome.tabs.reload(tab.id);
    }
  }

  await appendLog('background', 'info', 'chatgpt_tabs_reloaded', `count=${tabs.length}`, true);
}

function buildRuntimeSession(tabId: number, windowId: number | null, payload: ObserverStatusPayload): RuntimeTabSession {
  return {
    tabId,
    windowId,
    pageSessionId: payload.pageSessionId,
    locationHref: payload.locationHref,
    lastState: payload.state,
    lastVisibility: payload.visibility,
    cycle: payload.cycle,
    lastUpdatedAt: Date.now(),
    lastNotificationId: null,
    lastNotifiedAt: null
  };
}

async function maybeNotifyForCompletion(tabId: number, session: RuntimeTabSession): Promise<void> {
  const settings = await getSettings();

  if (!settings.enabled) {
    await appendLog('background', 'info', 'notification_suppressed', `tab=${tabId} reason=extension_disabled`);
    return;
  }

  if (isQuietHoursActive(settings)) {
    await appendLog('background', 'info', 'notification_suppressed', `tab=${tabId} reason=quiet_hours`);
    return;
  }

  if (session.cycle.completionReason !== 'natural') {
    await appendLog('background', 'info', 'notification_suppressed', `tab=${tabId} reason=${session.cycle.completionReason ?? 'unknown_completion'}`);
    return;
  }

  if (session.lastNotifiedAt && Date.now() - session.lastNotifiedAt < settings.duplicateCooldownMs) {
    await appendLog('background', 'info', 'notification_suppressed', `tab=${tabId} reason=duplicate_cooldown`);
    return;
  }

  const { tab, activelyViewed } = await getTabVisibilityContext(tabId, session.lastVisibility);

  if (!tab) {
    await appendLog('background', 'warn', 'notification_suppressed', `tab=${tabId} reason=tab_missing`);
    return;
  }

  if (settings.suppressWhenChatGptVisible && activelyViewed) {
    await appendLog('background', 'info', 'notification_suppressed', `tab=${tabId} reason=chatgpt_visible`);
    return;
  }

  const notificationId = await showCompletionNotification(tabId, session.cycle.cycleId);
  const updatedSession: RuntimeTabSession = {
    ...session,
    lastState: 'notification_sent',
    lastNotificationId: notificationId,
    lastNotifiedAt: Date.now(),
    lastUpdatedAt: Date.now()
  };

  await upsertRuntimeSession(updatedSession);
  await appendLog('background', 'info', 'notification_sent', `tab=${tabId} cycle=${session.cycle.cycleId} notificationId=${notificationId}`);

  if (settings.notificationMode === 'desktop_sound') {
    await playNotificationSound(getSoundUrl(settings));
    await appendLog('background', 'info', 'sound_play_requested', `tab=${tabId} source=${settings.customSoundName ?? 'bundled_default'}`);
  }
}

async function handleObserverStatus(message: ContentToBackgroundMessage, sender: chrome.runtime.MessageSender): Promise<void> {
  const tabId = sender.tab?.id;
  if (tabId === undefined) {
    return;
  }

  const payload = message.payload;
  const runtimeSession = buildRuntimeSession(tabId, sender.tab?.windowId ?? null, payload);
  const existingSession = await getRuntimeSession(tabId);

  const lastNotifiedAt =
    existingSession?.pageSessionId === payload.pageSessionId &&
    existingSession.cycle.cycleId === payload.cycle.cycleId
      ? existingSession.lastNotifiedAt
      : null;

  const lastNotificationId =
    existingSession?.pageSessionId === payload.pageSessionId &&
    existingSession.cycle.cycleId === payload.cycle.cycleId
      ? existingSession.lastNotificationId
      : null;

  const sameCycleAlreadyNotified =
    existingSession?.pageSessionId === payload.pageSessionId &&
    existingSession.cycle.cycleId === payload.cycle.cycleId &&
    existingSession.lastNotifiedAt !== null;

  const mergedSession: RuntimeTabSession = {
    ...runtimeSession,
    lastState: sameCycleAlreadyNotified ? 'notification_sent' : payload.state,
    lastNotifiedAt,
    lastNotificationId
  };

  await upsertRuntimeSession(mergedSession);

  if (existingSession?.lastState !== payload.state) {
    await appendLog(
      'background',
      'info',
      'observer_state_changed',
      `tab=${tabId} state=${payload.state} cycle=${payload.cycle.cycleId} reason=${payload.cycle.completionReason ?? 'none'}`
    );
  }

  if (payload.state === 'generation_completed' && !sameCycleAlreadyNotified) {
    await maybeNotifyForCompletion(tabId, mergedSession);
  }
}

async function handleRuntimeLog(message: RuntimeLogMessage): Promise<void> {
  await appendLog(message.payload.source, message.payload.level, message.payload.event, message.payload.details);
}

async function handleUiMessage(message: { type: string; settings?: unknown }): Promise<UiResponse<UiStateResponse | UiMutationResponse | UiTestResponse | UiLogsResponse>> {
  switch (message.type) {
    case 'ui/get-settings':
      return {
        ok: true,
        data: {
          settings: await getSettings()
        }
      };

    case 'ui/save-settings':
      await appendLog('ui', 'info', 'settings_saved', 'User changed extension settings.', true);
      return {
        ok: true,
        data: {
          settings: await saveSettings(message.settings as UiMutationResponse['settings'])
        }
      };

    case 'ui/reset-settings':
      await appendLog('ui', 'info', 'settings_reset', 'Settings were reset to defaults.', true);
      return {
        ok: true,
        data: {
          settings: await resetSettings()
        }
      };

    case 'ui/test-notification': {
      const settings = await getSettings();

      if (!settings.enabled) {
        await appendLog('ui', 'info', 'test_notification_blocked', 'reason=extension_disabled');
        return {
          ok: true,
          data: {
            delivered: false,
            reason: 'disabled'
          }
        };
      }

      if (isQuietHoursActive(settings)) {
        await appendLog('ui', 'info', 'test_notification_blocked', 'reason=quiet_hours');
        return {
          ok: true,
          data: {
            delivered: false,
            reason: 'quiet_hours'
          }
        };
      }

      await showTestNotification();
      await appendLog('ui', 'info', 'test_notification_sent', 'User triggered a test notification.');
      if (settings.notificationMode === 'desktop_sound') {
        await playNotificationSound(getSoundUrl(settings));
        await appendLog('ui', 'info', 'test_sound_play_requested', `source=${settings.customSoundName ?? 'bundled_default'}`);
      }

      return {
        ok: true,
        data: {
          delivered: true,
          reason: 'sent'
        }
      };
    }

    case 'ui/test-sound': {
      const settings = await getSettings();

      if (!settings.enabled) {
        await appendLog('ui', 'info', 'test_sound_blocked', 'reason=extension_disabled');
        return {
          ok: true,
          data: {
            delivered: false,
            reason: 'disabled'
          }
        };
      }

      if (isQuietHoursActive(settings)) {
        await appendLog('ui', 'info', 'test_sound_blocked', 'reason=quiet_hours');
        return {
          ok: true,
          data: {
            delivered: false,
            reason: 'quiet_hours'
          }
        };
      }

      await playNotificationSound(getSoundUrl(settings));
      await appendLog('ui', 'info', 'test_sound_play_requested', `source=${settings.customSoundName ?? 'bundled_default'}`);
      return {
        ok: true,
        data: {
          delivered: true,
          reason: 'sent'
        }
      };
    }

    case 'ui/get-logs':
      return {
        ok: true,
        data: {
          logs: await getLogs()
        }
      };

    case 'ui/clear-logs':
      await clearLogs();
      return {
        ok: true,
        data: {
          logs: await getLogs()
        }
      };

    default:
      return {
        ok: false,
        error: 'Unsupported UI action.'
      };
  }
}

chrome.runtime.onInstalled.addListener((details) => {
  void initializeExtension();

  if (details.reason === 'update') {
    void reloadOpenChatGptTabs();
  }
});

chrome.runtime.onStartup.addListener(() => {
  void initializeExtension();
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (isObserverStatusMessage(message)) {
    void handleObserverStatus(message, sender);
    return;
  }

  if (isRuntimeLogMessage(message)) {
    void handleRuntimeLog(message);
    return;
  }

  if (isUiMessage(message)) {
    void handleUiMessage(message)
      .then((response) => sendResponse(response))
      .catch((error: unknown) => {
        void appendLog('background', 'error', 'ui_message_failed', error instanceof Error ? error.message : 'Unknown error', true);
        sendResponse({
          ok: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      });
    return true;
  }
});

chrome.notifications.onClicked.addListener((notificationId) => {
  void (async () => {
    const [prefix, tabIdText] = notificationId.split(':');
    if (prefix !== NOTIFICATION_ID_PREFIX) {
      return;
    }

    const tabId = Number.parseInt(tabIdText ?? '', 10);
    const session = Number.isFinite(tabId) ? await getRuntimeSession(tabId) : null;
    await appendLog('background', 'info', 'notification_clicked', `notificationId=${notificationId} tab=${Number.isFinite(tabId) ? tabId : 'unknown'}`);
    await focusOrOpenChatGpt(session, session?.locationHref);
    await chrome.notifications.clear(notificationId);
  })();
});

chrome.tabs.onRemoved.addListener((tabId) => {
  void appendLog('background', 'info', 'tab_removed', `tab=${tabId}`);
  void removeRuntimeSession(tabId);
});

chrome.tabs.onReplaced.addListener((addedTabId, removedTabId) => {
  void (async () => {
    await removeRuntimeSession(removedTabId);
    const addedTab = await chrome.tabs.get(addedTabId);
    if (!isChatGptUrl(addedTab.url)) {
      await removeRuntimeSession(addedTabId);
    }
  })();
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.url && !isChatGptUrl(changeInfo.url)) {
    void appendLog('background', 'info', 'runtime_session_removed', `tab=${tabId} reason=navigated_away`);
    void removeRuntimeSession(tabId);
    return;
  }

  if (tab.status === 'complete' && tab.url && !isChatGptUrl(tab.url)) {
    void appendLog('background', 'info', 'runtime_session_removed', `tab=${tabId} reason=non_chatgpt_complete`);
    void removeRuntimeSession(tabId);
  }
});
