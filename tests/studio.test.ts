import assert from 'node:assert/strict';
import test from 'node:test';
import {
  calculateProjectileAnalyticalMetrics,
  calculateProjectilePosition,
  calculateProjectileVelocity,
  PROJECTILE_MOTION_HTML,
} from '../src/lib/demos/projectileMotion.ts';
import { injectPreviewBridge, stripPreviewBridge } from '../src/lib/bridgeInjector.ts';
import { prepareStandaloneExport, slugifyFilename } from '../src/lib/exporter.ts';
import { validateSimulationHtml } from '../src/lib/htmlValidator.ts';
import { parseSimulationMetadata } from '../src/lib/metadataParser.ts';
import { createNextVersion, createSeededProjectileProject } from '../src/lib/storage.ts';
import { normalizeAgentResponse, parseJsonFromText } from '../server/llm/types.ts';

test('Projectile motion physics matches analytical kinematics equations', () => {
  // Ground launch: v0 = 20 m/s, theta = 30 deg, g = 9.81 m/s^2, y0 = 0
  const v0 = 20;
  const angle = 30;
  const g = 9.81;
  const metrics = calculateProjectileAnalyticalMetrics(0, 0, v0, angle, g);

  const expectedVx = 20 * Math.cos(Math.PI / 6);
  const expectedVy0 = 10;
  const expectedFlightTime = (2 * expectedVy0) / g;
  const expectedRange = expectedVx * expectedFlightTime;
  const expectedMaxH = (expectedVy0 * expectedVy0) / (2 * g);

  assert.ok(Math.abs(metrics.vx0 - expectedVx) < 1e-9);
  assert.ok(Math.abs(metrics.vy0 - expectedVy0) < 1e-9);
  assert.ok(Math.abs(metrics.timeOfFlight - expectedFlightTime) < 1e-9);
  assert.ok(Math.abs(metrics.range - expectedRange) < 1e-9);
  assert.ok(Math.abs(metrics.maxHeight - expectedMaxH) < 1e-9);

  // At apex time, vertical velocity must be 0 and height equals maxHeight
  const apexPos = calculateProjectilePosition(0, 0, v0, angle, g, metrics.apexTime);
  const apexVel = calculateProjectileVelocity(v0, angle, g, metrics.apexTime);
  assert.ok(Math.abs(apexPos.y - metrics.maxHeight) < 1e-9);
  assert.ok(Math.abs(apexVel.vy) < 1e-9);
  assert.ok(Math.abs(apexVel.vx - expectedVx) < 1e-9);

  // At timeOfFlight with y0 = 5m, y(T) must equal 0
  const elevatedMetrics = calculateProjectileAnalyticalMetrics(0, 5, 24, 45, 9.81);
  const landingPos = calculateProjectilePosition(0, 5, 24, 45, 9.81, elevatedMetrics.timeOfFlight);
  assert.ok(Math.abs(landingPos.y) < 1e-9);
  assert.ok(Math.abs(landingPos.x - elevatedMetrics.range) < 1e-9);
});

test('Reference Projectile Motion HTML contains complete AI-friendly documentation and 10 sections', () => {
  const validation = validateSimulationHtml(PROJECTILE_MOTION_HTML);
  assert.equal(validation.valid, true);
  assert.equal(validation.hasThreeJs, true);
  assert.equal(validation.hasMetadata, true);
  assert.equal(validation.sectionCount, 10);

  const metadata = parseSimulationMetadata(PROJECTILE_MOTION_HTML);
  assert.equal(metadata.title, 'Projectile Motion');
  assert.equal(metadata.subject, 'Classical Mechanics');
  assert.ok(metadata.governingEquations.length >= 4);
  assert.ok(metadata.learningObjectives.length >= 3);
  assert.ok(metadata.agentGuidance.length >= 3);
});

test('HTML validator rejects empty documents, missing Three.js, and exposed secrets', () => {
  assert.equal(validateSimulationHtml('').valid, false);
  assert.equal(validateSimulationHtml('<!DOCTYPE html><html><body><div>No Three</div></body></html>').valid, false);
  assert.equal(
    validateSimulationHtml(
      '<!DOCTYPE html><html><body><script>const k="AIzaSy123456789012345678901"; new THREE.WebGLRenderer();</script></body></html>'
    ).valid,
    false
  );
});

test('Preview bridge injection and standalone export stripping isolate runtime diagnostics', () => {
  const bridged = injectPreviewBridge(PROJECTILE_MOTION_HTML);
  assert.ok(bridged.includes('data-physica-preview-bridge'));
  assert.ok(bridged.includes('physica-preview'));

  const stripped = stripPreviewBridge(bridged);
  assert.equal(stripped.includes('data-physica-preview-bridge'), false);

  const pkg = prepareStandaloneExport(bridged, 'Projectile Motion Lab');
  assert.equal(pkg.filename, 'projectile-motion-lab.html');
  assert.equal(pkg.html.includes('data-physica-preview-bridge'), false);
  assert.equal(pkg.validation.valid, true);
  assert.ok(pkg.cdnDependencies.some((url) => url.includes('three')));
  assert.equal(slugifyFilename('Double Pendulum (3D)!'), 'double-pendulum-3d.html');
});

test('Agent response parser handles fenced JSON and normalizes structured fields', () => {
  const raw = '```json\n{"responseType":"code_modification","summary":"Added drag force","changedSections":["3. PHYSICS MODEL"],"html":"<!DOCTYPE html><html><body><script>THREE.WebGLRenderer</script></body></html>"}\n```';
  const parsed = parseJsonFromText(raw);
  const normalized = normalizeAgentResponse(parsed, 'gemini', 'gemini-4-hydrogen');
  assert.equal(normalized.responseType, 'code_modification');
  assert.equal(normalized.summary, 'Added drag force');
  assert.deepEqual(normalized.changedSections, ['3. PHYSICS MODEL']);
  assert.ok(normalized.html?.startsWith('<!DOCTYPE html>'));
});

test('Version management creates sequential immutable snapshots', () => {
  const project = createSeededProjectileProject();
  assert.equal(project.versions.length, 1);
  assert.equal(project.versions[0].versionNumber, 1);

  const v2 = createNextVersion(project, project.currentHtml + '\n<!-- v2 -->', 'Added energy bar', 'ai');
  assert.equal(v2.versionNumber, 2);
  assert.equal(v2.source, 'ai');
  assert.notEqual(v2.html, project.versions[0].html);
});
