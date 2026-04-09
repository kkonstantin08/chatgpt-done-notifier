import type { BackgroundToOffscreenMessage } from '../shared/types';

let currentAudio: HTMLAudioElement | null = null;

function logOffscreen(event: string, details?: string, level: 'info' | 'warn' | 'error' = 'info'): void {
  void chrome.runtime.sendMessage({
    type: 'runtime/log',
    payload: {
      source: 'offscreen',
      level,
      event,
      details
    }
  });
}

chrome.runtime.onMessage.addListener((message: BackgroundToOffscreenMessage) => {
  if (message.type !== 'offscreen/play-sound') {
    return;
  }

  currentAudio?.pause();
  currentAudio = new Audio(message.soundUrl);
  currentAudio.currentTime = 0;
  void currentAudio.play()
    .then(() => {
      logOffscreen('sound_playback_started', message.soundUrl.startsWith('data:') ? 'source=custom' : 'source=bundled');
    })
    .catch((error: unknown) => {
      logOffscreen(
        'sound_playback_failed',
        error instanceof Error ? error.message : 'Audio playback failed.',
        'error'
      );
    });
});
