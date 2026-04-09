import { OFFSCREEN_DOCUMENT_PATH, SOUND_ASSET_PATH } from '../shared/constants';
import type { BackgroundToOffscreenMessage, ExtensionSettings } from '../shared/types';

let creatingOffscreenDocument: Promise<void> | null = null;

async function ensureOffscreenDocument(): Promise<void> {
  const offscreenUrl = chrome.runtime.getURL(OFFSCREEN_DOCUMENT_PATH);
  const existingContexts = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT'],
    documentUrls: [offscreenUrl]
  });

  if (existingContexts.length > 0) {
    return;
  }

  if (!creatingOffscreenDocument) {
    creatingOffscreenDocument = chrome.offscreen.createDocument({
      url: OFFSCREEN_DOCUMENT_PATH,
      reasons: ['AUDIO_PLAYBACK'],
      justification: 'Play the bundled completion sound for ChatGPT Done Notifier.'
    });
  }

  try {
    await creatingOffscreenDocument;
  } finally {
    creatingOffscreenDocument = null;
  }
}

export function getSoundUrl(settings: ExtensionSettings): string {
  return settings.customSoundDataUrl ?? chrome.runtime.getURL(SOUND_ASSET_PATH);
}

export async function playNotificationSound(soundUrl: string): Promise<void> {
  await ensureOffscreenDocument();

  const message: BackgroundToOffscreenMessage = {
    type: 'offscreen/play-sound',
    soundUrl
  };

  await chrome.runtime.sendMessage(message);
}
