import { CHATGPT_MATCH_PATTERNS } from './constants';

export function normalizeText(value: string | null | undefined): string {
  return (value ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
}

export function generateId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`;
}

export function simpleHash(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function timeStringToMinutes(value: string): number {
  const [hoursText, minutesText] = value.split(':');
  const hours = Number.parseInt(hoursText ?? '0', 10);
  const minutes = Number.parseInt(minutesText ?? '0', 10);

  // Return 0 if parsing failed
  if (Number.isNaN(hours) || Number.isNaN(minutes)) {
    return 0;
  }

  return hours * 60 + minutes;
}

export function isNowWithinTimeRange(start: string, end: string, date = new Date()): boolean {
  const now = date.getHours() * 60 + date.getMinutes();
  const startMinutes = timeStringToMinutes(start);
  const endMinutes = timeStringToMinutes(end);

  if (startMinutes === endMinutes) {
    return false;
  }

  if (startMinutes < endMinutes) {
    return now >= startMinutes && now < endMinutes;
  }

  return now >= startMinutes || now < endMinutes;
}

export function isChatGptUrl(url: string | undefined | null): boolean {
  if (!url) {
    return false;
  }

  return CHATGPT_MATCH_PATTERNS.some((pattern) => {
    const prefix = pattern.replace('*', '');
    return url.startsWith(prefix);
  });
}

export function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
