import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { ensureHybridAssistantEmbedded } from '../src/lib/assistant/embedder.ts';
import { stripPreviewBridge } from '../src/lib/bridgeInjector.ts';
import { validateSimulationHtml } from '../src/lib/htmlValidator.ts';
import { parseSimulationMetadata } from '../src/lib/metadataParser.ts';
import { ensureWalkthroughEmbedded } from '../src/lib/walkthrough/embedder.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const STORE_DIR = path.resolve(__dirname, '..', '.published-sims');
const MAX_HTML_BYTES = 2 * 1024 * 1024; // 2 MB cap per simulation
const MAX_STORED_RECORDS = 200;
const PUBLISHED_ID_REGEX = /^[a-f0-9]{16}$/;

export interface PublishedSimulationRecord {
  id: string;
  title: string;
  shortName: string;
  description: string;
  html: string;
  byteSize: number;
  createdAt: number;
  updatedAt: number;
}

export interface PublishSimulationInput {
  html: string;
  title?: string;
  description?: string;
  preferredVoice?: string;
}

const memoryStore = new Map<string, PublishedSimulationRecord>();

function ensureStoreDir(): void {
  if (!fs.existsSync(STORE_DIR)) {
    fs.mkdirSync(STORE_DIR, { recursive: true });
  }
}

export function isValidPublishedId(id: string): boolean {
  return PUBLISHED_ID_REGEX.test(id);
}

function getConfinedRecordPath(id: string): string | null {
  if (!isValidPublishedId(id)) return null;
  const resolved = path.resolve(STORE_DIR, `${id}.json`);
  if (!resolved.startsWith(STORE_DIR + path.sep)) {
    return null;
  }
  return resolved;
}

function sanitizeText(raw: string | undefined, maxLen: number, fallback: string): string {
  const cleaned = (raw || '')
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return fallback;
  return cleaned.length > maxLen ? cleaned.slice(0, maxLen).trim() : cleaned;
}

export function buildShortPwaName(title: string): string {
  const cleaned = sanitizeText(title, 60, 'Physica Sim');
  if (cleaned.length <= 12) return cleaned;
  // Prefer clean word prefix if it fits well, otherwise hard-trim to 12 chars (PWA short_name <= 12 rule)
  const words = cleaned.split(' ').filter(Boolean);
  if (words.length >= 2) {
    let acc = words[0];
    for (let i = 1; i < words.length; i++) {
      if ((acc + ' ' + words[i]).length <= 12) {
        acc += ' ' + words[i];
      } else {
        break;
      }
    }
    if (acc.length >= 4 && acc.length <= 12) {
      return acc;
    }
  }
  return cleaned.slice(0, 12).trim() || 'Physica';
}

function escapeHtmlAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function pruneDiskStoreIfNeeded(): void {
  try {
    ensureStoreDir();
    const files = fs
      .readdirSync(STORE_DIR)
      .filter((f) => f.endsWith('.json'))
      .map((name) => {
        const full = path.join(STORE_DIR, name);
        const stat = fs.statSync(full);
        return { full, mtimeMs: stat.mtimeMs };
      })
      .sort((a, b) => a.mtimeMs - b.mtimeMs);

    while (files.length > MAX_STORED_RECORDS) {
      const oldest = files.shift();
      if (oldest) {
        fs.unlinkSync(oldest.full);
      }
    }
  } catch {
    // Non-fatal cleanup error
  }
}

export function publishSimulation(input: PublishSimulationInput): PublishedSimulationRecord {
  if (!input || typeof input.html !== 'string' || !input.html.trim()) {
    throw new Error('Simulation HTML is required.');
  }

  const rawBytes = Buffer.byteLength(input.html, 'utf8');
  if (rawBytes > MAX_HTML_BYTES) {
    throw new Error('Simulation HTML exceeds the 2 MB hosting size limit.');
  }

  const withWalkthrough = ensureWalkthroughEmbedded(
    stripPreviewBridge(input.html).trim(),
    typeof input.preferredVoice === 'string' ? input.preferredVoice : undefined
  );
  const cleanHtml = ensureHybridAssistantEmbedded(withWalkthrough);

  const validation = validateSimulationHtml(cleanHtml);
  if (!validation.valid) {
    throw new Error(`Invalid simulation HTML: ${validation.errors.join(' ')}`);
  }

  const metadata = parseSimulationMetadata(cleanHtml);
  const title = sanitizeText(
    input.title || (metadata.title !== 'Untitled Simulation' ? metadata.title : ''),
    80,
    'Physics Simulation'
  );
  const shortName = buildShortPwaName(title);
  const description = sanitizeText(
    input.description ||
      metadata.topic ||
      `Interactive 3D ${title} simulation ready to install and run offline.`,
    180,
    `Interactive 3D ${title} simulation.`
  );

  const id = crypto
    .createHash('sha256')
    .update(`${title}\n${description}\n${cleanHtml}`)
    .digest('hex')
    .slice(0, 16);

  const now = Date.now();
  const record: PublishedSimulationRecord = {
    id,
    title,
    shortName,
    description,
    html: cleanHtml,
    byteSize: Buffer.byteLength(cleanHtml, 'utf8'),
    createdAt: memoryStore.get(id)?.createdAt ?? now,
    updatedAt: now,
  };

  memoryStore.set(id, record);
  if (memoryStore.size > MAX_STORED_RECORDS) {
    const oldestKey = memoryStore.keys().next().value;
    if (oldestKey) memoryStore.delete(oldestKey);
  }

  try {
    ensureStoreDir();
    const recordPath = getConfinedRecordPath(id);
    if (recordPath) {
      fs.writeFileSync(recordPath, JSON.stringify(record), 'utf8');
      pruneDiskStoreIfNeeded();
    }
  } catch {
    // Keep serving from memory if disk is read-only
  }

  return record;
}

export function getPublishedSimulation(id: string): PublishedSimulationRecord | null {
  if (!isValidPublishedId(id)) return null;

  const cached = memoryStore.get(id);
  if (cached) return cached;

  const recordPath = getConfinedRecordPath(id);
  if (!recordPath) return null;

  try {
    if (!fs.existsSync(recordPath)) return null;
    const raw = fs.readFileSync(recordPath, 'utf8');
    const parsed = JSON.parse(raw) as PublishedSimulationRecord;
    if (parsed && parsed.id === id && typeof parsed.html === 'string') {
      memoryStore.set(id, parsed);
      return parsed;
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * Extracts external module and media URLs (including importmap-resolved Three.js core & addon imports)
 * so the Service Worker pre-caches them for full offline execution on edge devices.
 */
export function extractOfflinePrecacheUrls(html: string): string[] {
  const urls = new Set<string>();

  // 1. Parse importmap mappings if present
  const importMapMatch = html.match(
    /<script[^>]*type=["']importmap["'][^>]*>([\s\S]*?)<\/script>/i
  );
  const importMap: Record<string, string> = {};
  if (importMapMatch?.[1]) {
    try {
      const parsed = JSON.parse(importMapMatch[1]) as { imports?: Record<string, string> };
      if (parsed?.imports && typeof parsed.imports === 'object') {
        Object.assign(importMap, parsed.imports);
      }
    } catch {
      // Ignore malformed importmap JSON
    }
  }

  // Add mapped base three.module.js + sibling three.core.js (imported internally by Three.js r160+)
  if (typeof importMap.three === 'string' && /^https?:\/\//i.test(importMap.three)) {
    urls.add(importMap.three);
    if (/three\.module\.js$/i.test(importMap.three)) {
      urls.add(importMap.three.replace(/three\.module\.js$/i, 'three.core.js'));
    }
  }

  // Resolve static ES imports matching importmap prefixes (e.g., three/addons/controls/OrbitControls.js)
  const importMatches = html.matchAll(/from\s+['"]([^'"]+)['"]/g);
  for (const m of importMatches) {
    const spec = m[1];
    if (!spec) continue;
    if (/^https?:\/\//i.test(spec)) {
      urls.add(spec);
      continue;
    }
    for (const [key, target] of Object.entries(importMap)) {
      if (key === spec && /^https?:\/\//i.test(target)) {
        urls.add(target);
      } else if (key.endsWith('/') && spec.startsWith(key) && /^https?:\/\//i.test(target)) {
        urls.add(target + spec.slice(key.length));
      }
    }
  }

  // Also detect any CDN URLs (jsDelivr, unpkg, esm.sh, Google Fonts, Pixabay audio, Firebase JS SDK)
  const urlMatches = html.matchAll(/https?:\/\/[^\s"'<>)]+/g);
  for (const m of urlMatches) {
    const candidate = m[0];
    if (
      /cdn\.jsdelivr\.net|unpkg\.com|esm\.sh|fonts\.googleapis\.com|cdn\.pixabay\.com|www\.gstatic\.com\/firebasejs/i.test(
        candidate
      ) &&
      !candidate.endsWith('/')
    ) {
      urls.add(candidate);
    }
  }

  return Array.from(urls);
}

export function buildPwaManifest(record: PublishedSimulationRecord): Record<string, unknown> {
  const basePath = `/sim/${record.id}/`;
  return {
    id: basePath,
    name: record.title,
    short_name: record.shortName,
    description: record.description,
    start_url: basePath,
    scope: basePath,
    display: 'standalone',
    orientation: 'any',
    theme_color: '#0b1120',
    background_color: '#0b1120',
    categories: ['education', 'science'],
    icons: [
      {
        src: '/pwa-icons/pwa-192x192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/pwa-icons/pwa-512x512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/pwa-icons/pwa-maskable-512x512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}

export function buildPwaServiceWorker(record: PublishedSimulationRecord): string {
  const basePath = `/sim/${record.id}/`;
  const cacheName = `physica-sim-${record.id}-v1`;
  const appShellUrls = [
    basePath,
    `${basePath}manifest.webmanifest`,
    '/pwa-icons/pwa-192x192.png',
    '/pwa-icons/pwa-512x512.png',
    '/pwa-icons/pwa-maskable-512x512.png',
    '/pwa-icons/apple-touch-icon.png',
    '/pwa-icons/icon.svg',
  ];
  const externalUrls = extractOfflinePrecacheUrls(record.html);

  return `/* Scoped Offline Service Worker for Hosted Physics Simulation PWA (${record.id}) */
const CACHE_NAME = ${JSON.stringify(cacheName)};
const SCOPE_PATH = ${JSON.stringify(basePath)};
const APP_SHELL_URLS = ${JSON.stringify(appShellUrls, null, 2)};
const EXTERNAL_PRECACHE_URLS = ${JSON.stringify(externalUrls, null, 2)};

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      await cache.addAll(APP_SHELL_URLS);
      await Promise.allSettled(
        EXTERNAL_PRECACHE_URLS.map(async (url) => {
          try {
            const req = new Request(url, { mode: 'cors' });
            const res = await fetch(req);
            if (res && (res.ok || res.type === 'opaque')) {
              await cache.put(url, res.clone());
            }
          } catch (_) {
            try {
              const noCorsRes = await fetch(new Request(url, { mode: 'no-cors' }));
              if (noCorsRes) {
                await cache.put(url, noCorsRes.clone());
              }
            } catch (__) {
              // Ignore optional offline prefetch failures
            }
          }
        })
      );
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k.startsWith('physica-sim-' + ${JSON.stringify(record.id)} + '-') && k !== CACHE_NAME)
          .map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;

  // Navigation / document requests: Network-first with instant offline cache fallback
  if (req.mode === 'navigate' || url.pathname === SCOPE_PATH || url.pathname === SCOPE_PATH.slice(0, -1)) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res && res.ok) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(SCOPE_PATH, clone));
          }
          return res;
        })
        .catch(() => caches.match(SCOPE_PATH).then((cached) => cached || caches.match(req)))
    );
    return;
  }

  // Static & CDN dependencies (Three.js modules, addons, icons, audio): Cache-first with background fill
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req)
        .then((res) => {
          if (res && (res.ok || res.type === 'opaque')) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
          }
          return res;
        })
        .catch(() => caches.match(req.url));
    })
  );
});
`;
}

/**
 * Wraps a hosted standalone simulation HTML document with full PWA compliance:
 * - Manifest link, theme-color, mobile/iOS Safari meta tags & PNG apple-touch-icon
 * - Scoped Service Worker registration for offline execution on edge devices
 * - Non-blocking in-app Install App prompt (beforeinstallprompt + iOS Safari guide + auto-hide in standalone)
 * - Offline connectivity status indicator
 */
export function injectHostedPwaShell(record: PublishedSimulationRecord): string {
  const basePath = `/sim/${record.id}/`;
  const safeShortName = escapeHtmlAttr(record.shortName);
  const safeTitle = escapeHtmlAttr(record.title);

  const headTags = `
  <!-- Hosted PWA Metadata & Icons -->
  <meta name="theme-color" content="#0b1120" />
  <meta name="mobile-web-app-capable" content="yes" />
  <meta name="apple-mobile-web-app-capable" content="yes" />
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
  <meta name="apple-mobile-web-app-title" content="${safeShortName}" />
  <link rel="manifest" href="${basePath}manifest.webmanifest" />
  <link rel="apple-touch-icon" href="/pwa-icons/apple-touch-icon.png" />
  <link rel="icon" type="image/svg+xml" href="/pwa-icons/icon.svg" />
`;

  const bodyPwaShell = `
<!-- HOSTED_PWA_SHELL_START -->
<style id="physica-hosted-pwa-styles">
  #physica-pwa-bar {
    position: fixed;
    top: 12px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 42;
    display: flex;
    align-items: center;
    gap: 6px;
    pointer-events: none;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  }

  #physica-pwa-install-wrap {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 4px 5px 4px 10px;
    background: rgba(15, 23, 42, 0.94);
    border: 1px solid rgba(56, 189, 248, 0.45);
    border-radius: 8px;
    box-shadow: 0 8px 22px rgba(2, 6, 23, 0.48);
    pointer-events: auto;
  }

  #physica-pwa-install-wrap.pwa-hidden {
    display: none;
  }

  #physica-pwa-install-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    background: #0284c7;
    border: 1px solid #38bdf8;
    color: #ffffff;
    border-radius: 6px;
    padding: 5px 10px;
    font-size: 11.5px;
    font-weight: 600;
    cursor: pointer;
    white-space: nowrap;
  }

  #physica-pwa-install-btn:hover {
    background: #0369a1;
  }

  #physica-pwa-dismiss-btn {
    background: transparent;
    border: none;
    color: #94a3b8;
    width: 24px;
    height: 24px;
    border-radius: 5px;
    font-size: 15px;
    line-height: 1;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  #physica-pwa-dismiss-btn:hover {
    color: #f8fafc;
    background: rgba(148, 163, 184, 0.16);
  }

  #physica-pwa-offline-badge {
    display: none;
    align-items: center;
    gap: 6px;
    padding: 5px 10px;
    background: rgba(180, 83, 9, 0.94);
    border: 1px solid rgba(251, 191, 36, 0.55);
    color: #fffbeb;
    border-radius: 8px;
    font-size: 11.5px;
    font-weight: 600;
    box-shadow: 0 6px 18px rgba(2, 6, 23, 0.4);
    pointer-events: auto;
    white-space: nowrap;
  }

  #physica-pwa-offline-badge.pwa-visible {
    display: inline-flex;
  }

  #physica-pwa-guide-modal {
    position: fixed;
    inset: 0;
    z-index: 60;
    background: rgba(2, 6, 23, 0.65);
    display: none;
    align-items: center;
    justify-content: center;
    padding: 16px;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  }

  #physica-pwa-guide-modal.pwa-open {
    display: flex;
  }

  .physica-pwa-guide-card {
    width: min(380px, 100%);
    background: #0f172a;
    border: 1px solid rgba(148, 163, 184, 0.3);
    border-radius: 12px;
    padding: 18px;
    color: #f8fafc;
    box-shadow: 0 18px 40px rgba(0, 0, 0, 0.55);
  }

  .physica-pwa-guide-title {
    font-size: 14px;
    font-weight: 600;
    margin-bottom: 8px;
  }

  .physica-pwa-guide-body {
    font-size: 12.5px;
    line-height: 1.55;
    color: #cbd5e1;
  }

  .physica-pwa-guide-actions {
    margin-top: 14px;
    display: flex;
    justify-content: flex-end;
  }

  .physica-pwa-guide-close {
    background: #1e293b;
    border: 1px solid rgba(148, 163, 184, 0.35);
    color: #f8fafc;
    border-radius: 6px;
    padding: 6px 14px;
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
  }

  .physica-pwa-guide-close:hover {
    background: #334155;
  }

  @media (max-width: 720px) {
    #physica-pwa-bar {
      top: 10px;
      right: 12px;
      left: auto;
      transform: none;
    }
  }
</style>

<div id="physica-pwa-bar" aria-label="Installable App Controls">
  <div id="physica-pwa-install-wrap">
    <button id="physica-pwa-install-btn" type="button" title="Install ${safeTitle} to run offline on this device">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
        <polyline points="7 10 12 15 17 10"/>
        <line x1="12" y1="15" x2="12" y2="3"/>
      </svg>
      <span id="physica-pwa-install-label">Install App</span>
    </button>
    <button id="physica-pwa-dismiss-btn" type="button" title="Hide install prompt" aria-label="Hide install prompt">&times;</button>
  </div>
  <div id="physica-pwa-offline-badge" role="status" aria-live="polite">
    Offline Mode — Running Cached Simulation
  </div>
</div>

<div id="physica-pwa-guide-modal" role="dialog" aria-modal="true" aria-labelledby="physica-pwa-guide-title">
  <div class="physica-pwa-guide-card">
    <div id="physica-pwa-guide-title" class="physica-pwa-guide-title">Install ${safeTitle} on This Device</div>
    <div id="physica-pwa-guide-body" class="physica-pwa-guide-body"></div>
    <div class="physica-pwa-guide-actions">
      <button id="physica-pwa-guide-close" class="physica-pwa-guide-close" type="button">Close</button>
    </div>
  </div>
</div>

<script id="physica-hosted-pwa-script">
(function () {
  const SW_URL = ${JSON.stringify(`${basePath}sw.js`)};
  const SW_SCOPE = ${JSON.stringify(basePath)};

  // 1. Register Scoped Service Worker for offline edge execution
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register(SW_URL, { scope: SW_SCOPE }).catch(function () {});
    });
  }

  // 2. Detect standalone installed mode & platform
  const isStandalone =
    (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) ||
    window.navigator.standalone === true;
  const ua = (window.navigator.userAgent || '').toLowerCase();
  const isIOS = /iphone|ipad|ipod/.test(ua);

  const installWrap = document.getElementById('physica-pwa-install-wrap');
  const installBtn = document.getElementById('physica-pwa-install-btn');
  const installLabel = document.getElementById('physica-pwa-install-label');
  const dismissBtn = document.getElementById('physica-pwa-dismiss-btn');
  const offlineBadge = document.getElementById('physica-pwa-offline-badge');
  const guideModal = document.getElementById('physica-pwa-guide-modal');
  const guideBody = document.getElementById('physica-pwa-guide-body');
  const guideClose = document.getElementById('physica-pwa-guide-close');

  let deferredPrompt = null;

  if (isStandalone && installWrap) {
    installWrap.classList.add('pwa-hidden');
  } else if (isIOS && installLabel) {
    installLabel.textContent = 'Install on iOS';
  }

  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    deferredPrompt = e;
    if (installLabel) installLabel.textContent = 'Install App';
    if (installWrap) installWrap.classList.remove('pwa-hidden');
  });

  window.addEventListener('appinstalled', function () {
    deferredPrompt = null;
    if (installWrap) installWrap.classList.add('pwa-hidden');
  });

  function showInstallGuide() {
    if (!guideModal || !guideBody) return;
    if (isIOS) {
      guideBody.textContent =
        '1. Tap the Share button in Safari. 2. Scroll down and tap "Add to Home Screen". 3. Open the app icon anytime — it runs offline on your device.';
    } else {
      guideBody.textContent =
        'Use your browser address bar Install icon or menu ("Install app" / "Add to Home Screen") to save this simulation to your device for offline use.';
    }
    guideModal.classList.add('pwa-open');
  }

  if (installBtn) {
    installBtn.addEventListener('click', function () {
      if (deferredPrompt && typeof deferredPrompt.prompt === 'function') {
        deferredPrompt.prompt();
        if (deferredPrompt.userChoice && typeof deferredPrompt.userChoice.then === 'function') {
          deferredPrompt.userChoice.then(function (choice) {
            if (choice && choice.outcome === 'accepted' && installWrap) {
              installWrap.classList.add('pwa-hidden');
            }
            deferredPrompt = null;
          }).catch(function () {
            deferredPrompt = null;
          });
        }
      } else {
        showInstallGuide();
      }
    });
  }

  if (dismissBtn && installWrap) {
    dismissBtn.addEventListener('click', function () {
      installWrap.classList.add('pwa-hidden');
    });
  }

  if (guideClose && guideModal) {
    guideClose.addEventListener('click', function () {
      guideModal.classList.remove('pwa-open');
    });
  }

  if (guideModal) {
    guideModal.addEventListener('click', function (e) {
      if (e.target === guideModal) {
        guideModal.classList.remove('pwa-open');
      }
    });
  }

  // 3. Offline connectivity indicator
  function syncOnlineState() {
    if (!offlineBadge) return;
    const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
    offlineBadge.classList.toggle('pwa-visible', offline);
  }
  window.addEventListener('online', syncOnlineState);
  window.addEventListener('offline', syncOnlineState);
  syncOnlineState();
})();
</script>
<!-- HOSTED_PWA_SHELL_END -->`;

  let output = record.html;
  if (/<\/head>/i.test(output)) {
    output = output.replace(/<\/head>/i, () => `${headTags}</head>`);
  } else {
    output = `${headTags}\n${output}`;
  }

  if (/<\/body>/i.test(output)) {
    output = output.replace(/<\/body>/i, () => `\n${bodyPwaShell}\n</body>`);
  } else {
    output = `${output}\n${bodyPwaShell}`;
  }

  return output;
}
