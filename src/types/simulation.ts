export type AgentResponseType =
  | 'new_simulation'
  | 'code_modification'
  | 'bug_fix'
  | 'explanation'
  | 'clarification';

export interface AgentPatchDescriptor {
  section: string;
  description: string;
}

export interface AgentStructuredResponse {
  responseType: AgentResponseType;
  summary: string;
  educationalNotes?: string;
  physicsAssumptions?: string[];
  changedSections?: string[];
  clarificationQuestion?: string;
  html?: string;
  patches?: AgentPatchDescriptor[];
  providerId?: string;
  model?: string;
}

export interface SimulationMetadata {
  title: string;
  subject: string;
  topic: string;
  difficulty: string;
  simulationType: string;
  learningObjectives: string[];
  physicalModel: string[];
  governingEquations: string[];
  interactiveParameters: string[];
  visualElements: string[];
  simulationControls: string[];
  agentGuidance: string[];
  hasStructuredHeader: boolean;
  presentSections: number[];
}

export interface RuntimeDiagnostic {
  id: string;
  level: 'error' | 'warn' | 'info';
  message: string;
  source?: string;
  line?: number;
  column?: number;
  timestamp: number;
}

export interface SimulationVersion {
  id: string;
  versionNumber: number;
  description: string;
  html: string;
  createdAt: number;
  source: 'initial' | 'ai' | 'manual' | 'restore';
  metadata?: SimulationMetadata;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  createdAt: number;
  responseType?: AgentResponseType;
  changedSections?: string[];
  physicsAssumptions?: string[];
  educationalNotes?: string;
  clarificationQuestion?: string;
  versionId?: string;
  isError?: boolean;
}

export interface SimulationProject {
  id: string;
  title: string;
  subject: string;
  description: string;
  currentHtml: string;
  versions: SimulationVersion[];
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
}

export type LLMProviderId = 'gemini' | 'openai-compatible';

export interface StudioSettings {
  providerId: LLMProviderId;
  model: string;
  theme: 'light' | 'dark';
  autoSnapshot: boolean;
}

export interface ProviderOption {
  id: LLMProviderId;
  label: string;
  configured: boolean;
  defaultModel: string;
  availableModels: Array<{ id: string; label: string }>;
  description: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  hasThreeJs: boolean;
  hasMetadata: boolean;
  sectionCount: number;
}
