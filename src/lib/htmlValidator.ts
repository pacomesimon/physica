import type { ValidationResult } from '../types/simulation.ts';
import { parseSimulationMetadata } from './metadataParser.ts';

const FORBIDDEN_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /GEMINI_API_KEY/i, label: 'Server API key identifier (GEMINI_API_KEY)' },
  { pattern: /OPENAI_COMPAT_API_KEY/i, label: 'Server API key identifier (OPENAI_COMPAT_API_KEY)' },
  { pattern: /process\.env\./, label: 'Node process.env reference' },
  { pattern: /AIzaSy[0-9A-Za-z_-]{20,}/, label: 'Google API key literal' },
  { pattern: /sk-[0-9A-Za-z]{20,}/, label: 'Secret token literal' },
];

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

  for (const check of FORBIDDEN_PATTERNS) {
    if (check.pattern.test(trimmed)) {
      errors.push(`Security validation failed: found ${check.label}.`);
    }
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

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    hasThreeJs,
    hasMetadata: metadata.hasStructuredHeader,
    sectionCount: metadata.presentSections.length,
  };
}
