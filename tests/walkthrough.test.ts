import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BROWSER_DEFAULT_VOICE_VALUE,
  HighlightManager,
  selectWalkthroughVoice,
  WalkthroughController,
  WalkthroughStateManager,
  type DocumentLike,
  type HighlightElementLike,
  type SpeechSynthesisLike,
  type SpeechUtteranceLike,
} from '../src/lib/walkthrough/engine.ts';
import {
  buildStandaloneWalkthroughBundle,
  ensureWalkthroughEmbedded,
  stripWalkthroughBundle,
  validateWalkthroughSelectors,
} from '../src/lib/walkthrough/embedder.ts';
import type {
  SerializableSimulationState,
  SimulationAPI,
  WalkthroughConfig,
} from '../src/lib/walkthrough/types.ts';
import { PROJECTILE_MOTION_HTML } from '../src/lib/demos/projectileMotion.ts';
import { prepareStandaloneExport } from '../src/lib/exporter.ts';
import { EXPECTED_WALKTHROUGH_SECTIONS, parseSimulationMetadata } from '../src/lib/metadataParser.ts';
import { validateSimulationHtml } from '../src/lib/htmlValidator.ts';

// ---------------------------------------------------------------------------
// Test Doubles: Mock SpeechSynthesis, Mock DOM, and Mock SimulationAPI
// ---------------------------------------------------------------------------
function createMockSpeech() {
  const spoken: SpeechUtteranceLike[] = [];
  let cancelCount = 0;
  let pauseCount = 0;
  let resumeCount = 0;

  const synth: SpeechSynthesisLike & {
    spoken: SpeechUtteranceLike[];
    getCancelCount: () => number;
    getPauseCount: () => number;
    getResumeCount: () => number;
  } = {
    speaking: false,
    paused: false,
    pending: false,
    spoken,
    getCancelCount: () => cancelCount,
    getPauseCount: () => pauseCount,
    getResumeCount: () => resumeCount,
    getVoices: () => [{ name: 'English US', lang: 'en-US', default: true }],
    speak(utterance) {
      spoken.push(utterance);
      this.speaking = true;
      this.paused = false;
      utterance.onstart?.({});
    },
    pause() {
      pauseCount += 1;
      this.paused = true;
      const last = spoken[spoken.length - 1];
      last?.onpause?.({});
    },
    resume() {
      resumeCount += 1;
      this.paused = false;
      const last = spoken[spoken.length - 1];
      last?.onresume?.({});
    },
    cancel() {
      cancelCount += 1;
      this.speaking = false;
      this.paused = false;
    },
  };

  const createUtterance = (text: string): SpeechUtteranceLike => ({
    text,
    lang: 'en-US',
    rate: 1,
    pitch: 1,
    volume: 1,
    onstart: null,
    onend: null,
    onpause: null,
    onresume: null,
    onerror: null,
  });

  return { synth, createUtterance };
}

function createMockElement(id: string): HighlightElementLike & { id: string; classes: Set<string> } {
  const classes = new Set<string>();
  return {
    id,
    classes,
    classList: {
      add(cls: string) {
        classes.add(cls);
      },
      remove(cls: string) {
        classes.delete(cls);
      },
      contains(cls: string) {
        return classes.has(cls);
      },
    },
  };
}

function createMockDocument(ids: string[]) {
  const elements = new Map<string, ReturnType<typeof createMockElement>>();
  for (const id of ids) {
    elements.set(`#${id}`, createMockElement(id));
  }

  const doc: DocumentLike = {
    querySelector(selector: string) {
      return elements.get(selector) ?? null;
    },
    querySelectorAll(selector: string) {
      if (selector === '.walkthrough-highlight') {
        return Array.from(elements.values()).filter((el) => el.classes.has('walkthrough-highlight'));
      }
      const match = elements.get(selector);
      return match ? [match] : [];
    },
  };

  return { doc, elements };
}

function createMockSimulationAPI(initial: SerializableSimulationState): SimulationAPI & {
  getSetStateCalls: () => SerializableSimulationState[];
} {
  let state: SerializableSimulationState = JSON.parse(JSON.stringify(initial));
  const setStateCalls: SerializableSimulationState[] = [];

  return {
    getSetStateCalls: () => setStateCalls,
    getState() {
      return JSON.parse(JSON.stringify(state));
    },
    setState(next) {
      state = JSON.parse(JSON.stringify(next));
      setStateCalls.push(JSON.parse(JSON.stringify(next)));
    },
    getParameters() {
      return { ...state.parameters };
    },
    setParameter(name, value) {
      state.parameters[name] = value;
    },
    play() {
      state.running = true;
    },
    pause() {
      state.running = false;
    },
    reset() {
      state = JSON.parse(JSON.stringify(initial));
    },
  };
}

const SAMPLE_CONFIG: WalkthroughConfig = {
  title: 'Test Guided Walkthrough',
  description: 'Unit test walkthrough config',
  language: 'en-US',
  segments: [
    {
      id: 'intro',
      title: 'Introduction',
      text: 'Welcome to the projectile simulation.',
      durationEstimate: 10,
      highlight: ['#telemetry-panel'],
      checkpoint: 'initial',
    },
    {
      id: 'velocity',
      title: 'Velocity & Angle',
      text: 'Adjust initial speed and angle.',
      durationEstimate: 12,
      highlight: ['#velocity-control', '#angle-control'],
      checkpoint: 'velocity',
    },
    {
      id: 'gravity',
      title: 'Gravity & Equations',
      text: 'Compare Earth and Moon gravity.',
      durationEstimate: 8,
      highlight: ['#gravity-control', '#nonexistent-control'],
      checkpoint: 'gravity',
    },
  ],
};

// ---------------------------------------------------------------------------
// 1. Speech Engine Tests
// ---------------------------------------------------------------------------
test('Speech engine: start, pause, resume, auto-advance, and stop lifecycle', () => {
  const { synth, createUtterance } = createMockSpeech();
  const { doc } = createMockDocument([
    'telemetry-panel',
    'velocity-control',
    'angle-control',
    'gravity-control',
  ]);
  const simApi = createMockSimulationAPI({
    time: 0,
    running: true,
    parameters: { v0: 24, angleDeg: 45, g: 9.81 },
    controls: { showVectors: true },
    camera: { position: [28, 18, 44], target: [24, 6, 0] },
  });

  const controller = new WalkthroughController({
    config: SAMPLE_CONFIG,
    simulationAPI: simApi,
    speechSynthesis: synth,
    createUtterance,
    document: doc,
  });

  controller.play();
  assert.equal(controller.getState().status, 'playing');
  assert.equal(controller.getState().activeSegmentIndex, 0);
  assert.equal(synth.spoken.length, 1);
  assert.equal(synth.spoken[0].text, SAMPLE_CONFIG.segments[0].text);

  // Pause and resume without duplicating utterances
  controller.pause();
  assert.equal(controller.getState().status, 'paused');
  assert.equal(synth.getPauseCount(), 1);

  controller.resume();
  assert.equal(controller.getState().status, 'playing');
  assert.equal(synth.getResumeCount(), 1);
  assert.equal(synth.spoken.length, 1);

  // Completing segment 0 automatically advances to segment 1
  synth.spoken[0].onend?.({});
  assert.equal(controller.getState().activeSegmentIndex, 1);
  assert.equal(synth.spoken.length, 2);
  assert.equal(synth.spoken[1].text, SAMPLE_CONFIG.segments[1].text);

  // Completing segment 1 advances to segment 2, then completing segment 2 finishes cleanly
  synth.spoken[1].onend?.({});
  assert.equal(controller.getState().activeSegmentIndex, 2);
  synth.spoken[2].onend?.({});
  assert.equal(controller.getState().status, 'completed');
  assert.equal(controller.highlighter.getActiveSelectors().length, 0);

  controller.dispose();
});

test('Speech engine: prevents overlapping utterances and ignores stale onend callbacks', () => {
  const { synth, createUtterance } = createMockSpeech();
  const simApi = createMockSimulationAPI({
    time: 0,
    running: true,
    parameters: { v0: 24 },
  });

  const controller = new WalkthroughController({
    config: SAMPLE_CONFIG,
    simulationAPI: simApi,
    speechSynthesis: synth,
    createUtterance,
  });

  controller.play();
  const firstUtterance = synth.spoken[0];

  // Rapid repeated play() while already playing is idempotent
  controller.play();
  assert.equal(synth.spoken.length, 1);

  // Seek directly to segment 2; stale onend from utterance 0 must be ignored
  controller.seekToSegment(2, true);
  assert.equal(controller.getState().activeSegmentIndex, 2);
  assert.equal(synth.spoken.length, 2);

  firstUtterance.onend?.({});
  assert.equal(controller.getState().activeSegmentIndex, 2);
  assert.equal(controller.getState().status, 'playing');

  controller.dispose();
});

test('Speech engine: graceful silent transcript fallback when speech errors or is unavailable', async () => {
  const shortConfig: WalkthroughConfig = {
    title: 'Short Silent Test',
    description: 'Verifies silent fallback progression',
    language: 'en-US',
    segments: [
      { id: 's1', text: 'First', durationEstimate: 1, highlight: [] },
      { id: 's2', text: 'Second', durationEstimate: 1, highlight: [] },
    ],
  };

  // Case A: speechSynthesis unavailable (null)
  const simApiA = createMockSimulationAPI({ time: 0, running: false, parameters: {} });
  const silentCtrl = new WalkthroughController({
    config: shortConfig,
    simulationAPI: simApiA,
    speechSynthesis: null,
    createUtterance: undefined,
    speechRate: 2.0,
  });

  assert.equal(silentCtrl.getState().speechSupported, false);
  silentCtrl.play();
  assert.equal(silentCtrl.getState().status, 'playing');
  assert.equal(silentCtrl.getState().activeSegmentIndex, 0);
  await new Promise((r) => setTimeout(r, 620));
  assert.equal(silentCtrl.getState().activeSegmentIndex, 1);
  silentCtrl.dispose();

  // Case B: speechSynthesis fires non-cancel error -> falls back cleanly
  const { synth, createUtterance } = createMockSpeech();
  const simApiB = createMockSimulationAPI({ time: 0, running: false, parameters: {} });
  const errorCtrl = new WalkthroughController({
    config: shortConfig,
    simulationAPI: simApiB,
    speechSynthesis: synth,
    createUtterance,
    speechRate: 2.0,
  });

  errorCtrl.play();
  synth.spoken[0].onerror?.({ error: 'audio-hardware' });
  assert.match(errorCtrl.getState().errorMessage ?? '', /silent transcript mode/i);
  await new Promise((r) => setTimeout(r, 620));
  assert.equal(errorCtrl.getState().activeSegmentIndex, 1);
  errorCtrl.dispose();
});

// ---------------------------------------------------------------------------
// 2. Playback Controller & Highlighting Tests
// ---------------------------------------------------------------------------
test('Playback controller & HighlightManager: multi-target highlighting, clearing, and missing selector tolerance', () => {
  const { doc, elements } = createMockDocument([
    'telemetry-panel',
    'velocity-control',
    'angle-control',
    'gravity-control',
  ]);
  const highlighter = new HighlightManager(doc);

  // Single target
  const matched1 = highlighter.highlightTargets(['#telemetry-panel']);
  assert.deepEqual(matched1, ['#telemetry-panel']);
  assert.equal(elements.get('#telemetry-panel')?.classes.has('walkthrough-highlight'), true);

  // Multi-target clears previous highlight first
  const matched2 = highlighter.highlightTargets(['#velocity-control', '#angle-control']);
  assert.deepEqual(matched2, ['#velocity-control', '#angle-control']);
  assert.equal(elements.get('#telemetry-panel')?.classes.has('walkthrough-highlight'), false);
  assert.equal(elements.get('#velocity-control')?.classes.has('walkthrough-highlight'), true);
  assert.equal(elements.get('#angle-control')?.classes.has('walkthrough-highlight'), true);

  // Missing target is skipped without throwing
  const matched3 = highlighter.highlightTargets(['#gravity-control', '#missing-node']);
  assert.deepEqual(matched3, ['#gravity-control']);
  assert.equal(elements.get('#gravity-control')?.classes.has('walkthrough-highlight'), true);

  highlighter.clearWalkthroughHighlights();
  assert.equal(elements.get('#gravity-control')?.classes.has('walkthrough-highlight'), false);
});

test('Playback controller: seekToProgress, replayCurrentSegment, and stop/restart idempotency', () => {
  const { synth, createUtterance } = createMockSpeech();
  const { doc, elements } = createMockDocument([
    'telemetry-panel',
    'velocity-control',
    'angle-control',
    'gravity-control',
  ]);
  const simApi = createMockSimulationAPI({
    time: 0,
    running: true,
    parameters: { v0: 24, angleDeg: 45, g: 9.81 },
  });

  const controller = new WalkthroughController({
    config: SAMPLE_CONFIG,
    simulationAPI: simApi,
    speechSynthesis: synth,
    createUtterance,
    document: doc,
  });

  // Total duration = 10 + 12 + 8 = 30s -> 50% (15s) lands inside segment 1 (10s..22s)
  controller.seekToProgress(0.5);
  assert.equal(controller.getState().activeSegmentIndex, 1);
  assert.equal(controller.getState().walkthroughTimeMs, 10000);
  assert.equal(elements.get('#velocity-control')?.classes.has('walkthrough-highlight'), true);
  assert.equal(elements.get('#angle-control')?.classes.has('walkthrough-highlight'), true);

  // Replay current segment keeps index 1 and starts fresh utterance
  const countBefore = synth.spoken.length;
  controller.replayCurrentSegment();
  assert.equal(controller.getState().activeSegmentIndex, 1);
  assert.equal(synth.spoken.length, countBefore + 1);

  // Stop clears highlights and resets to ready; repeated stop is safe
  controller.stop();
  controller.stop();
  assert.equal(controller.getState().status, 'ready');
  assert.equal(controller.getState().activeSegmentIndex, -1);
  assert.equal(controller.getState().walkthroughTimeMs, 0);
  assert.equal(elements.get('#velocity-control')?.classes.has('walkthrough-highlight'), false);

  controller.dispose();
});

// ---------------------------------------------------------------------------
// 3. Simulation State Management & Deterministic Reconstruction Tests
// ---------------------------------------------------------------------------
test('State synchronization: Pause & Resume preserve edits made before and during pause', () => {
  const { synth, createUtterance } = createMockSpeech();
  const simApi = createMockSimulationAPI({
    time: 0,
    running: true,
    parameters: { v0: 24, angleDeg: 45, g: 9.81 },
    controls: { showVectors: true },
    camera: { position: [28, 18, 44], target: [24, 6, 0] },
  });

  const controller = new WalkthroughController({
    config: SAMPLE_CONFIG,
    simulationAPI: simApi,
    speechSynthesis: synth,
    createUtterance,
  });

  controller.play();

  // Student modifies velocity while walkthrough plays
  simApi.setParameter('v0', 32);
  controller.recordInteraction({
    type: 'parameter-change',
    target: 'v0',
    previousValue: 24,
    newValue: 32,
  });

  // Pause walkthrough
  controller.pause();
  assert.equal(simApi.getParameters().v0, 32);

  // Student experiments during pause (changes launch angle & camera)
  const pausedState = simApi.getState();
  pausedState.parameters.angleDeg = 60;
  pausedState.time = 1.45;
  pausedState.camera = { position: [12, 22, 30], target: [20, 5, 0] };
  simApi.setState(pausedState);
  controller.recordInteraction({
    type: 'parameter-change',
    target: 'angleDeg',
    previousValue: 45,
    newValue: 60,
  });

  // Resume walkthrough -> must preserve both v0=32 AND paused edits (angleDeg=60, time=1.45, camera)
  controller.resume();
  const afterResume = simApi.getState();
  assert.equal(afterResume.parameters.v0, 32);
  assert.equal(afterResume.parameters.angleDeg, 60);
  assert.equal(afterResume.time, 1.45);
  assert.deepEqual(afterResume.camera?.position, [12, 22, 30]);

  // Stop -> must restore initial baseline state
  controller.stop();
  const afterStop = simApi.getState();
  assert.equal(afterStop.parameters.v0, 24);
  assert.equal(afterStop.parameters.angleDeg, 45);
  assert.equal(afterStop.time, 0);
  assert.deepEqual(afterStop.camera?.position, [28, 18, 44]);

  controller.dispose();
});

test('State synchronization: deterministic backward and forward seek reconstruction', () => {
  const simApi = createMockSimulationAPI({
    time: 0,
    running: true,
    parameters: { v0: 24, angleDeg: 45, g: 9.81, showVectors: true },
    controls: { showVectors: true },
    camera: { position: [28, 18, 44], target: [24, 6, 0] },
  });

  const manager = new WalkthroughStateManager(simApi);
  manager.captureInitialState(); // t = 0, seg 0: v0=24, angle=45, g=9.81

  // At t = 4000ms (seg 0), student raises v0 to 30
  simApi.setParameter('v0', 30);
  manager.recordInteraction(4000, 0, 'intro', {
    type: 'parameter-change',
    target: 'v0',
    previousValue: 24,
    newValue: 30,
  });

  // Segment 1 checkpoint at t = 10000ms captures v0=30, angle=45
  manager.captureSnapshot(10000, 1, 'velocity', 'segment');

  // At t = 15000ms (seg 1), student changes angleDeg to 62 and disables vectors
  simApi.setParameter('angleDeg', 62);
  manager.recordInteraction(15000, 1, 'velocity', {
    type: 'parameter-change',
    target: 'angleDeg',
    previousValue: 45,
    newValue: 62,
  });
  simApi.setParameter('showVectors', false);
  manager.recordInteraction(16000, 1, 'velocity', {
    type: 'control-toggle',
    target: 'showVectors',
    previousValue: true,
    newValue: false,
  });

  // At t = 25000ms (seg 2), student switches gravity to Moon (1.62)
  manager.captureSnapshot(22000, 2, 'gravity', 'segment');
  simApi.setParameter('g', 1.62);
  manager.recordInteraction(25000, 2, 'gravity', {
    type: 'parameter-change',
    target: 'g',
    previousValue: 9.81,
    newValue: 1.62,
  });

  // Backward seek to t = 0 (start of seg 0) -> excludes ALL later edits
  const atStart = manager.restoreForSeek(0, 0);
  assert.equal(atStart?.parameters.v0, 24);
  assert.equal(atStart?.parameters.angleDeg, 45);
  assert.equal(atStart?.parameters.g, 9.81);
  assert.equal(atStart?.parameters.showVectors, true);

  // Seek to t = 10000 (start of seg 1) -> includes v0=30, excludes angle=62 & g=1.62
  const atSeg1 = manager.restoreForSeek(10000, 1);
  assert.equal(atSeg1?.parameters.v0, 30);
  assert.equal(atSeg1?.parameters.angleDeg, 45);
  assert.equal(atSeg1?.parameters.g, 9.81);

  // Forward seek to t = 18000 -> includes v0=30, angle=62, showVectors=false, excludes g=1.62
  const atMidSeg1 = manager.restoreForSeek(18000, 1);
  assert.equal(atMidSeg1?.parameters.v0, 30);
  assert.equal(atMidSeg1?.parameters.angleDeg, 62);
  assert.equal(atMidSeg1?.parameters.showVectors, false);
  assert.equal(atMidSeg1?.controls?.showVectors, false);
  assert.equal(atMidSeg1?.parameters.g, 9.81);

  // Forward seek to t = 26000 -> includes Moon gravity g=1.62
  const atSeg2 = manager.restoreForSeek(26000, 2);
  assert.equal(atSeg2?.parameters.g, 1.62);
  assert.equal(atSeg2?.parameters.angleDeg, 62);
});

// ---------------------------------------------------------------------------
// 4. Reference Simulation & Standalone Export Verification
// ---------------------------------------------------------------------------
test('Reference Projectile Motion & Standalone Export: complete walkthrough, simulationAPI, valid selectors, and all 11 AI doc sections', () => {
  const pkg = prepareStandaloneExport(PROJECTILE_MOTION_HTML, 'Projectile Motion');

  assert.equal(pkg.validation.valid, true, `Validation errors: ${pkg.validation.errors.join('; ')}`);
  assert.equal(pkg.validation.hasWalkthroughConfig, true);
  assert.equal(pkg.validation.hasSimulationApi, true);
  assert.equal(pkg.validation.hasWalkthroughEngine, true);
  assert.equal(pkg.validation.walkthroughSegmentCount, 6);
  assert.deepEqual(pkg.validation.missingHighlightSelectors, []);

  const meta = parseSimulationMetadata(pkg.html);
  assert.equal(meta.title, 'Projectile Motion');
  assert.equal(meta.walkthroughTitle, 'Guided Tour: 3D Projectile Motion');
  assert.equal(meta.presentSections.length, 10);
  assert.equal(meta.walkthroughDocSections?.length, EXPECTED_WALKTHROUGH_SECTIONS.length);
  for (const sec of EXPECTED_WALKTHROUGH_SECTIONS) {
    assert.ok(
      meta.walkthroughDocSections?.includes(sec),
      `Expected documented walkthrough/AI section ${sec} in exported HTML`
    );
  }

  // Verify non-blocking highlight styling, hidden-by-default transcript, bottom captions, & standalone speech synthesis
  assert.match(pkg.html, /id="walkthrough-panel"/);
  assert.match(pkg.html, /id="walkthrough-transcript"\s+class="wt-hidden"/);
  assert.match(pkg.html, /id="wt-btn-transcript"[^>]*>Show Transcript<\/button>/);
  assert.match(pkg.html, /id="walkthrough-caption"/);
  assert.match(pkg.html, /#walkthrough-caption\s*\{[\s\S]*background:\s*rgba\(0,\s*0,\s*0,\s*0\.5\);[\s\S]*color:\s*#ffffff;/);
  assert.match(pkg.html, /id="wt-btn-captions"[^>]*>Hide Captions<\/button>/);
  assert.match(pkg.html, /captionsVisible:\s*true/);
  assert.match(pkg.html, /setCaptionsVisible:\s*setCaptionsVisible/);
  assert.match(pkg.html, /window\.speechSynthesis/);
  assert.match(pkg.html, /window\.WALKTHROUGH_STATE_CHECKPOINTS/);
  assert.match(pkg.html, /window\.WALKTHROUGH_INTERACTION_HISTORY/);
  assert.match(pkg.html, /window\.simulationAPI/);
  assert.doesNotMatch(pkg.html, /physica-studio-preview-bridge/);
  assert.doesNotMatch(pkg.html, /GEMINI_API_KEY/);

  // Verify selector validator catches broken selectors accurately
  const broken = PROJECTILE_MOTION_HTML.replace('#velocity-control', '#non-existent-slider');
  const check = validateWalkthroughSelectors(broken);
  assert.ok(check.missingSelectors.includes('#non-existent-slider'));

  // Verify stripWalkthroughBundle + ensureWalkthroughEmbedded round-trips cleanly
  const stripped = stripWalkthroughBundle(pkg.html);
  assert.doesNotMatch(stripped, /id="walkthrough-panel"/);
  const reEmbedded = ensureWalkthroughEmbedded(stripped, 'Google UK English Female');
  const reVal = validateSimulationHtml(reEmbedded);
  assert.equal(reVal.valid, true);
  assert.equal(reVal.hasWalkthroughEngine, true);
  assert.match(reEmbedded, /Google UK English Female/);
  assert.ok(buildStandaloneWalkthroughBundle().includes('WALKTHROUGH_PLAYBACK_ENGINE'));
});

test('Speech engine: honors preferredVoice selection and updates live via setPreferredVoice', () => {
  const { synth, createUtterance } = createMockSpeech();
  synth.getVoices = () => [
    { name: 'Samantha', lang: 'en-US', voiceURI: 'com.apple.voice.Samantha', default: true },
    { name: 'Daniel', lang: 'en-GB', voiceURI: 'com.apple.voice.Daniel', default: false },
  ];

  const simApi = createMockSimulationAPI({
    time: 0,
    running: true,
    parameters: { v0: 24 },
  });

  const controller = new WalkthroughController({
    config: SAMPLE_CONFIG,
    simulationAPI: simApi,
    speechSynthesis: synth,
    createUtterance,
    preferredVoice: 'com.apple.voice.Daniel',
  });

  controller.play();
  assert.equal((synth.spoken[0].voice as { name?: string })?.name, 'Daniel');

  // Switch preferred voice live while narrating
  controller.setPreferredVoice('com.apple.voice.Samantha');
  assert.equal((synth.spoken[1].voice as { name?: string })?.name, 'Samantha');

  // Unknown voice gracefully falls back to language-matched voice
  controller.setPreferredVoice('non-existent-voice-uri');
  assert.equal((synth.spoken[2].voice as { name?: string })?.name, 'Samantha');

  controller.dispose();
});

test('Speech engine: default voice prioritizes Google US English (en-US), then Google+English, then Browser Default', () => {
  const allVoices = [
    { name: 'Samantha', lang: 'en-US', voiceURI: 'Samantha', default: true },
    { name: 'Google UK English Female', lang: 'en-GB', voiceURI: 'Google UK English Female' },
    { name: 'Google US English', lang: 'en-US', voiceURI: 'Google US English' },
    { name: 'Google Deutsch', lang: 'de-DE', voiceURI: 'Google Deutsch' },
  ];

  // 1. Default prefers Google US English (en-US)
  assert.equal(selectWalkthroughVoice(allVoices, '', 'en-US')?.name, 'Google US English');

  // 2. If Google US English is unavailable, picks another voice containing both "google" and "english"
  const withoutUs = allVoices.filter((v) => v.name !== 'Google US English');
  assert.equal(selectWalkthroughVoice(withoutUs, '', 'en-US')?.name, 'Google UK English Female');

  // 3. If no Google English voice exists, falls back to Browser Default (Auto-match language)
  const withoutGoogleEnglish = [
    { name: 'Google Deutsch', lang: 'de-DE', voiceURI: 'Google Deutsch' },
    { name: 'Samantha', lang: 'en-US', voiceURI: 'Samantha', default: true },
  ];
  assert.equal(selectWalkthroughVoice(withoutGoogleEnglish, '', 'en-US')?.name, 'Samantha');

  // 4. Explicit Browser Default selection skips Google priority and uses browser default / language match
  assert.equal(
    selectWalkthroughVoice(allVoices, BROWSER_DEFAULT_VOICE_VALUE, 'en-US')?.name,
    'Samantha'
  );
});
