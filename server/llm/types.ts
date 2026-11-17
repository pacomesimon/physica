import type {
  AgentResponseType,
  AgentStructuredResponse,
  LLMProviderId,
  ProviderOption,
  RuntimeDiagnostic,
  SimulationMetadata,
} from '../../src/types/simulation.ts';

export interface ConversationTurn {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface AgentGenerateInput {
  instruction: string;
  conversation: ConversationTurn[];
  currentHtml: string;
  metadata: SimulationMetadata;
  runtimeErrors: RuntimeDiagnostic[];
  providerId?: LLMProviderId;
  model?: string;
}

export interface ProviderAdapter {
  readonly id: LLMProviderId;
  readonly label: string;
  readonly description: string;
  isConfigured(): boolean;
  getOptions(): ProviderOption;
  generate(input: AgentGenerateInput): Promise<AgentStructuredResponse>;
}

export function normalizeAgentResponse(
  raw: Record<string, unknown>,
  providerId: LLMProviderId,
  model: string
): AgentStructuredResponse {
  const allowedTypes: AgentResponseType[] = [
    'new_simulation',
    'code_modification',
    'bug_fix',
    'explanation',
    'clarification',
  ];

  const responseType = allowedTypes.includes(raw.responseType as AgentResponseType)
    ? (raw.responseType as AgentResponseType)
    : typeof raw.html === 'string' && raw.html.trim().length > 0
      ? 'code_modification'
      : 'explanation';

  const summary =
    typeof raw.summary === 'string' && raw.summary.trim().length > 0
      ? raw.summary.trim()
      : 'Processed simulation request.';

  const educationalNotes =
    typeof raw.educationalNotes === 'string' ? raw.educationalNotes.trim() : undefined;

  const clarificationQuestion =
    typeof raw.clarificationQuestion === 'string' && raw.clarificationQuestion.trim().length > 0
      ? raw.clarificationQuestion.trim()
      : undefined;

  const physicsAssumptions = Array.isArray(raw.physicsAssumptions)
    ? raw.physicsAssumptions.filter((x): x is string => typeof x === 'string')
    : [];

  const changedSections = Array.isArray(raw.changedSections)
    ? raw.changedSections.filter((x): x is string => typeof x === 'string')
    : [];

  const patches = Array.isArray(raw.patches)
    ? raw.patches
        .filter(
          (p): p is { section: string; description: string } =>
            typeof p === 'object' &&
            p !== null &&
            typeof (p as Record<string, unknown>).section === 'string' &&
            typeof (p as Record<string, unknown>).description === 'string'
        )
    : undefined;

  let html = typeof raw.html === 'string' ? raw.html.trim() : undefined;
  if (html) {
    html = html.replace(/^```html\s*/i, '').replace(/```\s*$/i, '').trim();
  }

  return {
    responseType,
    summary,
    educationalNotes,
    physicsAssumptions,
    changedSections,
    clarificationQuestion,
    html: html && html.length > 0 ? html : undefined,
    patches,
    providerId,
    model,
  };
}

export function parseJsonFromText(text: string): Record<string, unknown> {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed) as Record<string, unknown>;
  } catch {
    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenced?.[1]) {
      return JSON.parse(fenced[1].trim()) as Record<string, unknown>;
    }
    const firstBrace = trimmed.indexOf('{');
    const lastBrace = trimmed.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      return JSON.parse(trimmed.slice(firstBrace, lastBrace + 1)) as Record<string, unknown>;
    }
    throw new Error('Model response did not contain valid JSON.');
  }
}
