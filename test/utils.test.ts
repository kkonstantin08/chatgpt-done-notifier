import { describe, it, expect } from 'vitest';
import {
  normalizeText,
  generateId,
  simpleHash,
  timeStringToMinutes,
  isNowWithinTimeRange,
  isChatGptUrl,
  clone
} from '../src/shared/utils';

describe('normalizeText', () => {
  it('should normalize whitespace and convert to lowercase', () => {
    expect(normalizeText('  Hello   World  ')).toBe('hello world');
    expect(normalizeText('Multiple\n\nNewlines')).toBe('multiple newlines');
    expect(normalizeText('UPPERCASE')).toBe('uppercase');
  });

  it('should handle null and undefined', () => {
    expect(normalizeText(null)).toBe('');
    expect(normalizeText(undefined)).toBe('');
  });

  it('should handle empty strings', () => {
    expect(normalizeText('')).toBe('');
    expect(normalizeText('   ')).toBe('');
  });
});

describe('generateId', () => {
  it('should generate ID with prefix', () => {
    const id = generateId('test');
    expect(id).toMatch(/^test-[a-z0-9]+-[a-z0-9]+$/);
  });

  it('should generate unique IDs', () => {
    const id1 = generateId('test');
    const id2 = generateId('test');
    expect(id1).not.toBe(id2);
  });
});

describe('simpleHash', () => {
  it('should generate consistent hash for same input', () => {
    const hash1 = simpleHash('test string');
    const hash2 = simpleHash('test string');
    expect(hash1).toBe(hash2);
  });

  it('should generate different hashes for different inputs', () => {
    const hash1 = simpleHash('test1');
    const hash2 = simpleHash('test2');
    expect(hash1).not.toBe(hash2);
  });

  it('should return 8-character hex string', () => {
    const hash = simpleHash('test');
    expect(hash).toMatch(/^[0-9a-f]{8}$/);
  });
});

describe('timeStringToMinutes', () => {
  it('should convert time string to minutes', () => {
    expect(timeStringToMinutes('00:00')).toBe(0);
    expect(timeStringToMinutes('01:30')).toBe(90);
    expect(timeStringToMinutes('12:45')).toBe(765);
    expect(timeStringToMinutes('23:59')).toBe(1439);
  });

  it('should handle invalid input gracefully', () => {
    // Now returns 0 for invalid input instead of NaN
    expect(timeStringToMinutes('')).toBe(0);
    expect(timeStringToMinutes('invalid')).toBe(0);
  });
});

describe('isNowWithinTimeRange', () => {
  it('should return false when start equals end', () => {
    const date = new Date('2026-05-18T12:00:00Z');
    expect(isNowWithinTimeRange('10:00', '10:00', date)).toBe(false);
  });

  it('should handle same-day range', () => {
    // Create date with specific local time (not UTC)
    const date = new Date('2026-05-18T12:00:00');
    date.setHours(12, 0, 0, 0); // Ensure 12:00 local time

    expect(isNowWithinTimeRange('10:00', '14:00', date)).toBe(true);
    expect(isNowWithinTimeRange('14:00', '18:00', date)).toBe(false);
  });

  it('should handle overnight range', () => {
    const date = new Date('2026-05-18T02:00:00Z'); // 02:00 UTC
    expect(isNowWithinTimeRange('22:00', '07:00', date)).toBe(true);

    const date2 = new Date('2026-05-18T23:00:00Z'); // 23:00 UTC
    expect(isNowWithinTimeRange('22:00', '07:00', date2)).toBe(true);

    const date3 = new Date('2026-05-18T12:00:00Z'); // 12:00 UTC
    expect(isNowWithinTimeRange('22:00', '07:00', date3)).toBe(false);
  });

  it('should handle edge cases at boundaries', () => {
    const dateStart = new Date('2026-05-18T10:00:00Z');
    expect(isNowWithinTimeRange('10:00', '14:00', dateStart)).toBe(true);

    const dateEnd = new Date('2026-05-18T14:00:00Z');
    expect(isNowWithinTimeRange('10:00', '14:00', dateEnd)).toBe(false);
  });
});

describe('isChatGptUrl', () => {
  it('should return true for ChatGPT URLs', () => {
    expect(isChatGptUrl('https://chatgpt.com/')).toBe(true);
    expect(isChatGptUrl('https://chatgpt.com/c/123')).toBe(true);
    expect(isChatGptUrl('https://chat.openai.com/')).toBe(true);
    expect(isChatGptUrl('https://chat.openai.com/chat')).toBe(true);
  });

  it('should return false for non-ChatGPT URLs', () => {
    expect(isChatGptUrl('https://google.com')).toBe(false);
    expect(isChatGptUrl('https://openai.com')).toBe(false);
    expect(isChatGptUrl('https://example.com')).toBe(false);
  });

  it('should handle null and undefined', () => {
    expect(isChatGptUrl(null)).toBe(false);
    expect(isChatGptUrl(undefined)).toBe(false);
    expect(isChatGptUrl('')).toBe(false);
  });
});

describe('clone', () => {
  it('should deep clone objects', () => {
    const obj = { a: 1, b: { c: 2 } };
    const cloned = clone(obj);

    expect(cloned).toEqual(obj);
    expect(cloned).not.toBe(obj);
    expect(cloned.b).not.toBe(obj.b);
  });

  it('should clone arrays', () => {
    const arr = [1, 2, { a: 3 }];
    const cloned = clone(arr);

    expect(cloned).toEqual(arr);
    expect(cloned).not.toBe(arr);
  });

  it('should handle primitives', () => {
    expect(clone(42)).toBe(42);
    expect(clone('test')).toBe('test');
    expect(clone(true)).toBe(true);
    expect(clone(null)).toBe(null);
  });
});
