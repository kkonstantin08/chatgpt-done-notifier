import {
  COMPLETION_STABILIZATION_MS,
  MANUAL_STOP_GRACE_MS,
  STREAMING_IDLE_GRACE_MS,
  createEmptyCycleSnapshot
} from '../shared/constants';
import type { DomInspectionSnapshot, GenerationCycleSnapshot, ObserverState } from '../shared/types';

interface StateMachineHooks {
  onStateChange: (state: ObserverState, cycle: GenerationCycleSnapshot) => void;
  onActiveCycleChange: (isActive: boolean) => void;
}

function cloneCycle(cycle: GenerationCycleSnapshot): GenerationCycleSnapshot {
  return JSON.parse(JSON.stringify(cycle)) as GenerationCycleSnapshot;
}

export class GenerationStateMachine {
  private state: ObserverState = 'idle';
  private cycle = createEmptyCycleSnapshot(0);
  private initialized = false;
  private completionTimer: number | null = null;
  private recentStopClickAt: number | null = null;

  constructor(private readonly hooks: StateMachineHooks) {}

  getState(): ObserverState {
    return this.state;
  }

  getCycle(): GenerationCycleSnapshot {
    return cloneCycle(this.cycle);
  }

  isCycleActive(): boolean {
    return this.state === 'generation_detected' || this.state === 'actively_generating';
  }

  noteStopClick(timestamp = Date.now()): void {
    this.recentStopClickAt = timestamp;
  }

  dispose(): void {
    this.clearCompletionTimer();
  }

  consumeObservation(snapshot: DomInspectionSnapshot, assistantMutation: boolean): void {
    if (!this.initialized) {
      this.initialized = true;

      if (snapshot.stopButtonPresent) {
        this.startNewCycle(snapshot);
      } else {
        this.updateAssistantFingerprint(snapshot);
      }

      return;
    }

    if (snapshot.errorPresent && this.isCycleActive()) {
      this.cycle.hadError = true;
      this.cycle.completionReason = 'error';
      this.transition('error_state', snapshot.observedAt);
      return;
    }

    if (snapshot.stopButtonPresent) {
      this.clearCompletionTimer();

      if (!this.isCycleActive()) {
        this.startNewCycle(snapshot);
      } else {
        this.cycle.sawStopButton = true;
        this.cycle.stopSeenAt ??= snapshot.observedAt;
        this.cycle.stopButtonSignature = snapshot.stopButtonSignature;
      }

      if (assistantMutation || this.fingerprintChanged(snapshot)) {
        this.recordActivity(snapshot, assistantMutation);
      } else {
        this.updateAssistantFingerprint(snapshot);
      }

      return;
    }

    if (assistantMutation && this.isCycleActive()) {
      this.clearCompletionTimer();
      this.recordActivity(snapshot, true);
      return;
    }

    if (!this.isCycleActive()) {
      this.updateAssistantFingerprint(snapshot);
      return;
    }

    if (this.fingerprintChanged(snapshot)) {
      this.clearCompletionTimer();
      this.recordActivity(snapshot, false);

      if (this.canComplete(snapshot)) {
        this.armCompletionTimer();
      }

      return;
    }

    if (this.wasManualStop(snapshot.observedAt)) {
      this.cycle.manualStop = true;
      this.cycle.completedAt = snapshot.observedAt;
      this.cycle.completionReason = 'manual_stop';
      this.transition('user_stopped', snapshot.observedAt);
      return;
    }

    if (this.canComplete(snapshot)) {
      this.armCompletionTimer();
    }
  }

  private updateAssistantFingerprint(snapshot: DomInspectionSnapshot): void {
    this.cycle.assistantFingerprint = snapshot.assistantFingerprint;
  }

  private fingerprintChanged(snapshot: DomInspectionSnapshot): boolean {
    if (!snapshot.assistantFingerprint) {
      return false;
    }

    return snapshot.assistantFingerprint !== this.cycle.assistantFingerprint;
  }

  private startNewCycle(snapshot: DomInspectionSnapshot): void {
    this.clearCompletionTimer();
    const nextCycleId = this.cycle.cycleId + 1;
    this.cycle = createEmptyCycleSnapshot(nextCycleId);
    this.recentStopClickAt = null;
    this.cycle.startedAt = snapshot.observedAt;
    this.cycle.sawStopButton = true;
    this.cycle.stopSeenAt = snapshot.observedAt;
    this.cycle.stopButtonSignature = snapshot.stopButtonSignature;
    this.cycle.initialAssistantFingerprint = snapshot.assistantFingerprint;
    this.cycle.assistantFingerprint = snapshot.assistantFingerprint;
    this.transition('generation_detected', snapshot.observedAt);
  }

  private recordActivity(snapshot: DomInspectionSnapshot, assistantMutation: boolean): void {
    const fingerprintAdvanced =
      Boolean(snapshot.assistantFingerprint) &&
      snapshot.assistantFingerprint !== this.cycle.initialAssistantFingerprint;

    this.cycle.sawAssistantActivity =
      this.cycle.sawAssistantActivity ||
      fingerprintAdvanced ||
      assistantMutation ||
      (!this.cycle.initialAssistantFingerprint && snapshot.assistantTurnPresent);
    this.cycle.sawStreamingMutation = this.cycle.sawStreamingMutation || assistantMutation;
    this.cycle.lastActivityAt = snapshot.observedAt;
    this.cycle.assistantFingerprint = snapshot.assistantFingerprint;

    if (this.state === 'generation_detected') {
      this.transition('actively_generating', snapshot.observedAt);
    }
  }

  private canComplete(snapshot: DomInspectionSnapshot): boolean {
    if (!this.cycle.sawStopButton) {
      return false;
    }

    if (!this.cycle.sawAssistantActivity && !this.cycle.sawStreamingMutation) {
      return false;
    }

    if (snapshot.errorPresent || this.cycle.hadError || this.cycle.manualStop) {
      return false;
    }

    if (this.cycle.lastActivityAt && snapshot.observedAt - this.cycle.lastActivityAt < STREAMING_IDLE_GRACE_MS) {
      return false;
    }

    return true;
  }

  private wasManualStop(timestamp: number): boolean {
    return this.recentStopClickAt !== null && timestamp - this.recentStopClickAt <= MANUAL_STOP_GRACE_MS;
  }

  private armCompletionTimer(): void {
    if (this.completionTimer !== null) {
      return;
    }

    this.completionTimer = window.setTimeout(() => {
      this.completionTimer = null;

      if (!this.isCycleActive()) {
        return;
      }

      this.cycle.completedAt = Date.now();
      this.cycle.completionReason = 'natural';
      this.transition('generation_completed', this.cycle.completedAt);
    }, COMPLETION_STABILIZATION_MS);
  }

  private clearCompletionTimer(): void {
    if (this.completionTimer !== null) {
      window.clearTimeout(this.completionTimer);
      this.completionTimer = null;
    }
  }

  private transition(nextState: ObserverState, timestamp: number): void {
    const wasActive = this.isCycleActive();
    this.state = nextState;
    const isActive = this.isCycleActive();

    if (wasActive !== isActive) {
      this.hooks.onActiveCycleChange(isActive);
    }

    if (nextState === 'error_state') {
      this.cycle.completedAt = timestamp;
    }

    if (nextState === 'generation_completed' || nextState === 'user_stopped' || nextState === 'error_state') {
      this.recentStopClickAt = null;
    }

    this.hooks.onStateChange(this.state, this.getCycle());
  }
}
