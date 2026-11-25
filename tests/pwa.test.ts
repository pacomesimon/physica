import assert from 'node:assert/strict';
import test from 'node:test';
import { DOUBLE_PENDULUM_HTML } from '../src/lib/demos/doublePendulum.ts';
import { PROJECTILE_MOTION_HTML } from '../src/lib/demos/projectileMotion.ts';
import { injectPreviewBridge } from '../src/lib/bridgeInjector.ts';
import { validateSimulationHtml } from '../src/lib/htmlValidator.ts';
import {
  buildPwaManifest,
  buildPwaServiceWorker,
  buildShortPwaName,
  extractOfflinePrecacheUrls,
  getPublishedSimulation,
  injectHostedPwaShell,
  isValidPublishedId,
  publishSimulation,
} from '../server/publishedStore.ts';
import {
  ensureHybridAssistantEmbedded,
  FIREBASE_AI_CDN_URL,
  FIREBASE_APP_CDN_URL,
  getDefaultFirebaseWebConfig,
  HYBRID_ASSISTANT_START_MARKER,
  stripHybridAssistant,
} from '../src/lib/assistant/embedder.ts';
import { prepareStandaloneExport } from '../src/lib/exporter.ts';
import { getPwaIconAsset, isAllowedPwaIconName } from '../server/pwaAssets.ts';

test('PWA icon assets generate valid PNG headers, exact dimensions, and SVG icon', () => {
  const pngExpectations: Array<{ name: 'pwa-192x192.png' | 'pwa-512x512.png' | 'pwa-maskable-512x512.png' | 'apple-touch-icon.png'; size: number }> = [
    { name: 'pwa-192x192.png', size: 192 },
    { name: 'pwa-512x512.png', size: 512 },
    { name: 'pwa-maskable-512x512.png', size: 512 },
    { name: 'apple-touch-icon.png', size: 180 },
  ];

  const pngSig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  for (const item of pngExpectations) {
    assert.equal(isAllowedPwaIconName(item.name), true);
    const asset = getPwaIconAsset(item.name);
    assert.equal(asset.contentType, 'image/png');
    assert.ok(asset.body.subarray(0, 8).equals(pngSig), `Invalid PNG signature for ${item.name}`);
    const width = asset.body.readUInt32BE(16);
    const height = asset.body.readUInt32BE(20);
    assert.equal(width, item.size);
    assert.equal(height, item.size);
  }

  assert.equal(isAllowedPwaIconName('icon.svg'), true);
  const svgAsset = getPwaIconAsset('icon.svg');
  assert.match(svgAsset.contentType, /image\/svg\+xml/);
  assert.match(svgAsset.body.toString('utf8'), /<svg[\s\S]*<\/svg>/);

  // Disallow path traversal or unknown icon names
  assert.equal(isAllowedPwaIconName('../server.ts'), false);
  assert.equal(isAllowedPwaIconName('evil.png'), false);
});

test('Published simulation store validates input, strips preview bridge, and enforces strict IDs', () => {
  const bridged = injectPreviewBridge(DOUBLE_PENDULUM_HTML);
  const record = publishSimulation({
    html: bridged,
    title: 'Double Pendulum Lab',
  });

  assert.equal(isValidPublishedId(record.id), true);
  assert.doesNotMatch(record.html, /data-physica-preview-bridge/);
  assert.equal(record.shortName.length <= 12, true);

  // Content-addressed deterministic publishing returns identical ID
  const duplicate = publishSimulation({
    html: DOUBLE_PENDULUM_HTML,
    title: 'Double Pendulum Lab',
  });
  assert.equal(duplicate.id, record.id);

  // Retrieval works for valid ID and rejects traversal / invalid IDs
  assert.equal(getPublishedSimulation(record.id)?.id, record.id);
  assert.equal(isValidPublishedId('../etc/passwd'), false);
  assert.equal(getPublishedSimulation('../etc/passwd'), null);
  assert.equal(getPublishedSimulation('not-a-valid-id'), null);

  // Rejects HTML with exposed API keys or missing Three.js
  assert.throws(() =>
    publishSimulation({
      html: '<!DOCTYPE html><html><body><script>const k="AIzaSy123456789012345678901"; new THREE.WebGLRenderer();</script></body></html>',
    })
  );
  assert.throws(() =>
    publishSimulation({
      html: '<!DOCTYPE html><html><body><p>Not a 3D simulation</p></body></html>',
    })
  );

  // Short name always adheres to <= 12 characters
  assert.ok(buildShortPwaName('Electromagnetic Wave Interference Explorer').length <= 12);
});

test('Hosted PWA manifest, offline Service Worker, and in-app install shell meet PWA standards', () => {
  const record = publishSimulation({
    html: PROJECTILE_MOTION_HTML,
    title: 'Projectile Motion',
  });

  // 1. Web App Manifest checks
  const manifest = buildPwaManifest(record) as {
    id: string;
    name: string;
    short_name: string;
    start_url: string;
    scope: string;
    display: string;
    theme_color: string;
    background_color: string;
    icons: Array<{ src: string; sizes: string; type: string; purpose: string }>;
  };

  assert.equal(manifest.id, `/sim/${record.id}/`);
  assert.equal(manifest.start_url, `/sim/${record.id}/`);
  assert.equal(manifest.scope, `/sim/${record.id}/`);
  assert.equal(manifest.display, 'standalone');
  assert.ok(manifest.short_name.length <= 12);
  assert.equal(manifest.icons.some((i) => i.sizes === '192x192' && i.purpose === 'any'), true);
  assert.equal(manifest.icons.some((i) => i.sizes === '512x512' && i.purpose === 'any'), true);
  assert.equal(manifest.icons.some((i) => i.sizes === '512x512' && i.purpose === 'maskable'), true);
  assert.equal(manifest.icons.some((i) => i.purpose.includes('any maskable')), false);

  // 2. Offline precache URL extraction resolves Three.js core & addon imports
  const precacheUrls = extractOfflinePrecacheUrls(record.html);
  assert.ok(precacheUrls.some((u) => u.endsWith('/three.module.js')));
  assert.ok(precacheUrls.some((u) => u.endsWith('/three.core.js')));
  assert.ok(precacheUrls.some((u) => u.includes('OrbitControls.js')));
  assert.ok(precacheUrls.some((u) => u.includes('RoomEnvironment.js')));

  // 3. Scoped Service Worker script checks
  const sw = buildPwaServiceWorker(record);
  assert.match(sw, new RegExp(`/sim/${record.id}/`));
  assert.match(sw, /self\.addEventListener\('install'/);
  assert.match(sw, /self\.addEventListener\('activate'/);
  assert.match(sw, /self\.addEventListener\('fetch'/);
  assert.match(sw, /caches\.open/);
  assert.match(sw, /three\.module\.js/);
  assert.match(sw, /three\.core\.js/);

  // 4. Hosted PWA HTML shell checks
  const hostedHtml = injectHostedPwaShell(record);
  assert.match(hostedHtml, new RegExp(`<link rel="manifest" href="/sim/${record.id}/manifest\\.webmanifest"`));
  assert.match(hostedHtml, /<link rel="apple-touch-icon" href="\/pwa-icons\/apple-touch-icon\.png"/);
  assert.match(hostedHtml, /<meta name="apple-mobile-web-app-capable" content="yes"/);
  assert.match(hostedHtml, /navigator\.serviceWorker\.register/);
  assert.match(hostedHtml, /beforeinstallprompt/);
  assert.match(hostedHtml, /id="physica-pwa-install-btn"/);
  assert.match(hostedHtml, /id="physica-pwa-offline-badge"/);
  assert.match(hostedHtml, /display-mode: standalone/);

  // Hosted HTML still passes standalone simulation validation
  const validation = validateSimulationHtml(hostedHtml);
  assert.equal(validation.valid, true, `Validation errors: ${validation.errors.join('; ')}`);
  assert.equal(validation.hasHybridAssistant, true);
});

test('Firebase Hybrid AI Assistant embeds in standalone HTML and hosted PWA with offline SW caching', () => {
  const fbConfig = getDefaultFirebaseWebConfig();
  assert.ok(fbConfig.projectId.length > 0, 'Provisioned Firebase projectId should be present');
  assert.ok(fbConfig.appId.length > 0, 'Provisioned Firebase appId should be present');
  assert.ok(fbConfig.apiKey.length > 0, 'Provisioned Firebase apiKey should be present');

  // 1. Standalone export embeds assistant cleanly and passes validation
  const pkg = prepareStandaloneExport(DOUBLE_PENDULUM_HTML, 'Double Pendulum Lab');
  assert.equal(pkg.validation.valid, true, `Validation errors: ${pkg.validation.errors.join('; ')}`);
  assert.equal(pkg.validation.hasHybridAssistant, true);
  assert.ok(pkg.html.includes(HYBRID_ASSISTANT_START_MARKER));
  assert.ok(pkg.html.includes('InferenceMode.PREFER_IN_CLOUD'));
  assert.ok(pkg.html.includes('GoogleAIBackend'));
  assert.ok(pkg.html.includes('inCloudParams'));
  assert.ok(pkg.html.includes('onDeviceParams'));
  assert.ok(pkg.html.includes(FIREBASE_APP_CDN_URL));
  assert.ok(pkg.html.includes(FIREBASE_AI_CDN_URL));
  assert.ok(pkg.html.includes('id="physica-ai-launcher"'));
  assert.ok(pkg.html.includes('id="physica-ai-drawer"'));

  // 2. Idempotency: embedding twice does not duplicate markers or scripts
  const doubleEmbedded = ensureHybridAssistantEmbedded(pkg.html);
  const startMatches = doubleEmbedded.match(new RegExp(HYBRID_ASSISTANT_START_MARKER, 'g')) || [];
  assert.equal(startMatches.length, 1);
  assert.equal(stripHybridAssistant(doubleEmbedded).includes(HYBRID_ASSISTANT_START_MARKER), false);

  // 3. Hosted PWA Service Worker pre-caches Firebase App & AI SDK modules for offline fallback
  const record = publishSimulation({
    html: DOUBLE_PENDULUM_HTML,
    title: 'Double Pendulum Lab',
  });
  const precacheUrls = extractOfflinePrecacheUrls(record.html);
  assert.ok(precacheUrls.includes(FIREBASE_APP_CDN_URL));
  assert.ok(precacheUrls.includes(FIREBASE_AI_CDN_URL));
  const sw = buildPwaServiceWorker(record);
  assert.ok(sw.includes('firebase-app.js'));
  assert.ok(sw.includes('firebase-ai.js'));

  // 4. Validator still rejects rogue API keys outside the dedicated public Firebase config tag
  const tampered = pkg.html.replace(
    '</body>',
    '<script>const leaked = "AIzaSy999999999999999999999999999";</script></body>'
  );
  assert.equal(validateSimulationHtml(tampered).valid, false);
});

