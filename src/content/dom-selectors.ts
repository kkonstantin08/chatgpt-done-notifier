import {
  ERROR_TEXT_TOKENS,
  STOP_BUTTON_DATA_TOKENS,
  STOP_BUTTON_TOKENS
} from '../shared/constants';
import type { DomInspectionSnapshot } from '../shared/types';
import { normalizeText, simpleHash } from '../shared/utils';

export interface StopButtonMatch {
  element: HTMLElement;
  signature: string;
}

function getButtonSignalText(element: HTMLElement): string {
  const parts = [
    element.innerText,
    element.textContent,
    element.getAttribute('aria-label'),
    element.getAttribute('title'),
    element.getAttribute('data-testid'),
    element.getAttribute('name')
  ];

  return normalizeText(parts.filter(Boolean).join(' '));
}

export function findStopButton(root: ParentNode = document): StopButtonMatch | null {
  const buttonCandidates = Array.from(root.querySelectorAll<HTMLElement>('button, [role="button"]'));
  let bestMatch: { score: number; match: StopButtonMatch } | null = null;

  for (const candidate of buttonCandidates) {
    const signalText = getButtonSignalText(candidate);
    const dataTestId = normalizeText(candidate.getAttribute('data-testid'));

    let score = 0;
    if (STOP_BUTTON_DATA_TOKENS.some((token) => dataTestId.includes(token))) {
      score += 8;
    }

    if (STOP_BUTTON_TOKENS.some((token) => signalText.includes(token))) {
      score += signalText.includes('stop generating') || signalText.includes('stop streaming') ? 8 : 5;
    }

    if (candidate.closest('form')) {
      score += 2;
    }

    if (candidate.closest('main')) {
      score += 1;
    }

    if (score < 7) {
      continue;
    }

    const match: StopButtonMatch = {
      element: candidate,
      signature: `${dataTestId}|${signalText}`
    };

    if (!bestMatch || score > bestMatch.score) {
      bestMatch = { score, match };
    }
  }

  return bestMatch?.match ?? null;
}

function getAssistantCandidates(root: ParentNode = document): HTMLElement[] {
  const roleMatches = Array.from(
    root.querySelectorAll<HTMLElement>('[data-message-author-role="assistant"]')
  );

  if (roleMatches.length > 0) {
    return roleMatches;
  }

  return Array.from(root.querySelectorAll<HTMLElement>('main article')).filter((candidate) => {
    const normalized = normalizeText(candidate.innerText);
    if (!normalized) {
      return false;
    }

    return Boolean(candidate.querySelector('pre, code, p, ul, ol, table, [class*="markdown"], [class*="prose"]'));
  });
}

export function findLatestAssistantTurn(root: ParentNode = document): HTMLElement | null {
  const candidates = getAssistantCandidates(root).filter((candidate) => normalizeText(candidate.innerText).length > 0);
  return candidates.at(-1) ?? null;
}

export function fingerprintAssistantTurn(element: HTMLElement | null): string | null {
  if (!element) {
    return null;
  }

  const textContent = element.innerText || element.textContent || '';
  const normalizedText = textContent.replace(/\s+/g, ' ').trim();
  if (!normalizedText) {
    return null;
  }

  const trimmed = normalizedText.slice(-4000);
  const codeBlocks = element.querySelectorAll('pre, code').length;
  const tables = element.querySelectorAll('table').length;
  const images = element.querySelectorAll('img').length;
  const childCount = element.childElementCount;

  return [
    simpleHash(trimmed),
    normalizedText.length,
    codeBlocks,
    tables,
    images,
    childCount
  ].join(':');
}

export function detectObviousError(root: ParentNode = document): boolean {
  const alertCandidates = [
    ...Array.from(root.querySelectorAll<HTMLElement>('[role="alert"], [data-testid*="error"], .text-red-500, .text-danger'))
  ];

  const haystack = alertCandidates.map((candidate) => normalizeText(candidate.innerText)).join(' ');
  if (ERROR_TEXT_TOKENS.some((token) => haystack.includes(token))) {
    return true;
  }

  const bodyText = normalizeText(document.body?.innerText).slice(-2000);
  return ERROR_TEXT_TOKENS.some((token) => bodyText.includes(token));
}

export function inspectChatGptDom(root: ParentNode = document): DomInspectionSnapshot {
  const observedAt = Date.now();
  const stopButton = findStopButton(root);
  const assistantTurn = findLatestAssistantTurn(root);

  return {
    observedAt,
    stopButtonPresent: Boolean(stopButton),
    stopButtonSignature: stopButton?.signature ?? null,
    assistantFingerprint: fingerprintAssistantTurn(assistantTurn),
    assistantTurnPresent: Boolean(assistantTurn),
    errorPresent: detectObviousError(root)
  };
}
