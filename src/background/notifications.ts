import {
  ICON_PATH,
  NOTIFICATION_ID_PREFIX,
  NOTIFICATION_MESSAGE,
  NOTIFICATION_TITLE,
  TEST_NOTIFICATION_MESSAGE,
  TEST_NOTIFICATION_TITLE
} from '../shared/constants';

export function buildNotificationId(tabId: number, cycleId: number): string {
  return `${NOTIFICATION_ID_PREFIX}:${tabId}:${cycleId}`;
}

export async function showCompletionNotification(tabId: number, cycleId: number): Promise<string> {
  const notificationId = buildNotificationId(tabId, cycleId);

  await chrome.notifications.create(notificationId, {
    type: 'basic',
    iconUrl: chrome.runtime.getURL(ICON_PATH),
    title: NOTIFICATION_TITLE,
    message: NOTIFICATION_MESSAGE,
    priority: 2
  });

  return notificationId;
}

export async function showTestNotification(): Promise<void> {
  await chrome.notifications.create(`chatgpt-done-test:${Date.now()}`, {
    type: 'basic',
    iconUrl: chrome.runtime.getURL(ICON_PATH),
    title: TEST_NOTIFICATION_TITLE,
    message: TEST_NOTIFICATION_MESSAGE,
    priority: 2
  });
}
