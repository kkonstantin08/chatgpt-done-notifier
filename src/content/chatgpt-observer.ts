import { ACTIVE_POLL_INTERVAL_MS } from '../shared/constants';
import type { ObserverStatusPayload, VisibilitySnapshot } from '../shared/types';
import { generateId } from '../shared/utils';
import { findLatestAssistantTurn, inspectChatGptDom } from './dom-selectors';
import { GenerationStateMachine } from './state-machine';
import { getVisibilitySnapshot, observeVisibility } from './visibility';

const pageSessionId = generateId('page');
let latestVisibility = getVisibilitySnapshot();
let activePollTimer: number | null = null;
let latestAssistantElement: HTMLElement | null = null;
let observerStopped = false;
let stopVisibilityObservation: (() => void) | null = null;

function isContextInvalidatedError(error: unknown): boolean {
  return error instanceof Error && error.message.includes('Extension context invalidated');
}

function stopObserver(reason: string): void {
  if (observerStopped) {
    return;
  }

  observerStopped = true;
  mutationObserver.disconnect();
  stopVisibilityObservation?.();
  stopActivePolling();
  stateMachine.dispose();

  // Clear references to prevent memory leaks
  latestAssistantElement = null;
  stopVisibilityObservation = null;
  latestVisibility = getVisibilitySnapshot();

  console.warn(`[ChatGPT Done Notifier] Observer stopped: ${reason}`);
}

async function safeSendRuntimeMessage(message: unknown): Promise<void> {
  if (observerStopped) {
    return;
  }

  try {
    await chrome.runtime.sendMessage(message);
  } catch (error: unknown) {
    if (isContextInvalidatedError(error)) {
      stopObserver('extension context invalidated');
      return;
    }

    throw error;
  }
}

function sendStatus(payload: ObserverStatusPayload): void {
  void safeSendRuntimeMessage({
    type: 'observer/status',
    payload
  });
}

function logContent(event: string, details?: string, level: 'info' | 'warn' | 'error' = 'info'): void {
  void safeSendRuntimeMessage({
    type: 'runtime/log',
    payload: {
      source: 'content',
      level,
      event,
      details
    }
  });
}

const stateMachine = new GenerationStateMachine({
  onStateChange: (state, cycle) => {
    logContent('observer_state_changed', `state=${state} cycle=${cycle.cycleId} reason=${cycle.completionReason ?? 'none'}`);
    sendStatus({
      pageSessionId,
      locationHref: window.location.href,
      state,
      cycle,
      visibility: latestVisibility,
      sentAt: Date.now()
    });
  },
  onActiveCycleChange: (isActive) => {
    logContent('active_cycle_toggled', `active=${isActive}`);
    if (isActive) {
      startActivePolling();
      return;
    }

    stopActivePolling();
  }
});

function collectRelevantMutationFlag(mutations: MutationRecord[]): boolean {
  if (observerStopped) {
    return false;
  }

  return mutations.some((mutation) => {
    const target = mutation.target instanceof Node ? mutation.target : null;
    if (!target || !latestAssistantElement) {
      return false;
    }

    return latestAssistantElement.contains(target);
  });
}

function runObservation(assistantMutation: boolean): void {
  if (observerStopped) {
    return;
  }

  latestAssistantElement = findLatestAssistantTurn(document);
  const snapshot = inspectChatGptDom(document);
  stateMachine.consumeObservation(snapshot, assistantMutation);
}

function startActivePolling(): void {
  if (activePollTimer !== null) {
    return;
  }

  activePollTimer = window.setInterval(() => {
    runObservation(false);
  }, ACTIVE_POLL_INTERVAL_MS);
}

function stopActivePolling(): void {
  if (activePollTimer === null) {
    return;
  }

  window.clearInterval(activePollTimer);
  activePollTimer = null;
}

const mutationObserver = new MutationObserver((mutations) => {
  if (observerStopped) {
    return;
  }

  const assistantMutation = collectRelevantMutationFlag(mutations);
  runObservation(assistantMutation);
});

function handleVisibilityChange(snapshot: VisibilitySnapshot): void {
  if (observerStopped) {
    return;
  }

  latestVisibility = snapshot;
  sendStatus({
    pageSessionId,
    locationHref: window.location.href,
    state: stateMachine.getState(),
    cycle: stateMachine.getCycle(),
    visibility: latestVisibility,
    sentAt: Date.now()
  });
}

document.addEventListener(
  'click',
  (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }

    const clickedButton = target.closest<HTMLElement>('button, [role="button"]');
    if (!clickedButton) {
      return;
    }

    const buttonText = (clickedButton.innerText || clickedButton.textContent || '').toLowerCase();
    const label = (clickedButton.getAttribute('aria-label') || clickedButton.getAttribute('title') || '').toLowerCase();
    if (buttonText.includes('stop') || label.includes('stop')) {
      logContent('manual_stop_clicked', 'The user clicked a stop-like button.');
      stateMachine.noteStopClick();
    }
  },
  true
);

mutationObserver.observe(document.documentElement, {
  subtree: true,
  childList: true,
  characterData: true,
  attributes: true,
  attributeFilter: ['aria-label', 'title', 'data-testid']
});

stopVisibilityObservation = observeVisibility(handleVisibilityChange);
logContent('observer_started', `href=${window.location.href}`);
runObservation(false);
handleVisibilityChange(latestVisibility);

window.addEventListener('beforeunload', () => {
  logContent('observer_stopped', 'Content observer is unloading.');
  stopObserver('page unload');
});
