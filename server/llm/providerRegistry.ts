import type { LLMProviderId, ProviderOption } from '../../src/types/simulation.ts';
import { GeminiProviderAdapter } from './geminiAdapter.ts';
import { OpenAICompatProviderAdapter } from './openAiCompatAdapter.ts';
import type { ProviderAdapter } from './types.ts';

const adapters: Record<LLMProviderId, ProviderAdapter> = {
  gemini: new GeminiProviderAdapter(),
  'openai-compatible': new OpenAICompatProviderAdapter(),
};

export function getProviderAdapter(providerId?: string): ProviderAdapter {
  const envDefault = (process.env.LLM_PROVIDER || 'gemini').trim() as LLMProviderId;
  const target = (providerId || envDefault) as LLMProviderId;
  return adapters[target] || adapters.gemini;
}

export function listProviderOptions(): ProviderOption[] {
  return Object.values(adapters).map((adapter) => adapter.getOptions());
}
