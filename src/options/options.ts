import { DEFAULT_SETTINGS, MAX_CUSTOM_SOUND_BYTES } from '../shared/constants';
import type { DebugLogEntry, ExtensionSettings, UiLogsResponse, UiMutationResponse, UiResponse, UiStateResponse, UiTestResponse } from '../shared/types';

const enabledInput = document.querySelector<HTMLInputElement>('#enabled');
const notificationModeSelect = document.querySelector<HTMLSelectElement>('#notification-mode');
const suppressActiveInput = document.querySelector<HTMLInputElement>('#suppress-active');
const debugLoggingEnabledInput = document.querySelector<HTMLInputElement>('#debug-logging-enabled');
const quietHoursEnabledInput = document.querySelector<HTMLInputElement>('#quiet-hours-enabled');
const quietHoursStartInput = document.querySelector<HTMLInputElement>('#quiet-hours-start');
const quietHoursEndInput = document.querySelector<HTMLInputElement>('#quiet-hours-end');
const customSoundFileInput = document.querySelector<HTMLInputElement>('#custom-sound-file');
const soundSourceLabel = document.querySelector<HTMLElement>('#sound-source-label');
const statusElement = document.querySelector<HTMLElement>('#status');
const testNotificationButton = document.querySelector<HTMLButtonElement>('#test-notification');
const testSoundButton = document.querySelector<HTMLButtonElement>('#test-sound');
const clearCustomSoundButton = document.querySelector<HTMLButtonElement>('#clear-custom-sound');
const refreshLogsButton = document.querySelector<HTMLButtonElement>('#refresh-logs');
const copyLogsButton = document.querySelector<HTMLButtonElement>('#copy-logs');
const clearLogsButton = document.querySelector<HTMLButtonElement>('#clear-logs');
const logsOutput = document.querySelector<HTMLElement>('#logs-output');
const resetSettingsButton = document.querySelector<HTMLButtonElement>('#reset-settings');

let currentSettings: ExtensionSettings = DEFAULT_SETTINGS;

function setStatus(message: string): void {
  if (statusElement) {
    statusElement.textContent = message;
  }
}

async function sendUiMessage<T>(message: { type: string; settings?: ExtensionSettings }): Promise<T> {
  const response = (await chrome.runtime.sendMessage(message)) as UiResponse<T>;
  if (!response.ok || response.data === undefined) {
    throw new Error(response.error ?? 'Unknown extension error');
  }

  return response.data;
}

function renderSettings(settings: ExtensionSettings): void {
  currentSettings = settings;

  if (enabledInput) {
    enabledInput.checked = settings.enabled;
  }

  if (notificationModeSelect) {
    notificationModeSelect.value = settings.notificationMode;
  }

  if (suppressActiveInput) {
    suppressActiveInput.checked = settings.suppressWhenChatGptVisible;
  }

  if (debugLoggingEnabledInput) {
    debugLoggingEnabledInput.checked = settings.debugLoggingEnabled;
  }

  if (quietHoursEnabledInput) {
    quietHoursEnabledInput.checked = settings.quietHours.enabled;
  }

  if (quietHoursStartInput) {
    quietHoursStartInput.value = settings.quietHours.start;
  }

  if (quietHoursEndInput) {
    quietHoursEndInput.value = settings.quietHours.end;
  }

  if (soundSourceLabel) {
    soundSourceLabel.textContent = settings.customSoundName ?? 'Bundled default';
  }

  if (customSoundFileInput) {
    customSoundFileInput.value = '';
  }
}

function formatLogEntry(entry: DebugLogEntry): string {
  const timestamp = new Date(entry.timestamp).toLocaleString();
  const details = entry.details ? ` | ${entry.details}` : '';
  return `[${timestamp}] ${entry.level.toUpperCase()} ${entry.source} ${entry.event}${details}`;
}

function renderLogs(logs: DebugLogEntry[]): void {
  if (!logsOutput) {
    return;
  }

  logsOutput.textContent = logs.length > 0
    ? logs.map((entry) => formatLogEntry(entry)).join('\n')
    : 'No logs recorded yet.';
}

async function loadSettings(): Promise<void> {
  const data = await sendUiMessage<UiStateResponse>({ type: 'ui/get-settings' });
  renderSettings(data.settings);
}

async function loadLogs(): Promise<void> {
  const data = await sendUiMessage<UiLogsResponse>({ type: 'ui/get-logs' });
  renderLogs(data.logs);
}

async function saveCurrentSettings(): Promise<void> {
  const data = await sendUiMessage<UiMutationResponse>({
    type: 'ui/save-settings',
    settings: currentSettings
  });

  renderSettings(data.settings);
  setStatus('Settings saved.');
}

function bindSettingInputs(): void {
  enabledInput?.addEventListener('change', () => {
    currentSettings = {
      ...currentSettings,
      enabled: Boolean(enabledInput.checked)
    };
    void saveCurrentSettings();
  });

  notificationModeSelect?.addEventListener('change', () => {
    currentSettings = {
      ...currentSettings,
      notificationMode: notificationModeSelect.value as ExtensionSettings['notificationMode']
    };
    void saveCurrentSettings();
  });

  suppressActiveInput?.addEventListener('change', () => {
    currentSettings = {
      ...currentSettings,
      suppressWhenChatGptVisible: Boolean(suppressActiveInput.checked)
    };
    void saveCurrentSettings();
  });

  debugLoggingEnabledInput?.addEventListener('change', () => {
    currentSettings = {
      ...currentSettings,
      debugLoggingEnabled: Boolean(debugLoggingEnabledInput.checked)
    };
    void saveCurrentSettings().then(() => loadLogs());
  });

  quietHoursEnabledInput?.addEventListener('change', () => {
    currentSettings = {
      ...currentSettings,
      quietHours: {
        ...currentSettings.quietHours,
        enabled: Boolean(quietHoursEnabledInput.checked)
      }
    };
    void saveCurrentSettings();
  });

  quietHoursStartInput?.addEventListener('change', () => {
    currentSettings = {
      ...currentSettings,
      quietHours: {
        ...currentSettings.quietHours,
        start: quietHoursStartInput.value
      }
    };
    void saveCurrentSettings();
  });

  quietHoursEndInput?.addEventListener('change', () => {
    currentSettings = {
      ...currentSettings,
      quietHours: {
        ...currentSettings.quietHours,
        end: quietHoursEndInput.value
      }
    };
    void saveCurrentSettings();
  });

  customSoundFileInput?.addEventListener('change', () => {
    const file = customSoundFileInput.files?.[0];
    if (!file) {
      return;
    }

    if (file.size > MAX_CUSTOM_SOUND_BYTES) {
      customSoundFileInput.value = '';
      setStatus('Custom sound is too large. Please keep it under 1 MB.');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = typeof reader.result === 'string' ? reader.result : null;
      if (!dataUrl) {
        setStatus('Could not read the selected audio file.');
        return;
      }

      currentSettings = {
        ...currentSettings,
        customSoundDataUrl: dataUrl,
        customSoundName: file.name
      };

      void saveCurrentSettings().then(() => {
        setStatus(`Custom sound saved: ${file.name}`);
      });
    };

    reader.onerror = () => {
      setStatus('Could not load the selected audio file.');
    };

    reader.readAsDataURL(file);
  });
}

testNotificationButton?.addEventListener('click', () => {
  void sendUiMessage<UiTestResponse>({ type: 'ui/test-notification' })
    .then((result) => {
      setStatus(
        result.delivered
          ? 'Test notification sent.'
          : result.reason === 'quiet_hours'
            ? 'Quiet hours blocked the test notification.'
            : 'Extension is disabled.'
      );
    })
    .catch((error: unknown) => {
      setStatus(error instanceof Error ? error.message : 'Notification test failed.');
    });
});

testSoundButton?.addEventListener('click', () => {
  void sendUiMessage<UiTestResponse>({ type: 'ui/test-sound' })
    .then((result) => {
      setStatus(
        result.delivered
          ? 'Test sound played.'
          : result.reason === 'quiet_hours'
            ? 'Quiet hours blocked the test sound.'
            : 'Extension is disabled.'
      );
    })
    .catch((error: unknown) => {
      setStatus(error instanceof Error ? error.message : 'Sound test failed.');
    });
});

clearCustomSoundButton?.addEventListener('click', () => {
  currentSettings = {
    ...currentSettings,
    customSoundDataUrl: null,
    customSoundName: null
  };

  void saveCurrentSettings()
    .then(() => {
      setStatus('Reverted to the bundled default sound.');
    })
    .catch((error: unknown) => {
      setStatus(error instanceof Error ? error.message : 'Could not switch back to the bundled sound.');
    });
});

resetSettingsButton?.addEventListener('click', () => {
  void sendUiMessage<UiMutationResponse>({ type: 'ui/reset-settings' })
    .then((data) => {
      renderSettings(data.settings);
      setStatus('Settings reset to defaults.');
      return loadLogs();
    })
    .catch((error: unknown) => {
      setStatus(error instanceof Error ? error.message : 'Reset failed.');
    });
});

refreshLogsButton?.addEventListener('click', () => {
  void loadLogs()
    .then(() => {
      setStatus('Logs refreshed.');
    })
    .catch((error: unknown) => {
      setStatus(error instanceof Error ? error.message : 'Could not refresh logs.');
    });
});

copyLogsButton?.addEventListener('click', () => {
  const text = logsOutput?.textContent ?? '';
  void navigator.clipboard.writeText(text)
    .then(() => {
      setStatus('Logs copied to clipboard.');
    })
    .catch((error: unknown) => {
      setStatus(error instanceof Error ? error.message : 'Could not copy logs.');
    });
});

clearLogsButton?.addEventListener('click', () => {
  void sendUiMessage<UiLogsResponse>({ type: 'ui/clear-logs' })
    .then((data) => {
      renderLogs(data.logs);
      setStatus('Logs cleared.');
    })
    .catch((error: unknown) => {
      setStatus(error instanceof Error ? error.message : 'Could not clear logs.');
    });
});

bindSettingInputs();
void loadSettings().catch((error: unknown) => {
  setStatus(error instanceof Error ? error.message : 'Failed to load settings.');
});
void loadLogs().catch(() => {
  renderLogs([]);
});
