export interface WalkthroughAction {
  type: 'highlight' | 'focus' | 'note';
  target?: string;
  message?: string;
}

export interface WalkthroughSegment {
  id: string;
  title?: string;
  text: string;
  durationEstimate: number;
  highlight?: string[];
  tooltip?: string;
  experimentSuggestion?: string;
  actions?: WalkthroughAction[];
  checkpoint?: string;
}

export interface WalkthroughConfig {
  title: string;
  description: string;
  language?: string;
  segments: WalkthroughSegment[];
}

export interface SerializableCameraState {
  position: [number, number, number];
  target: [number, number, number];
}

export interface SerializableSimulationState {
  time?: number;
  running?: boolean;
  landed?: boolean;
  parameters: Record<string, number | boolean | string>;
  controls?: Record<string, boolean | string | number>;
  camera?: SerializableCameraState;
  extra?: Record<string, unknown>;
}

export interface SimulationAPI {
  getState(): SerializableSimulationState;
  setState(state: SerializableSimulationState): void;
  getParameters(): Record<string, number | boolean | string>;
  setParameter(name: string, value: number | boolean | string): void;
  play(): void;
  pause(): void;
  reset(): void;
}

export interface WalkthroughSnapshot {
  id: string;
  timestamp: number; // walkthrough time in ms
  wallClock: number;
  segmentIndex: number;
  walkthroughSegment: string;
  reason: 'initial' | 'start' | 'segment' | 'pause' | 'seek' | 'stop' | 'interaction';
  simulation: SerializableSimulationState;
}

export interface WalkthroughInteractionEvent {
  time: number; // walkthrough time in ms
  wallClock: number;
  segmentIndex: number;
  segmentId: string;
  type: 'parameter-change' | 'control-toggle' | 'camera-change' | 'sim-action';
  target: string;
  previousValue?: unknown;
  newValue?: unknown;
  stateAfter?: SerializableSimulationState;
}

export type WalkthroughPlaybackStatus = 'ready' | 'playing' | 'paused' | 'completed';

export interface WalkthroughControllerState {
  status: WalkthroughPlaybackStatus;
  activeSegmentIndex: number;
  walkthroughTimeMs: number;
  totalDurationMs: number;
  speechRate: number;
  speechSupported: boolean;
  errorMessage?: string;
}
