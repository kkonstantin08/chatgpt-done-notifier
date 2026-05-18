import type { VisibilitySnapshot } from '../shared/types';

export function getVisibilitySnapshot(): VisibilitySnapshot {
  return {
    documentVisible: document.visibilityState === 'visible',
    documentHasFocus: document.hasFocus(),
    windowFocused: document.hasFocus(),
    href: window.location.href,
    updatedAt: Date.now()
  };
}

export function observeVisibility(onChange: (snapshot: VisibilitySnapshot) => void): () => void {
  let debounceTimer: number | null = null;

  const handler = (): void => {
    if (debounceTimer !== null) {
      window.clearTimeout(debounceTimer);
    }

    debounceTimer = window.setTimeout(() => {
      debounceTimer = null;
      onChange(getVisibilitySnapshot());
    }, 150);
  };

  const events: Array<[EventTarget, string]> = [
    [document, 'visibilitychange'],
    [window, 'focus'],
    [window, 'blur'],
    [window, 'pageshow'],
    [window, 'pagehide']
  ];

  for (const [target, eventName] of events) {
    target.addEventListener(eventName, handler);
  }

  return () => {
    if (debounceTimer !== null) {
      window.clearTimeout(debounceTimer);
      debounceTimer = null;
    }

    for (const [target, eventName] of events) {
      target.removeEventListener(eventName, handler);
    }
  };
}
