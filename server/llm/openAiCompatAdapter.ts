import type { AgentStructuredResponse, ProviderOption } from '../../src/types/simulation.ts';
import { buildAgentPrompt, SIMULATION_SYSTEM_INSTRUCTION } from './simulationSystemPrompt.ts';
import {
  normalizeAgentResponse,
  parseAgentEnvelope,
  type AgentGenerateInput,
  type ProviderAdapter,
} from './types.ts';

export class OpenAICompatProviderAdapter implements ProviderAdapter {
  readonly id = 'openai-compatible' as const;
  readonly label = 'OpenAI-Compatible Endpoint';
  readonly description =
    'Configurable server-side endpoint for OpenAI, Ollama, LM Studio, vLLM, or OpenRouter via OPENAI_COMPAT_BASE_URL.';

  private getBaseUrl(): string {
    return (process.env.OPENAI_COMPAT_BASE_URL || '').trim().replace(/\/+$/, '');
  }

  private getDefaultModel(): string {
    return (process.env.OPENAI_COMPAT_MODEL || 'gpt-4o-mini').trim();
  }

  isConfigured(): boolean {
    return Boolean(this.getBaseUrl());
  }

  getOptions(): ProviderOption {
    const defaultModel = this.getDefaultModel();
    return {
      id: this.id,
      label: this.label,
      configured: this.isConfigured(),
      defaultModel,
      availableModels: [{ id: defaultModel, label: defaultModel }],
      description: this.description,
    };
  }

  async generate(input: AgentGenerateInput): Promise<AgentStructuredResponse> {
    const baseUrl = this.getBaseUrl();
    if (!baseUrl) {
      throw new Error(
        'OPENAI_COMPAT_BASE_URL is not configured on the server. Set it in your environment variables to use an OpenAI-compatible provider.'
      );
    }

    const apiKey = (process.env.OPENAI_COMPAT_API_KEY || '').trim();
    const model = input.model?.trim() || this.getDefaultModel();

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (apiKey) {
      headers.Authorization = `Bearer ${apiKey}`;
    }

    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: SIMULATION_SYSTEM_INSTRUCTION },
          { role: 'user', content: buildAgentPrompt(input) },
        ],
      }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => res.statusText);
      throw new Error(`OpenAI-compatible endpoint returned HTTP ${res.status}: ${errText}`);
    }

    const payload = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = payload.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error('OpenAI-compatible endpoint returned an empty completion.');
    }

    const parsed = parseAgentEnvelope(content);
    return normalizeAgentResponse(parsed, this.id, model);
  }
}
