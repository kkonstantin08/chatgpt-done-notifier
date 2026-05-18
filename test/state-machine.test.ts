import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GenerationStateMachine } from '../src/content/state-machine';
import type { DomInspectionSnapshot, ObserverState, GenerationCycleSnapshot } from '../src/shared/types';

describe('GenerationStateMachine', () => {
  let stateMachine: GenerationStateMachine;
  let stateChanges: Array<{ state: ObserverState; cycle: GenerationCycleSnapshot }>;
  let activeCycleChanges: boolean[];

  beforeEach(() => {
    stateChanges = [];
    activeCycleChanges = [];

    stateMachine = new GenerationStateMachine({
      onStateChange: (state, cycle) => {
        stateChanges.push({ state, cycle });
      },
      onActiveCycleChange: (isActive) => {
        activeCycleChanges.push(isActive);
      }
    });
  });

  const createSnapshot = (overrides: Partial<DomInspectionSnapshot> = {}): DomInspectionSnapshot => ({
    observedAt: Date.now(),
    stopButtonPresent: false,
    stopButtonSignature: null,
    assistantFingerprint: null,
    assistantTurnPresent: false,
    errorPresent: false,
    ...overrides
  });

  describe('initialization', () => {
    it('should start in idle state', () => {
      expect(stateMachine.getState()).toBe('idle');
      expect(stateMachine.isCycleActive()).toBe(false);
    });

    it('should start new cycle when stop button present on first observation', () => {
      const snapshot = createSnapshot({
        stopButtonPresent: true,
        stopButtonSignature: 'stop|stop generating'
      });

      stateMachine.consumeObservation(snapshot, false);

      expect(stateMachine.getState()).toBe('generation_detected');
      expect(stateMachine.isCycleActive()).toBe(true);
      expect(stateChanges).toHaveLength(1);
      expect(activeCycleChanges).toEqual([true]);
    });

    it('should stay idle when no stop button on first observation', () => {
      const snapshot = createSnapshot();
      stateMachine.consumeObservation(snapshot, false);

      expect(stateMachine.getState()).toBe('idle');
      expect(stateChanges).toHaveLength(0);
    });
  });

  describe('state transitions', () => {
    it('should transition from generation_detected to actively_generating on activity', () => {
      // Start cycle
      stateMachine.consumeObservation(createSnapshot({
        stopButtonPresent: true,
        assistantFingerprint: 'fp1'
      }), false);

      expect(stateMachine.getState()).toBe('generation_detected');

      // Activity detected
      stateMachine.consumeObservation(createSnapshot({
        stopButtonPresent: true,
        assistantFingerprint: 'fp2' // Changed fingerprint
      }), false);

      expect(stateMachine.getState()).toBe('actively_generating');
    });

    it('should transition to generation_completed after stabilization', async () => {
      // Start cycle
      stateMachine.consumeObservation(createSnapshot({
        stopButtonPresent: true,
        assistantFingerprint: 'fp1'
      }), false);

      // Activity
      stateMachine.consumeObservation(createSnapshot({
        stopButtonPresent: true,
        assistantFingerprint: 'fp2'
      }), true);

      expect(stateMachine.getState()).toBe('actively_generating');

      // Wait for streaming idle grace period
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Stop button disappears
      stateMachine.consumeObservation(createSnapshot({
        stopButtonPresent: false,
        assistantFingerprint: 'fp2'
      }), false);

      // Should still be actively_generating (waiting for stabilization)
      expect(stateMachine.getState()).toBe('actively_generating');

      // Wait for stabilization timer (1400ms)
      await new Promise(resolve => setTimeout(resolve, 1500));

      expect(stateMachine.getState()).toBe('generation_completed');
      expect(stateMachine.isCycleActive()).toBe(false);
    });

    it('should transition to error_state when error detected during active cycle', () => {
      // Start cycle
      stateMachine.consumeObservation(createSnapshot({
        stopButtonPresent: true,
        assistantFingerprint: 'fp1'
      }), false);

      // Error occurs
      stateMachine.consumeObservation(createSnapshot({
        errorPresent: true
      }), false);

      expect(stateMachine.getState()).toBe('error_state');
      expect(stateMachine.isCycleActive()).toBe(false);

      const cycle = stateMachine.getCycle();
      expect(cycle.hadError).toBe(true);
      expect(cycle.completionReason).toBe('error');
    });

    it('should transition to user_stopped on manual stop', () => {
      // Start cycle
      stateMachine.consumeObservation(createSnapshot({
        stopButtonPresent: true,
        assistantFingerprint: 'fp1'
      }), false);

      // Activity
      stateMachine.consumeObservation(createSnapshot({
        stopButtonPresent: true,
        assistantFingerprint: 'fp2'
      }), true);

      // User clicks stop
      stateMachine.noteStopClick();

      // Stop button disappears
      stateMachine.consumeObservation(createSnapshot({
        stopButtonPresent: false,
        assistantFingerprint: 'fp2'
      }), false);

      expect(stateMachine.getState()).toBe('user_stopped');
      expect(stateMachine.getCycle().manualStop).toBe(true);
      expect(stateMachine.getCycle().completionReason).toBe('manual_stop');
    });
  });

  describe('cycle tracking', () => {
    it('should increment cycle ID on new cycle', async () => {
      const snapshot = createSnapshot({ stopButtonPresent: true });

      stateMachine.consumeObservation(snapshot, false);
      const cycle1 = stateMachine.getCycle();

      // Complete cycle with activity
      stateMachine.consumeObservation(createSnapshot({
        stopButtonPresent: true,
        assistantFingerprint: 'fp1'
      }), true);

      // Wait for streaming idle grace
      await new Promise(resolve => setTimeout(resolve, 1000));

      stateMachine.consumeObservation(createSnapshot({
        stopButtonPresent: false,
        assistantFingerprint: 'fp1'
      }), false);

      // Wait for completion
      await new Promise(resolve => setTimeout(resolve, 1500));

      // Start new cycle
      stateMachine.consumeObservation(createSnapshot({ stopButtonPresent: true }), false);
      const cycle2 = stateMachine.getCycle();

      expect(cycle2.cycleId).toBe(cycle1.cycleId + 1);
    });

    it('should track stop button signature', () => {
      stateMachine.consumeObservation(createSnapshot({
        stopButtonPresent: true,
        stopButtonSignature: 'test-sig'
      }), false);

      const cycle = stateMachine.getCycle();
      expect(cycle.stopButtonSignature).toBe('test-sig');
      expect(cycle.sawStopButton).toBe(true);
    });

    it('should track assistant activity', () => {
      stateMachine.consumeObservation(createSnapshot({
        stopButtonPresent: true,
        assistantFingerprint: 'fp1'
      }), false);

      stateMachine.consumeObservation(createSnapshot({
        stopButtonPresent: true,
        assistantFingerprint: 'fp2'
      }), true);

      const cycle = stateMachine.getCycle();
      expect(cycle.sawAssistantActivity).toBe(true);
      expect(cycle.sawStreamingMutation).toBe(true);
    });

    it('should track timestamps', () => {
      const startTime = Date.now();

      stateMachine.consumeObservation(createSnapshot({
        stopButtonPresent: true,
        observedAt: startTime
      }), false);

      const cycle = stateMachine.getCycle();
      expect(cycle.startedAt).toBe(startTime);
      expect(cycle.stopSeenAt).toBe(startTime);
    });
  });

  describe('completion conditions', () => {
    it('should not complete without stop button seen', async () => {
      stateMachine.consumeObservation(createSnapshot({
        stopButtonPresent: false
      }), true);

      await new Promise(resolve => setTimeout(resolve, 1500));

      expect(stateMachine.getState()).toBe('idle');
    });

    it('should not complete without assistant activity', async () => {
      stateMachine.consumeObservation(createSnapshot({
        stopButtonPresent: true
      }), false);

      stateMachine.consumeObservation(createSnapshot({
        stopButtonPresent: false
      }), false);

      await new Promise(resolve => setTimeout(resolve, 1500));

      expect(stateMachine.getState()).toBe('generation_detected');
    });

    it('should not complete if error present', async () => {
      stateMachine.consumeObservation(createSnapshot({
        stopButtonPresent: true
      }), false);

      stateMachine.consumeObservation(createSnapshot({
        stopButtonPresent: true
      }), true);

      stateMachine.consumeObservation(createSnapshot({
        stopButtonPresent: false,
        errorPresent: true
      }), false);

      await new Promise(resolve => setTimeout(resolve, 1500));

      expect(stateMachine.getState()).toBe('error_state');
    });
  });

  describe('manual stop detection', () => {
    it('should detect manual stop within grace period', () => {
      stateMachine.consumeObservation(createSnapshot({
        stopButtonPresent: true
      }), false);

      stateMachine.consumeObservation(createSnapshot({
        stopButtonPresent: true
      }), true);

      const stopTime = Date.now();
      stateMachine.noteStopClick(stopTime);

      stateMachine.consumeObservation(createSnapshot({
        stopButtonPresent: false,
        observedAt: stopTime + 1000 // Within 3000ms grace period
      }), false);

      expect(stateMachine.getState()).toBe('user_stopped');
    });

    it('should not detect manual stop after grace period', async () => {
      stateMachine.consumeObservation(createSnapshot({
        stopButtonPresent: true
      }), false);

      stateMachine.consumeObservation(createSnapshot({
        stopButtonPresent: true
      }), true);

      const stopTime = Date.now();
      stateMachine.noteStopClick(stopTime);

      stateMachine.consumeObservation(createSnapshot({
        stopButtonPresent: false,
        observedAt: stopTime + 4000 // After 3000ms grace period
      }), false);

      await new Promise(resolve => setTimeout(resolve, 1500));

      expect(stateMachine.getState()).toBe('generation_completed');
    });
  });

  describe('dispose', () => {
    it('should clear completion timer on dispose', async () => {
      stateMachine.consumeObservation(createSnapshot({
        stopButtonPresent: true
      }), false);

      stateMachine.consumeObservation(createSnapshot({
        stopButtonPresent: true
      }), true);

      stateMachine.consumeObservation(createSnapshot({
        stopButtonPresent: false
      }), false);

      stateMachine.dispose();

      await new Promise(resolve => setTimeout(resolve, 1500));

      // Should not have transitioned to completed
      expect(stateMachine.getState()).toBe('actively_generating');
    });
  });
});
