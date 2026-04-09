import type { ContentToBackgroundMessage, RuntimeLogMessage, UiToBackgroundMessage } from './types';

export function isObserverStatusMessage(value: unknown): value is ContentToBackgroundMessage {
  if (!value || typeof value !== 'object') {
    return false;
  }

  return (value as { type?: string }).type === 'observer/status';
}

export function isUiMessage(value: unknown): value is UiToBackgroundMessage {
  if (!value || typeof value !== 'object') {
    return false;
  }

  return typeof (value as { type?: string }).type === 'string' && (value as { type: string }).type.startsWith('ui/');
}

export function isRuntimeLogMessage(value: unknown): value is RuntimeLogMessage {
  if (!value || typeof value !== 'object') {
    return false;
  }

  return (value as { type?: string }).type === 'runtime/log';
}
