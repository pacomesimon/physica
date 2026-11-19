import { GoogleGenAI } from '@google/genai';
import type { AgentStructuredResponse, ProviderOption } from '../../src/types/simulation.ts';
import { buildAgentPrompt, SIMULATION_SYSTEM_INSTRUCTION } from './simulationSystemPrompt.ts';
import {
  normalizeAgentResponse,
  parseAgentEnvelope,
  type AgentGenerateInput,
  type ProviderAdapter,
} from './types.ts';

const AVAILABLE_MODELS = [
  { id: 'gemini-4-hydrogen', label: 'Gemini 4 Hydrogen (Recommended)' },
  { id: 'gemini-3.1-flash-lite', label: 'Gemini 3.1 Flash Lite (Fast)' },
];

export class GeminiProviderAdapter implements ProviderAdapter {
  readonly id = 'gemini' as const;
  readonly label = 'Google Gemini';
  readonly description = 'Server-side @google/genai integration using GEMINI_API_KEY.';

  isConfigured(): boolean {
    const key = process.env.GEMINI_API_KEY?.trim();
    return Boolean(key && key !== 'MY_GEMINI_API_KEY');
  }

  getOptions(): ProviderOption {
    return {
      id: this.id,
      label: this.label,
      configured: this.isConfigured(),
      defaultModel: 'gemini-4-hydrogen',
      availableModels: AVAILABLE_MODELS,
      description: this.description,
    };
  }

  async generate(input: AgentGenerateInput): Promise<AgentStructuredResponse> {
    const apiKey = process.env.GEMINI_API_KEY?.trim();
    if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
      throw new Error(
        'GEMINI_API_KEY is not configured. Please set GEMINI_API_KEY in the Settings > Secrets panel.'
      );
    }

    const model =
      input.model && AVAILABLE_MODELS.some((m) => m.id === input.model)
        ? input.model
        : 'gemini-4-hydrogen';

    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });

    const response = await ai.models.generateContent({
      model,
      contents: buildAgentPrompt(input),
      config: {
        systemInstruction: SIMULATION_SYSTEM_INSTRUCTION,
      },
    });

    const rawText = response.text;
    if (!rawText) {
      throw new Error('Gemini returned an empty response.');
    }

    const parsed = parseAgentEnvelope(rawText);
    return normalizeAgentResponse(parsed, this.id, model);
  }
}
