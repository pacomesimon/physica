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
      url.includes('fonts.googleapis')
    ) {
      urls.add(url);
    }
  }
  return Array.from(urls);
}

export function prepareStandaloneExport(rawHtml: string, projectTitle?: string): ExportPackage {
  const cleanHtml = ensureWalkthroughEmbedded(stripPreviewBridge(rawHtml).trim());
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

export function downloadStandaloneHtml(rawHtml: string, filename: string): ExportPackage {
  const pkg = prepareStandaloneExport(rawHtml, filename.replace(/\.html$/i, ''));
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
