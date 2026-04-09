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
  const handler = (): void => {
    onChange(getVisibilitySnapshot());
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
    for (const [target, eventName] of events) {
      target.removeEventListener(eventName, handler);
    }
  };
}
