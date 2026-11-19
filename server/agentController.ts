import type { Request, Response } from 'express';
import { validateSimulationHtml } from '../src/lib/htmlValidator.ts';
import { parseSimulationMetadata } from '../src/lib/metadataParser.ts';
import {
  ensureWalkthroughEmbedded,
  stripWalkthroughBundle,
} from '../src/lib/walkthrough/embedder.ts';
import type { RuntimeDiagnostic } from '../src/types/simulation.ts';
import { getProviderAdapter, listProviderOptions } from './llm/providerRegistry.ts';
import { CODE_PRODUCING_RESPONSE_TYPES, type ConversationTurn } from './llm/types.ts';

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
    // Strip the canonical embedded walkthrough runtime before sending source to the LLM so the model
    // focuses on physics, UI, window.simulationAPI, and window.WALKTHROUGH_CONFIG without wasting tokens.
    const promptHtml = stripWalkthroughBundle(currentHtml);

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

    let result = await adapter.generate({
      instruction,
      conversation,
      currentHtml: promptHtml,
      metadata,
      runtimeErrors,
      providerId: adapter.id,
      model,
    });

    if (result.html) {
      result.html = ensureWalkthroughEmbedded(result.html);
    }

    const expectsHtml = CODE_PRODUCING_RESPONSE_TYPES.has(result.responseType);
    const initialValidation = result.html ? validateSimulationHtml(result.html) : null;
    const needsWalkthroughRetry = Boolean(
      initialValidation &&
        (!initialValidation.hasWalkthroughConfig ||
          !initialValidation.hasSimulationApi ||
          (initialValidation.missingHighlightSelectors &&
            initialValidation.missingHighlightSelectors.length > 0))
    );

    // Automatic single retry if HTML is missing, invalid, or missing walkthrough/simulationAPI/selectors
    if (expectsHtml && (!result.html || !initialValidation?.valid || needsWalkthroughRetry)) {
      const reasons: string[] = [];
      if (!result.html) {
        reasons.push(
          'Your previous response omitted the <<<SIMULATION_HTML>>>...<<<END_SIMULATION_HTML>>> block.'
        );
      } else {
        if (initialValidation && !initialValidation.valid) {
          reasons.push(`HTML validation errors: ${initialValidation.errors.join(' ')}`);
        }
        if (initialValidation && !initialValidation.hasWalkthroughConfig) {
          reasons.push(
            'Missing window.WALKTHROUGH_CONFIG with 5-6 tailored spoken narration segments.'
          );
        }
        if (initialValidation && !initialValidation.hasSimulationApi) {
          reasons.push(
            'Missing standardized window.simulationAPI (getState, setState, getParameters, setParameter, play, pause, reset).'
          );
        }
        if (
          initialValidation?.missingHighlightSelectors &&
          initialValidation.missingHighlightSelectors.length > 0
        ) {
          reasons.push(
            `WALKTHROUGH_CONFIG references missing DOM selectors: ${initialValidation.missingHighlightSelectors.join(', ')}. Ensure every highlight selector matches an actual id="..." element in the HTML.`
          );
        }
      }

      const retryResult = await adapter.generate({
        instruction: `${instruction}\n\nIMPORTANT CORRECTION: ${reasons.join(' ')} You MUST output the complete, runnable standalone Three.js HTML5 document inside <<<SIMULATION_HTML>>> and <<<END_SIMULATION_HTML>>> now.`,
        conversation,
        currentHtml: promptHtml,
        metadata,
        runtimeErrors,
        providerId: adapter.id,
        model,
      });

      if (retryResult.html) {
        retryResult.html = ensureWalkthroughEmbedded(retryResult.html);
      }
      // Keep the retry result if it produced valid HTML or if the original had no valid HTML
      const retryValidation = retryResult.html ? validateSimulationHtml(retryResult.html) : null;
      if (retryValidation?.valid || !initialValidation?.valid) {
        result = retryResult;
      }
    }

    if (CODE_PRODUCING_RESPONSE_TYPES.has(result.responseType) && !result.html) {
      res.status(422).json({
        error:
          'The AI agent described a simulation update but did not return HTML source code. Please try submitting your prompt again.',
      });
      return;
    }

    if (result.html) {
      result.html = ensureWalkthroughEmbedded(result.html);
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
