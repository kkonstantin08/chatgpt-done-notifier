import { CHATGPT_HOME_URL, CHATGPT_MATCH_PATTERNS } from '../shared/constants';
import type { RuntimeTabSession, VisibilitySnapshot } from '../shared/types';

export async function findChatGptTabs(): Promise<chrome.tabs.Tab[]> {
  return chrome.tabs.query({
    url: [...CHATGPT_MATCH_PATTERNS]
  });
}

export async function getTabVisibilityContext(
  tabId: number,
  visibility: VisibilitySnapshot | null
): Promise<{ tab: chrome.tabs.Tab | null; window: chrome.windows.Window | null; activelyViewed: boolean }> {
  try {
    const tab = await chrome.tabs.get(tabId);
    const window = await chrome.windows.get(tab.windowId);

    const activelyViewed =
      Boolean(tab.active) &&
      Boolean(window.focused) &&
      window.state !== 'minimized' &&
      Boolean(visibility?.documentVisible) &&
      Boolean(visibility?.windowFocused) &&
      Boolean(visibility?.documentHasFocus);

    return { tab, window, activelyViewed };
  } catch {
    return { tab: null, window: null, activelyViewed: false };
  }
}

export async function focusOrOpenChatGpt(
  preferredSession: RuntimeTabSession | null,
  fallbackUrl?: string
): Promise<void> {
  const preferredTabId = preferredSession?.tabId;

  if (preferredTabId) {
    try {
      const preferredTab = await chrome.tabs.get(preferredTabId);
      const preferredWindow = await chrome.windows.get(preferredTab.windowId);

      if (preferredWindow.state === 'minimized') {
        await chrome.windows.update(preferredWindow.id!, { state: 'normal', focused: true });
      } else {
        await chrome.windows.update(preferredWindow.id!, { focused: true });
      }

      await chrome.tabs.update(preferredTab.id!, { active: true });
      return;
    } catch {
      // Fall through and find another tab or open a new one.
    }
  }

  const existingTabs = await findChatGptTabs();
  const fallbackTab = existingTabs[0];

  if (fallbackTab?.id && fallbackTab.windowId !== undefined) {
    const window = await chrome.windows.get(fallbackTab.windowId);
    if (window.state === 'minimized') {
      await chrome.windows.update(window.id!, { state: 'normal', focused: true });
    } else {
      await chrome.windows.update(window.id!, { focused: true });
    }

    await chrome.tabs.update(fallbackTab.id, { active: true });
    return;
  }

  await chrome.tabs.create({
    url: fallbackUrl ?? CHATGPT_HOME_URL
  });
}
