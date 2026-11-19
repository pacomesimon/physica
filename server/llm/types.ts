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

export const CODE_PRODUCING_RESPONSE_TYPES: ReadonlySet<AgentResponseType> = new Set([
  'new_simulation',
  'code_modification',
  'bug_fix',
]);

export function cleanHtmlString(raw: string): string {
  return raw
    .trim()
    .replace(/^```html\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();
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

  let html = typeof raw.html === 'string' ? cleanHtmlString(raw.html) : undefined;
  if (html && html.length === 0) {
    html = undefined;
  }

  const responseType = allowedTypes.includes(raw.responseType as AgentResponseType)
    ? (raw.responseType as AgentResponseType)
    : html
      ? 'code_modification'
      : 'explanation';

  const summary =
    typeof raw.summary === 'string' && raw.summary.trim().length > 0
      ? raw.summary.trim()
      : 'Processed simulation request.';

  const educationalNotes =
    typeof raw.educationalNotes === 'string' && raw.educationalNotes.trim().length > 0
      ? raw.educationalNotes.trim()
      : undefined;

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

  return {
    responseType,
    summary,
    educationalNotes,
    physicsAssumptions,
    changedSections,
    clarificationQuestion,
    html,
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

/**
 * Parses either the primary delimited envelope:
 *   <<<AGENT_JSON>>> ... <<<END_AGENT_JSON>>>
 *   <<<SIMULATION_HTML>>> ... <<<END_SIMULATION_HTML>>>
 * or legacy/fallback pure JSON (with optional fenced ```html block).
 */
export function parseAgentEnvelope(text: string): Record<string, unknown> {
  const trimmed = text.trim();

  // Extract delimited HTML block if present
  let extractedHtml: string | undefined;
  const htmlDelimiterMatch = trimmed.match(
    /<<<SIMULATION_HTML>>>\s*([\s\S]*?)(?:<<<END_SIMULATION_HTML>>>|$)/i
  );
  if (htmlDelimiterMatch?.[1]) {
    const candidate = cleanHtmlString(htmlDelimiterMatch[1]);
    if (candidate.length > 0) {
      extractedHtml = candidate;
    }
  } else {
    // Fallback: check for fenced ```html block outside JSON
    const fencedHtmlMatch = trimmed.match(/```html\s*([\s\S]*?)```/i);
    if (fencedHtmlMatch?.[1]) {
      const candidate = cleanHtmlString(fencedHtmlMatch[1]);
      if (/<!doctype\s+html>|<html[\s>]/i.test(candidate)) {
        extractedHtml = candidate;
      }
    }
  }

  // Extract metadata JSON block
  let parsedMeta: Record<string, unknown> = {};
  const jsonDelimiterMatch = trimmed.match(
    /<<<AGENT_JSON>>>\s*([\s\S]*?)<<<END_AGENT_JSON>>>/i
  );

  if (jsonDelimiterMatch?.[1]) {
    parsedMeta = parseJsonFromText(jsonDelimiterMatch[1]);
  } else {
    // Strip the HTML block before attempting JSON extraction so braces in JS don't confuse JSON search
    const withoutHtml = trimmed
      .replace(/<<<SIMULATION_HTML>>>[\s\S]*?(?:<<<END_SIMULATION_HTML>>>|$)/i, '')
      .replace(/```html[\s\S]*?```/gi, '')
      .trim();

    if (withoutHtml) {
      try {
        parsedMeta = parseJsonFromText(withoutHtml);
      } catch {
        // Fallback: try parsing the full original response as JSON (legacy format where html is inside JSON)
        if (!extractedHtml) {
          parsedMeta = parseJsonFromText(trimmed);
        } else {
          parsedMeta = {
            responseType: 'new_simulation',
            summary: 'Generated updated 3D physics simulation.',
          };
        }
      }
    } else if (extractedHtml) {
      parsedMeta = {
        responseType: 'new_simulation',
        summary: 'Generated updated 3D physics simulation.',
      };
    } else {
      throw new Error('Model response did not contain metadata or simulation HTML.');
    }
  }

  if (extractedHtml && (!parsedMeta.html || typeof parsedMeta.html !== 'string' || !parsedMeta.html.trim())) {
    parsedMeta.html = extractedHtml;
  }

  return parsedMeta;
}
