import type { ValidationResult } from '../types/simulation.ts';
import { parseSimulationMetadata } from './metadataParser.ts';
import { validateWalkthroughSelectors } from './walkthrough/embedder.ts';

const SERVER_SECRET_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /GEMINI_API_KEY/i, label: 'Server API key identifier (GEMINI_API_KEY)' },
  { pattern: /OPENAI_COMPAT_API_KEY/i, label: 'Server API key identifier (OPENAI_COMPAT_API_KEY)' },
  { pattern: /process\.env\./, label: 'Node process.env reference' },
  { pattern: /sk-[0-9A-Za-z]{20,}/, label: 'Secret token literal' },
];

const GOOGLE_KEY_PATTERN = /AIzaSy[0-9A-Za-z_-]{20,}/;
const PUBLIC_FIREBASE_CONFIG_SCRIPT_REGEX =
  /<script\s+type=["']application\/json["']\s+id=["']physica-firebase-config["']\s+data-physica-firebase-config>[^<]*<\/script>/gi;

export function validateSimulationHtml(html: string): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const trimmed = (html || '').trim();
  if (!trimmed) {
    return {
      valid: false,
      errors: ['Generated HTML document is empty.'],
      warnings: [],
      hasThreeJs: false,
      hasMetadata: false,
      sectionCount: 0,
      hasWalkthroughConfig: false,
      hasSimulationApi: false,
      hasWalkthroughEngine: false,
      hasHybridAssistant: false,
      walkthroughSegmentCount: 0,
      missingHighlightSelectors: [],
    };
  }

  if (!/<!doctype\s+html>/i.test(trimmed) && !/<html[\s>]/i.test(trimmed)) {
    errors.push('Missing HTML document root (<!DOCTYPE html> or <html>).');
  }

  if (!/<body[\s>]/i.test(trimmed)) {
    errors.push('Missing <body> element in HTML document.');
  }

  if (!/<script[\s>]/i.test(trimmed)) {
    errors.push('Missing <script> element for Three.js simulation logic.');
  }

  const hasThreeJs =
    /three/i.test(trimmed) &&
    (/WebGLRenderer/i.test(trimmed) || /THREE\./.test(trimmed) || /from\s+['"]three['"]/.test(trimmed));

  if (!hasThreeJs) {
    errors.push('No Three.js dependency or WebGLRenderer initialization detected.');
  }

  for (const check of SERVER_SECRET_PATTERNS) {
    if (check.pattern.test(trimmed)) {
      errors.push(`Security validation failed: found ${check.label}.`);
    }
  }

  // Public Firebase Web App config keys are permitted only inside the dedicated JSON script tag.
  const withoutPublicFirebaseConfig = trimmed.replace(PUBLIC_FIREBASE_CONFIG_SCRIPT_REGEX, '');
  if (GOOGLE_KEY_PATTERN.test(withoutPublicFirebaseConfig)) {
    errors.push('Security validation failed: found Google API key literal.');
  }

  if (/data-physica-preview-bridge/i.test(trimmed)) {
    warnings.push('Preview diagnostic bridge tag detected in source; it will be stripped on export.');
  }

  const metadata = parseSimulationMetadata(trimmed);
  if (!metadata.hasStructuredHeader) {
    warnings.push('Missing AI-friendly SIMULATION_METADATA comment header.');
  }

  if (metadata.presentSections.length < 6) {
    warnings.push(
      `Only ${metadata.presentSections.length}/10 standard simulation documentation sections detected.`
    );
  }

  if (!/<title>[^<]+<\/title>/i.test(trimmed)) {
    warnings.push('Missing <title> tag for standalone browser tab display.');
  }

  const hasWalkthroughConfig = Boolean(metadata.hasWalkthrough);
  const hasSimulationApi = Boolean(metadata.hasSimulationApi);
  const hasWalkthroughEngine =
    /WALKTHROUGH_PLAYBACK_ENGINE/.test(trimmed) || /speechSynthesis/.test(trimmed);
  const hasHybridAssistant =
    /HYBRID_AI_ASSISTANT_START/.test(trimmed) && /physica-hybrid-assistant-script/.test(trimmed);
  const selectorCheck = hasWalkthroughConfig
    ? validateWalkthroughSelectors(trimmed)
    : { selectors: [], missingSelectors: [] };

  if (!hasWalkthroughConfig) {
    warnings.push('Missing window.WALKTHROUGH_CONFIG definition for narrated guided walkthrough.');
  }
  if (!hasSimulationApi) {
    warnings.push('Missing window.simulationAPI state manager for walkthrough synchronization.');
  }
  if (selectorCheck.missingSelectors.length > 0) {
    warnings.push(
      `Walkthrough references highlight selectors not found in HTML: ${selectorCheck.missingSelectors.join(', ')}`
    );
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    hasThreeJs,
    hasMetadata: metadata.hasStructuredHeader,
    sectionCount: metadata.presentSections.length,
    hasWalkthroughConfig,
    hasSimulationApi,
    hasWalkthroughEngine,
    hasHybridAssistant,
    walkthroughSegmentCount: metadata.walkthroughSegmentCount ?? 0,
    missingHighlightSelectors: selectorCheck.missingSelectors,
  };
}
