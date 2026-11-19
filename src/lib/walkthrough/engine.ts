import type {
  SerializableSimulationState,
  SimulationAPI,
  WalkthroughConfig,
  WalkthroughControllerState,
  WalkthroughInteractionEvent,
  WalkthroughPlaybackStatus,
  WalkthroughSegment,
  WalkthroughSnapshot,
} from './types.ts';

export interface SpeechSynthesisLike {
  speaking?: boolean;
  paused?: boolean;
  pending?: boolean;
  speak(utterance: SpeechUtteranceLike): void;
  pause(): void;
  resume(): void;
  cancel(): void;
  getVoices?(): Array<{ name?: string; lang?: string; default?: boolean }>;
  addEventListener?(type: string, listener: () => void): void;
  removeEventListener?(type: string, listener: () => void): void;
}

export interface SpeechUtteranceLike {
  text: string;
  lang: string;
  rate: number;
  pitch: number;
  volume: number;
  voice?: unknown;
  onstart: ((ev?: unknown) => void) | null;
  onend: ((ev?: unknown) => void) | null;
  onpause: ((ev?: unknown) => void) | null;
  onresume: ((ev?: unknown) => void) | null;
  onerror: ((ev?: { error?: string }) => void) | null;
}

export interface HighlightElementLike {
  classList: {
    add(cls: string): void;
    remove(cls: string): void;
    contains?(cls: string): boolean;
  };
  getBoundingClientRect?: () => {
    top: number;
    left: number;
    width: number;
    height: number;
    right: number;
    bottom: number;
  };
  style?: Record<string, string>;
}

export interface DocumentLike {
  querySelector(selector: string): HighlightElementLike | null;
  querySelectorAll(selector: string): Iterable<HighlightElementLike>;
}

export function cloneState<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

export function computeSegmentStartTimesMs(segments: WalkthroughSegment[]): number[] {
  const starts: number[] = [];
  let acc = 0;
  for (const seg of segments) {
    starts.push(acc);
    acc += Math.max(1, Number(seg.durationEstimate) || 10) * 1000;
  }
  return starts;
}

export function computeTotalDurationMs(segments: WalkthroughSegment[]): number {
  return segments.reduce(
    (sum, seg) => sum + Math.max(1, Number(seg.durationEstimate) || 10) * 1000,
    0
  );
}

/**
 * Reusable selector-based GUI highlighter that never blocks pointer interaction.
 */
export class HighlightManager {
  private doc: DocumentLike | null;
  private activeSelectors: string[] = [];

  constructor(doc: DocumentLike | null) {
    this.doc = doc;
  }

  highlightElement(selector: string): boolean {
    if (!this.doc || !selector) return false;
    try {
      const element = this.doc.querySelector(selector);
      if (!element) return false;
      element.classList.add('walkthrough-highlight');
      if (!this.activeSelectors.includes(selector)) {
        this.activeSelectors.push(selector);
      }
      return true;
    } catch {
      return false;
    }
  }

  highlightTargets(selectors: string[]): string[] {
    this.clearWalkthroughHighlights();
    const matched: string[] = [];
    for (const selector of selectors) {
      if (this.highlightElement(selector)) {
        matched.push(selector);
      }
    }
    return matched;
  }

  clearWalkthroughHighlights(): void {
    this.activeSelectors = [];
    if (!this.doc) return;
    try {
      const nodes = this.doc.querySelectorAll('.walkthrough-highlight');
      for (const el of nodes) {
        el.classList.remove('walkthrough-highlight');
      }
    } catch {
      // Gracefully ignore selector errors
    }
  }

  getActiveSelectors(): string[] {
    return [...this.activeSelectors];
  }
}

/**
 * Deterministic timeline state manager combining checkpoints and event-based interaction history.
 */
export class WalkthroughStateManager {
  public checkpoints: WalkthroughSnapshot[] = [];
  public history: WalkthroughInteractionEvent[] = [];
  private initialSnapshot: WalkthroughSnapshot | null = null;
  private pausedSnapshot: WalkthroughSnapshot | null = null;
  private simulationAPI: SimulationAPI;

  constructor(simulationAPI: SimulationAPI) {
    this.simulationAPI = simulationAPI;
  }

  captureInitialState(): WalkthroughSnapshot {
    const snap = this.createSnapshot(0, 0, 'initial', 'initial');
    this.initialSnapshot = snap;
    this.checkpoints = [snap];
    this.history = [];
    return snap;
  }

  getInitialSnapshot(): WalkthroughSnapshot | null {
    return this.initialSnapshot ? cloneState(this.initialSnapshot) : null;
  }

  captureSnapshot(
    walkthroughTimeMs: number,
    segmentIndex: number,
    segmentId: string,
    reason: WalkthroughSnapshot['reason']
  ): WalkthroughSnapshot {
    const snap = this.createSnapshot(walkthroughTimeMs, segmentIndex, segmentId, reason);
    if (reason === 'pause') {
      this.pausedSnapshot = snap;
    }
    if (reason === 'segment' || reason === 'start' || reason === 'initial') {
      // Replace existing checkpoint for same segmentIndex if re-entering, else append
      const existingIdx = this.checkpoints.findIndex(
        (cp) => cp.segmentIndex === segmentIndex && cp.reason === reason
      );
      if (existingIdx >= 0) {
        this.checkpoints[existingIdx] = snap;
      } else {
        this.checkpoints.push(snap);
      }
      this.checkpoints.sort((a, b) => a.timestamp - b.timestamp);
    }
    return snap;
  }

  recordInteraction(
    walkthroughTimeMs: number,
    segmentIndex: number,
    segmentId: string,
    event: Omit<WalkthroughInteractionEvent, 'time' | 'wallClock' | 'segmentIndex' | 'segmentId' | 'stateAfter'>
  ): WalkthroughInteractionEvent {
    const currentState = cloneState(this.simulationAPI.getState());
    const entry: WalkthroughInteractionEvent = {
      time: Math.max(0, Math.round(walkthroughTimeMs)),
      wallClock: Date.now(),
      segmentIndex,
      segmentId,
      type: event.type,
      target: event.target,
      previousValue: event.previousValue,
      newValue: event.newValue,
      stateAfter: currentState,
    };

    // If user interacted while paused, update pausedSnapshot so Resume preserves their edits
    if (this.pausedSnapshot) {
      this.pausedSnapshot = {
        ...this.pausedSnapshot,
        simulation: currentState,
        wallClock: Date.now(),
      };
    }

    this.history.push(entry);
    return entry;
  }

  /**
   * Deterministically reconstructs the simulation state at a target walkthrough time
   * using the latest checkpoint <= targetTimeMs plus all recorded interaction events
   * occurring between that checkpoint and targetTimeMs.
   */
  reconstructStateAt(targetTimeMs: number, targetSegmentIndex?: number): SerializableSimulationState | null {
    if (!this.initialSnapshot) return null;

    // Choose the latest checkpoint whose walkthrough timestamp is <= targetTimeMs
    // (and if targetSegmentIndex is given, never pick a checkpoint from a later segment).
    let baseCheckpoint = this.initialSnapshot;
    for (const cp of this.checkpoints) {
      const withinTime = cp.timestamp <= targetTimeMs;
      const withinSeg =
        targetSegmentIndex === undefined || cp.segmentIndex <= targetSegmentIndex;
      if (withinTime && withinSeg && cp.timestamp >= baseCheckpoint.timestamp) {
        baseCheckpoint = cp;
      }
    }

    let reconstructed = cloneState(baseCheckpoint.simulation);

    const relevantEvents = this.history
      .filter((ev) => ev.time > baseCheckpoint.timestamp && ev.time <= targetTimeMs)
      .sort((a, b) => a.time - b.time);

    for (const ev of relevantEvents) {
      if (ev.type === 'parameter-change' && ev.newValue !== undefined) {
        reconstructed.parameters = {
          ...reconstructed.parameters,
          [ev.target]: ev.newValue as number | boolean | string,
        };
      } else if (ev.type === 'control-toggle' && ev.newValue !== undefined) {
        reconstructed.controls = {
          ...(reconstructed.controls || {}),
          [ev.target]: ev.newValue as number | boolean | string,
        };
        if (reconstructed.parameters && ev.target in reconstructed.parameters) {
          reconstructed.parameters = {
            ...reconstructed.parameters,
            [ev.target]: ev.newValue as number | boolean | string,
          };
        }
      } else if (ev.type === 'camera-change' && ev.stateAfter?.camera) {
        reconstructed.camera = cloneState(ev.stateAfter.camera);
      } else if (ev.stateAfter) {
        reconstructed = cloneState(ev.stateAfter);
      }
    }

    return reconstructed;
  }

  restoreForSeek(targetTimeMs: number, targetSegmentIndex?: number): SerializableSimulationState | null {
    const state = this.reconstructStateAt(targetTimeMs, targetSegmentIndex);
    if (state) {
      this.simulationAPI.setState(state);
    }
    return state;
  }

  restorePausedState(): SerializableSimulationState | null {
    if (!this.pausedSnapshot) return null;
    const state = cloneState(this.pausedSnapshot.simulation);
    this.simulationAPI.setState(state);
    return state;
  }

  restoreInitialState(): SerializableSimulationState | null {
    if (!this.initialSnapshot) return null;
    this.pausedSnapshot = null;
    const state = cloneState(this.initialSnapshot.simulation);
    this.simulationAPI.setState(state);
    return state;
  }

  private createSnapshot(
    walkthroughTimeMs: number,
    segmentIndex: number,
    segmentId: string,
    reason: WalkthroughSnapshot['reason']
  ): WalkthroughSnapshot {
    return {
      id: `cp-${reason}-${segmentIndex}-${Date.now()}`,
      timestamp: Math.max(0, Math.round(walkthroughTimeMs)),
      wallClock: Date.now(),
      segmentIndex,
      walkthroughSegment: segmentId,
      reason,
      simulation: cloneState(this.simulationAPI.getState()),
    };
  }
}

export interface WalkthroughControllerOptions {
  config: WalkthroughConfig;
  simulationAPI: SimulationAPI;
  speechSynthesis?: SpeechSynthesisLike | null;
  createUtterance?: (text: string) => SpeechUtteranceLike;
  document?: DocumentLike | null;
  onStateChange?: (state: WalkthroughControllerState) => void;
  speechRate?: number;
  pitch?: number;
  volume?: number;
}

/**
 * Reusable Guided Walkthrough Playback Controller coordinating Speech Synthesis,
 * Transcript Progress, Dynamic Highlighting, and Deterministic Simulation State Sync.
 */
export class WalkthroughController {
  public readonly config: WalkthroughConfig;
  public readonly stateManager: WalkthroughStateManager;
  public readonly highlighter: HighlightManager;

  private speech: SpeechSynthesisLike | null;
  private createUtterance: ((text: string) => SpeechUtteranceLike) | null;
  private onStateChange?: (state: WalkthroughControllerState) => void;

  private segmentStartsMs: number[];
  private totalDurationMs: number;

  private status: WalkthroughPlaybackStatus = 'ready';
  private activeSegmentIndex = -1;
  private walkthroughTimeMs = 0;
  private speechRate: number;
  private pitch: number;
  private volume: number;
  private errorMessage: string | undefined;

  private utteranceToken = 0;
  private currentUtterance: SpeechUtteranceLike | null = null;
  private silentTimer: ReturnType<typeof setTimeout> | null = null;
  private progressTimer: ReturnType<typeof setInterval> | null = null;
  private segmentPlayStartedWallMs = 0;
  private segmentElapsedBeforePauseMs = 0;

  constructor(options: WalkthroughControllerOptions) {
    this.config = options.config;
    this.speech = options.speechSynthesis ?? null;
    this.createUtterance = options.createUtterance ?? null;
    this.onStateChange = options.onStateChange;
    this.speechRate = options.speechRate ?? 1.0;
    this.pitch = options.pitch ?? 1.0;
    this.volume = options.volume ?? 1.0;

    this.stateManager = new WalkthroughStateManager(options.simulationAPI);
    this.highlighter = new HighlightManager(options.document ?? null);

    this.segmentStartsMs = computeSegmentStartTimesMs(this.config.segments);
    this.totalDurationMs = computeTotalDurationMs(this.config.segments);

    this.stateManager.captureInitialState();
  }

  getState(): WalkthroughControllerState {
    return {
      status: this.status,
      activeSegmentIndex: this.activeSegmentIndex,
      walkthroughTimeMs: this.walkthroughTimeMs,
      totalDurationMs: this.totalDurationMs,
      speechRate: this.speechRate,
      speechSupported: Boolean(this.speech && this.createUtterance),
      errorMessage: this.errorMessage,
    };
  }

  setSpeechRate(rate: number): void {
    const clamped = Math.min(2.0, Math.max(0.5, Number(rate) || 1.0));
    this.speechRate = clamped;
    if (this.status === 'playing' && this.activeSegmentIndex >= 0) {
      this.speakSegment(this.activeSegmentIndex, false);
    }
    this.emitState();
  }

  play(): void {
    if (this.config.segments.length === 0) return;

    // Idempotent if already playing
    if (this.status === 'playing') return;

    if (this.status === 'paused' && this.activeSegmentIndex >= 0) {
      this.resume();
      return;
    }

    // Starting fresh from ready or completed
    const startIdx = 0;
    this.errorMessage = undefined;
    this.status = 'playing';
    this.activeSegmentIndex = startIdx;
    this.walkthroughTimeMs = 0;
    this.segmentElapsedBeforePauseMs = 0;

    const seg = this.config.segments[startIdx];
    this.stateManager.captureSnapshot(0, startIdx, seg.id, 'start');
    this.applySegmentVisuals(seg);
    this.speakSegment(startIdx, true);
    this.emitState();
  }

  pause(): void {
    if (this.status !== 'playing') return;

    this.status = 'paused';
    this.stopTimers();
    this.segmentElapsedBeforePauseMs += Math.max(0, Date.now() - this.segmentPlayStartedWallMs);

    const seg = this.config.segments[this.activeSegmentIndex];
    if (seg) {
      this.stateManager.captureSnapshot(
        this.walkthroughTimeMs,
        this.activeSegmentIndex,
        seg.id,
        'pause'
      );
    }

    if (this.speech && this.speech.speaking && !this.speech.paused) {
      try {
        this.speech.pause();
      } catch {
        // Fallback if pause throws in a restricted browser
      }
    }

    this.emitState();
  }

  resume(): void {
    if (this.status !== 'paused' || this.activeSegmentIndex < 0) return;

    this.status = 'playing';
    this.errorMessage = undefined;

    // Preserve any student modifications made before or during pause
    this.stateManager.restorePausedState();
    const seg = this.config.segments[this.activeSegmentIndex];
    if (seg) {
      this.applySegmentVisuals(seg);
    }

    this.segmentPlayStartedWallMs = Date.now();
    this.startProgressTicker();

    if (this.speech && this.speech.paused) {
      try {
        this.speech.resume();
      } catch {
        this.speakSegment(this.activeSegmentIndex, false);
      }
    } else if (this.speech && this.createUtterance) {
      this.speakSegment(this.activeSegmentIndex, false);
    } else {
      this.scheduleSilentAdvance(this.activeSegmentIndex);
    }

    this.emitState();
  }

  stop(): void {
    this.utteranceToken += 1;
    this.stopTimers();
    this.cancelSpeech();
    this.highlighter.clearWalkthroughHighlights();

    this.status = 'ready';
    this.activeSegmentIndex = -1;
    this.walkthroughTimeMs = 0;
    this.segmentElapsedBeforePauseMs = 0;
    this.errorMessage = undefined;

    this.stateManager.restoreInitialState();
    this.emitState();
  }

  replayCurrentSegment(): void {
    const idx = this.activeSegmentIndex >= 0 ? this.activeSegmentIndex : 0;
    this.seekToSegment(idx, true);
  }

  seekToSegment(index: number, autoPlay = true): void {
    if (index < 0 || index >= this.config.segments.length) return;

    this.utteranceToken += 1;
    this.stopTimers();
    this.cancelSpeech();

    const targetTimeMs = this.segmentStartsMs[index] ?? 0;
    this.activeSegmentIndex = index;
    this.walkthroughTimeMs = targetTimeMs;
    this.segmentElapsedBeforePauseMs = 0;
    this.errorMessage = undefined;

    // Deterministically reconstruct state for the target walkthrough point
    this.stateManager.restoreForSeek(targetTimeMs, index);

    const seg = this.config.segments[index];
    this.applySegmentVisuals(seg);

    if (autoPlay) {
      this.status = 'playing';
      this.speakSegment(index, false);
    } else {
      this.status = 'paused';
      this.stateManager.captureSnapshot(targetTimeMs, index, seg.id, 'pause');
    }

    this.emitState();
  }

  seekToProgress(ratio: number): void {
    if (this.config.segments.length === 0) return;
    const clamped = Math.min(1, Math.max(0, ratio));
    const targetMs = clamped * this.totalDurationMs;

    let targetIndex = 0;
    for (let i = 0; i < this.segmentStartsMs.length; i++) {
      if (this.segmentStartsMs[i] <= targetMs) {
        targetIndex = i;
      }
    }
    this.seekToSegment(targetIndex, this.status === 'playing' || this.status === 'ready');
  }

  recordInteraction(
    event: Omit<WalkthroughInteractionEvent, 'time' | 'wallClock' | 'segmentIndex' | 'segmentId' | 'stateAfter'>
  ): WalkthroughInteractionEvent {
    const segIdx = this.activeSegmentIndex >= 0 ? this.activeSegmentIndex : 0;
    const segId = this.config.segments[segIdx]?.id ?? 'initial';
    return this.stateManager.recordInteraction(this.walkthroughTimeMs, segIdx, segId, event);
  }

  dispose(): void {
    this.utteranceToken += 1;
    this.stopTimers();
    this.cancelSpeech();
    this.highlighter.clearWalkthroughHighlights();
  }

  private applySegmentVisuals(segment: WalkthroughSegment): void {
    const selectors = new Set<string>(segment.highlight || []);
    if (Array.isArray(segment.actions)) {
      for (const action of segment.actions) {
        if (action.type === 'highlight' && action.target) {
          selectors.add(action.target);
        }
      }
    }
    this.highlighter.highlightTargets(Array.from(selectors));
  }

  private speakSegment(index: number, captureCheckpoint: boolean): void {
    const seg = this.config.segments[index];
    if (!seg) return;

    this.utteranceToken += 1;
    const token = this.utteranceToken;
    this.stopTimers();
    this.cancelSpeech();

    this.segmentPlayStartedWallMs = Date.now();
    this.segmentElapsedBeforePauseMs = 0;

    if (captureCheckpoint) {
      this.stateManager.captureSnapshot(this.walkthroughTimeMs, index, seg.id, 'segment');
    }

    this.startProgressTicker();

    if (!this.speech || !this.createUtterance) {
      this.scheduleSilentAdvance(index);
      return;
    }

    const utterance = this.createUtterance(seg.text);
    utterance.lang = this.config.language || 'en-US';
    utterance.rate = this.speechRate;
    utterance.pitch = this.pitch;
    utterance.volume = this.volume;

    // Pick best matching voice if available
    if (typeof this.speech.getVoices === 'function') {
      const voices = this.speech.getVoices() || [];
      const langPrefix = (this.config.language || 'en-US').toLowerCase().split('-')[0];
      const match =
        voices.find((v) => v.lang?.toLowerCase() === (this.config.language || 'en-US').toLowerCase()) ||
        voices.find((v) => v.lang?.toLowerCase().startsWith(langPrefix)) ||
        voices[0];
      if (match) {
        utterance.voice = match;
      }
    }

    utterance.onstart = () => {
      if (token !== this.utteranceToken) return;
      this.segmentPlayStartedWallMs = Date.now();
      this.emitState();
    };

    utterance.onpause = () => {
      if (token !== this.utteranceToken) return;
      this.emitState();
    };

    utterance.onresume = () => {
      if (token !== this.utteranceToken) return;
      this.segmentPlayStartedWallMs = Date.now();
      this.emitState();
    };

    utterance.onend = () => {
      if (token !== this.utteranceToken || this.status !== 'playing') return;
      this.advanceToNextSegment();
    };

    utterance.onerror = (ev) => {
      if (token !== this.utteranceToken) return;
      const code = ev?.error || 'speech-error';
      if (code === 'canceled' || code === 'interrupted') {
        return;
      }
      this.errorMessage = `Speech synthesis error (${code}). Continuing in silent transcript mode.`;
      this.emitState();
      this.scheduleSilentAdvance(index);
    };

    this.currentUtterance = utterance;
    try {
      this.speech.speak(utterance);
    } catch {
      this.errorMessage = 'Speech synthesis failed to start. Continuing in silent transcript mode.';
      this.emitState();
      this.scheduleSilentAdvance(index);
    }
  }

  private advanceToNextSegment(): void {
    const nextIdx = this.activeSegmentIndex + 1;
    if (nextIdx >= this.config.segments.length) {
      this.stopTimers();
      this.status = 'completed';
      this.walkthroughTimeMs = this.totalDurationMs;
      this.highlighter.clearWalkthroughHighlights();
      this.emitState();
      return;
    }

    this.activeSegmentIndex = nextIdx;
    this.walkthroughTimeMs = this.segmentStartsMs[nextIdx] ?? this.walkthroughTimeMs;
    const nextSeg = this.config.segments[nextIdx];
    this.applySegmentVisuals(nextSeg);
    this.speakSegment(nextIdx, true);
    this.emitState();
  }

  private scheduleSilentAdvance(index: number): void {
    const seg = this.config.segments[index];
    if (!seg) return;
    const token = this.utteranceToken;
    const fullMs = (Math.max(1, seg.durationEstimate) * 1000) / Math.max(0.5, this.speechRate);
    const remainingMs = Math.max(150, fullMs - this.segmentElapsedBeforePauseMs);

    this.silentTimer = setTimeout(() => {
      if (token !== this.utteranceToken || this.status !== 'playing') return;
      this.advanceToNextSegment();
    }, remainingMs);
  }

  private startProgressTicker(): void {
    if (this.progressTimer) clearInterval(this.progressTimer);
    this.progressTimer = setInterval(() => {
      if (this.status !== 'playing' || this.activeSegmentIndex < 0) return;
      const seg = this.config.segments[this.activeSegmentIndex];
      if (!seg) return;
      const segStart = this.segmentStartsMs[this.activeSegmentIndex] ?? 0;
      const segDurationMs = Math.max(1, seg.durationEstimate) * 1000;
      const elapsedInSeg =
        (this.segmentElapsedBeforePauseMs + (Date.now() - this.segmentPlayStartedWallMs)) *
        this.speechRate;
      const clampedInSeg = Math.min(segDurationMs * 0.98, Math.max(0, elapsedInSeg));
      this.walkthroughTimeMs = Math.min(this.totalDurationMs, segStart + clampedInSeg);
      this.emitState();
    }, 250);
  }

  private stopTimers(): void {
    if (this.silentTimer) {
      clearTimeout(this.silentTimer);
      this.silentTimer = null;
    }
    if (this.progressTimer) {
      clearInterval(this.progressTimer);
      this.progressTimer = null;
    }
  }

  private cancelSpeech(): void {
    this.currentUtterance = null;
    if (this.speech) {
      try {
        this.speech.cancel();
      } catch {
        // Ignore cancel failures
      }
    }
  }

  private emitState(): void {
    if (this.onStateChange) {
      this.onStateChange(this.getState());
    }
  }
}
