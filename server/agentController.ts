import type { Request, Response } from 'express';
import { validateSimulationHtml } from '../src/lib/htmlValidator.ts';
import { parseSimulationMetadata } from '../src/lib/metadataParser.ts';
import type { RuntimeDiagnostic } from '../src/types/simulation.ts';
import { getProviderAdapter, listProviderOptions } from './llm/providerRegistry.ts';
import type { ConversationTurn } from './llm/types.ts';

export function handleListProviders(_req: Request, res: Response): void {
  res.json({
    providers: listProviderOptions(),
    defaultProvider: process.env.LLM_PROVIDER || 'gemini',
  });
}

export async function handleAgentGenerate(req: Request, res: Response): Promise<void> {
  try {
    const body = req.body as {
      instruction?: unknown;
      conversation?: unknown;
      currentHtml?: unknown;
      runtimeErrors?: unknown;
      providerId?: unknown;
      model?: unknown;
    };

    const instruction = typeof body.instruction === 'string' ? body.instruction.trim() : '';
    if (!instruction) {
      res.status(400).json({ error: 'Instruction prompt is required.' });
      return;
    }

    const currentHtml = typeof body.currentHtml === 'string' ? body.currentHtml : '';
    const conversation: ConversationTurn[] = Array.isArray(body.conversation)
      ? body.conversation.filter(
          (item): item is ConversationTurn =>
            typeof item === 'object' &&
            item !== null &&
            (item.role === 'user' || item.role === 'assistant' || item.role === 'system') &&
            typeof item.content === 'string'
        )
      : [];

    const runtimeErrors: RuntimeDiagnostic[] = Array.isArray(body.runtimeErrors)
      ? body.runtimeErrors.filter(
          (item): item is RuntimeDiagnostic =>
            typeof item === 'object' && item !== null && typeof item.message === 'string'
        )
      : [];

    const providerId = typeof body.providerId === 'string' ? body.providerId : undefined;
    const model = typeof body.model === 'string' ? body.model : undefined;

    const adapter = getProviderAdapter(providerId);
    const metadata = parseSimulationMetadata(currentHtml);

    const result = await adapter.generate({
      instruction,
      conversation,
      currentHtml,
      metadata,
      runtimeErrors,
      providerId: adapter.id,
      model,
    });

    // Validate generated HTML if this response includes code changes
    if (result.html) {
      const validation = validateSimulationHtml(result.html);
      if (!validation.valid) {
        res.status(422).json({
          error: `Generated simulation HTML failed validation: ${validation.errors.join(' ')}`,
          validation,
          partialResponse: {
            ...result,
            html: undefined,
          },
        });
        return;
      }
    }

    res.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unexpected server error during generation.';
    const statusCode =
      /API_KEY|configured|PERMISSION_DENIED|403/i.test(message)
        ? 503
        : /429|RESOURCE_EXHAUSTED/i.test(message)
          ? 429
          : 500;
    res.status(statusCode).json({ error: message });
  }
}
