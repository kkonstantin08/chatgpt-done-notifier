import { DEFAULT_SETTINGS } from '../shared/constants';
import type { ExtensionSettings, UiMutationResponse, UiResponse, UiStateResponse, UiTestResponse } from '../shared/types';

const enabledInput = document.querySelector<HTMLInputElement>('#enabled');
const notificationModeSelect = document.querySelector<HTMLSelectElement>('#notification-mode');
const suppressActiveInput = document.querySelector<HTMLInputElement>('#suppress-active');
const quietHoursSummary = document.querySelector<HTMLElement>('#quiet-hours-summary');
const statusElement = document.querySelector<HTMLElement>('#status');
const testNotificationButton = document.querySelector<HTMLButtonElement>('#test-notification');
const openOptionsButton = document.querySelector<HTMLButtonElement>('#open-options');

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

function updateQuietHoursSummary(settings: ExtensionSettings): void {
  if (!quietHoursSummary) {
    return;
  }

  quietHoursSummary.textContent = settings.quietHours.enabled
    ? `${settings.quietHours.start} - ${settings.quietHours.end}`
    : 'Off';
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

  updateQuietHoursSummary(settings);
}

async function loadSettings(): Promise<void> {
  const data = await sendUiMessage<UiStateResponse>({ type: 'ui/get-settings' });
  renderSettings(data.settings);
}

async function persistSettings(): Promise<void> {
  const data = await sendUiMessage<UiMutationResponse>({
    type: 'ui/save-settings',
    settings: currentSettings
  });
  renderSettings(data.settings);
  setStatus('Settings saved.');
}

enabledInput?.addEventListener('change', () => {
  currentSettings = {
    ...currentSettings,
    enabled: Boolean(enabledInput.checked)
  };
  void persistSettings();
});

notificationModeSelect?.addEventListener('change', () => {
  currentSettings = {
    ...currentSettings,
    notificationMode: notificationModeSelect.value as ExtensionSettings['notificationMode']
  };
  void persistSettings();
});

suppressActiveInput?.addEventListener('change', () => {
  currentSettings = {
    ...currentSettings,
    suppressWhenChatGptVisible: Boolean(suppressActiveInput.checked)
  };
  void persistSettings();
});

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
      setStatus(error instanceof Error ? error.message : 'Test notification failed.');
    });
});

openOptionsButton?.addEventListener('click', () => {
  void chrome.runtime.openOptionsPage();
});

void loadSettings().catch((error: unknown) => {
  setStatus(error instanceof Error ? error.message : 'Failed to load settings.');
});
