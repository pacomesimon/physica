import { ensureHybridAssistantEmbedded } from './assistant/embedder.ts';
import { stripPreviewBridge } from './bridgeInjector.ts';
import { validateSimulationHtml } from './htmlValidator.ts';
import { parseSimulationMetadata } from './metadataParser.ts';
import { ensureWalkthroughEmbedded } from './walkthrough/embedder.ts';
import type { SimulationMetadata, ValidationResult } from '../types/simulation.ts';

export interface ExportPackage {
  filename: string;
  html: string;
  byteSize: number;
  metadata: SimulationMetadata;
  validation: ValidationResult;
  cdnDependencies: string[];
}

export function slugifyFilename(title: string): string {
  const base = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `${base || 'physics-simulation'}.html`;
}

export function extractCdnDependencies(html: string): string[] {
  const urls = new Set<string>();
  const urlMatches = html.matchAll(/https?:\/\/[^\s"'<>)]+/g);
  for (const match of urlMatches) {
    const url = match[0];
    if (
      url.includes('three') ||
      url.includes('cdn') ||
      url.includes('unpkg') ||
      url.includes('esm.sh') ||
      url.includes('fonts.googleapis') ||
      url.includes('gstatic.com/firebasejs')
    ) {
      urls.add(url);
    }
  }
  return Array.from(urls);
}

export function prepareStandaloneExport(
  rawHtml: string,
  projectTitle?: string,
  preferredVoice?: string
): ExportPackage {
  const withWalkthrough = ensureWalkthroughEmbedded(stripPreviewBridge(rawHtml).trim(), preferredVoice);
  const cleanHtml = ensureHybridAssistantEmbedded(withWalkthrough);
  const metadata = parseSimulationMetadata(cleanHtml);
  const validation = validateSimulationHtml(cleanHtml);
  const filename = slugifyFilename(projectTitle || metadata.title);
  const cdnDependencies = extractCdnDependencies(cleanHtml);
  const byteSize = new TextEncoder().encode(cleanHtml).length;

  return {
    filename,
    html: cleanHtml,
    byteSize,
    metadata,
    validation,
    cdnDependencies,
  };
}

export interface HostedSimulationLink {
  id: string;
  path: string;
  url: string;
  manifestPath: string;
  swPath: string;
  title: string;
  shortName: string;
  byteSize: number;
}

export async function publishStandaloneSimulation(
  rawHtml: string,
  projectTitle?: string,
  preferredVoice?: string
): Promise<HostedSimulationLink> {
  const pkg = prepareStandaloneExport(rawHtml, projectTitle, preferredVoice);
  if (!pkg.validation.valid) {
    throw new Error(pkg.validation.errors.join(' ') || 'Simulation HTML failed validation.');
  }

  const response = await fetch('/api/published', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      html: pkg.html,
      title: projectTitle || pkg.metadata.title,
      description: pkg.metadata.topic,
      preferredVoice,
    }),
  });

  const payload = (await response.json()) as Partial<HostedSimulationLink> & { error?: string };
  if (!response.ok || !payload.path || !payload.id) {
    throw new Error(payload.error || `Failed to publish hosted webpage (${response.status}).`);
  }

  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const url = origin ? new URL(payload.path, origin).toString() : payload.path;

  return {
    id: payload.id,
    path: payload.path,
    url,
    manifestPath: payload.manifestPath || `${payload.path}manifest.webmanifest`,
    swPath: payload.swPath || `${payload.path}sw.js`,
    title: payload.title || projectTitle || pkg.metadata.title,
    shortName: payload.shortName || 'Physica Sim',
    byteSize: payload.byteSize || pkg.byteSize,
  };
}

export async function copyTextToClipboard(text: string): Promise<boolean> {
  if (!text) return false;
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fallback for restricted iframe clipboard contexts
    }
  }

  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.top = '-9999px';
    textarea.style.left = '-9999px';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
}

export function downloadStandaloneHtml(
  rawHtml: string,
  filename: string,
  preferredVoice?: string
): ExportPackage {
  const pkg = prepareStandaloneExport(rawHtml, filename.replace(/\.html$/i, ''), preferredVoice);
  const finalName = filename.endsWith('.html') ? filename : `${filename}.html`;
  const blob = new Blob([pkg.html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = finalName;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return { ...pkg, filename: finalName };
}
