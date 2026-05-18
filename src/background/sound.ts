import { OFFSCREEN_DOCUMENT_PATH, SOUND_ASSET_PATH } from '../shared/constants';
import type { BackgroundToOffscreenMessage, ExtensionSettings } from '../shared/types';

let creatingOffscreenDocument: Promise<void> | null = null;
let offscreenDocumentReady = false;

async function ensureOffscreenDocument(): Promise<void> {
  const offscreenUrl = chrome.runtime.getURL(OFFSCREEN_DOCUMENT_PATH);
  const existingContexts = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT'],
    documentUrls: [offscreenUrl]
  });

  if (existingContexts.length > 0) {
    offscreenDocumentReady = true;
    return;
  }

  if (creatingOffscreenDocument) {
    await creatingOffscreenDocument;
    return;
  }

  creatingOffscreenDocument = chrome.offscreen.createDocument({
    url: OFFSCREEN_DOCUMENT_PATH,
    reasons: ['AUDIO_PLAYBACK'],
    justification: 'Play the bundled completion sound for ChatGPT Done Notifier.'
  }).then(() => {
    offscreenDocumentReady = true;
  });

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
  try {
    await ensureOffscreenDocument();

    const message: BackgroundToOffscreenMessage = {
      type: 'offscreen/play-sound',
      soundUrl
    };

    await chrome.runtime.sendMessage(message);
  } catch (error: unknown) {
    offscreenDocumentReady = false;

    if (error instanceof Error && error.message.includes('Receiving end does not exist')) {
      creatingOffscreenDocument = null;
      throw new Error('Offscreen document not ready to receive messages');
    }

    throw error;
  }
}
