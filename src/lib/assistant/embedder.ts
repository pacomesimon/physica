import firebaseAppletConfig from '../../../firebase-applet-config.json';
import { parseSimulationMetadata } from '../metadataParser.ts';

export const HYBRID_ASSISTANT_START_MARKER = '<!-- HYBRID_AI_ASSISTANT_START -->';
export const HYBRID_ASSISTANT_END_MARKER = '<!-- HYBRID_AI_ASSISTANT_END -->';

export const FIREBASE_SDK_VERSION = '13.4.0';
export const FIREBASE_APP_CDN_URL = `https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}/firebase-app.js`;
export const FIREBASE_AI_CDN_URL = `https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}/firebase-ai.js`;
export const DEFAULT_HYBRID_CLOUD_MODEL = 'gemini-2.5-flash';

export interface FirebaseWebConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket?: string;
  messagingSenderId?: string;
  appId: string;
}

export interface HybridAssistantOptions {
  firebaseConfig?: FirebaseWebConfig;
  cloudModel?: string;
}

/**
 * Returns the public Firebase Web SDK configuration provisioned for this applet.
 * Only includes standard client-safe Firebase Web App identifiers.
 */
export function getDefaultFirebaseWebConfig(): FirebaseWebConfig {
  const raw = firebaseAppletConfig as Partial<FirebaseWebConfig>;
  return {
    apiKey: raw.apiKey || '',
    authDomain: raw.authDomain || '',
    projectId: raw.projectId || '',
    ...(raw.storageBucket ? { storageBucket: raw.storageBucket } : {}),
    ...(raw.messagingSenderId ? { messagingSenderId: raw.messagingSenderId } : {}),
    appId: raw.appId || '',
  };
}

function safeJsonForScriptTag(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

function escapeHtmlText(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function stripHybridAssistant(html: string): string {
  const pattern = new RegExp(
    `\\r?\\n?${HYBRID_ASSISTANT_START_MARKER}[\\s\\S]*?${HYBRID_ASSISTANT_END_MARKER}`,
    'g'
  );
  return html.replace(pattern, '');
}

export function buildHybridAssistantBundle(
  sourceHtml: string,
  options?: HybridAssistantOptions
): string {
  const firebaseConfig = options?.firebaseConfig ?? getDefaultFirebaseWebConfig();
  const cloudModel = options?.cloudModel || DEFAULT_HYBRID_CLOUD_MODEL;
  const meta = parseSimulationMetadata(sourceHtml);

  const simContext = {
    title: meta.title || 'Physics Simulation',
    subject: meta.subject || 'Physics',
    topic: meta.topic || '',
    difficulty: meta.difficulty || '',
    governingEquations: (meta.governingEquations || []).slice(0, 8),
    learningObjectives: (meta.learningObjectives || []).slice(0, 6),
    interactiveParameters: (meta.interactiveParameters || []).slice(0, 10),
    cloudModel,
  };

  const safeTitle = escapeHtmlText(simContext.title);
  const firebaseConfigJson = safeJsonForScriptTag(firebaseConfig);
  const simContextJson = safeJsonForScriptTag(simContext);

  return `${HYBRID_ASSISTANT_START_MARKER}
<!--
  FIREBASE AI LOGIC HYBRID ASSISTANT (Online Gemini -> Offline On-Device Fallback)
  Uses Firebase JS SDK v${FIREBASE_SDK_VERSION} (firebase/ai) with InferenceMode.PREFER_IN_CLOUD.
-->
<script type="application/json" id="physica-firebase-config" data-physica-firebase-config>${firebaseConfigJson}</script>
<script type="application/json" id="physica-assistant-context">${simContextJson}</script>
<style id="physica-ai-assistant-styles">
  #physica-ai-launcher {
    position: fixed;
    bottom: 16px;
    right: 16px;
    z-index: 44;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 9px 14px;
    border-radius: 10px;
    background: linear-gradient(135deg, #0284c7, #2563eb);
    border: 1px solid rgba(125, 211, 252, 0.55);
    color: #ffffff;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    font-size: 12.5px;
    font-weight: 600;
    letter-spacing: -0.01em;
    cursor: pointer;
    box-shadow: 0 10px 26px rgba(2, 6, 23, 0.52);
    transition: transform 0.16s ease, box-shadow 0.16s ease, filter 0.16s ease;
    user-select: none;
  }

  #physica-ai-launcher:hover {
    transform: translateY(-1px);
    filter: brightness(1.08);
    box-shadow: 0 14px 30px rgba(2, 6, 23, 0.6);
  }

  #physica-ai-launcher[aria-expanded="true"] {
    background: #1e293b;
    border-color: rgba(148, 163, 184, 0.45);
  }

  #physica-ai-drawer {
    position: fixed;
    bottom: 64px;
    right: 16px;
    z-index: 45;
    width: min(372px, calc(100vw - 24px));
    height: min(490px, calc(100vh - 96px));
    display: none;
    flex-direction: column;
    background: rgba(15, 23, 42, 0.96);
    border: 1px solid rgba(148, 163, 184, 0.3);
    border-radius: 12px;
    color: #f8fafc;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    font-size: 12.5px;
    box-shadow: 0 20px 48px rgba(2, 6, 23, 0.65);
    overflow: hidden;
    backdrop-filter: blur(12px);
    user-select: text;
  }

  #physica-ai-drawer.ai-open {
    display: flex;
  }

  .physica-ai-header {
    padding: 11px 13px;
    border-bottom: 1px solid rgba(148, 163, 184, 0.18);
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 8px;
    background: rgba(15, 23, 42, 0.98);
    flex-shrink: 0;
  }

  .physica-ai-title-wrap {
    min-width: 0;
  }

  .physica-ai-title {
    font-size: 13px;
    font-weight: 600;
    color: #f8fafc;
    line-height: 1.3;
  }

  .physica-ai-subtitle {
    margin-top: 2px;
    font-size: 10.5px;
    color: #94a3b8;
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
  }

  .physica-ai-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: #38bdf8;
    display: inline-block;
    flex-shrink: 0;
  }

  .physica-ai-dot.ai-dot-offline {
    background: #f59e0b;
  }

  .physica-ai-dot.ai-dot-ready {
    background: #10b981;
  }

  .physica-ai-header-actions {
    display: flex;
    align-items: center;
    gap: 4px;
    flex-shrink: 0;
  }

  .physica-ai-icon-btn {
    background: transparent;
    border: 1px solid rgba(148, 163, 184, 0.28);
    color: #cbd5e1;
    border-radius: 6px;
    padding: 3px 7px;
    font-size: 11px;
    cursor: pointer;
    line-height: 1.3;
  }

  .physica-ai-icon-btn:hover {
    background: rgba(148, 163, 184, 0.16);
    color: #ffffff;
  }

  #physica-ai-offline-banner {
    display: none;
    padding: 7px 12px;
    background: rgba(30, 41, 59, 0.9);
    border-bottom: 1px solid rgba(148, 163, 184, 0.16);
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    font-size: 11px;
    color: #cbd5e1;
    flex-shrink: 0;
  }

  #physica-ai-offline-banner.ai-visible {
    display: flex;
  }

  #physica-ai-prepare-btn {
    background: #0f766e;
    border: 1px solid #2dd4bf;
    color: #f0fdfa;
    border-radius: 6px;
    padding: 4px 8px;
    font-size: 10.5px;
    font-weight: 600;
    cursor: pointer;
    white-space: nowrap;
  }

  #physica-ai-prepare-btn:hover:not(:disabled) {
    background: #115e59;
  }

  #physica-ai-prepare-btn:disabled {
    opacity: 0.65;
    cursor: default;
  }

  #physica-ai-messages {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    scroll-behavior: smooth;
  }

  .physica-ai-empty {
    display: flex;
    flex-direction: column;
    gap: 10px;
    color: #cbd5e1;
    font-size: 12px;
    line-height: 1.48;
  }

  .physica-ai-suggestions {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .physica-ai-suggestion {
    text-align: left;
    background: rgba(30, 41, 59, 0.88);
    border: 1px solid rgba(148, 163, 184, 0.24);
    color: #e2e8f0;
    border-radius: 8px;
    padding: 7px 10px;
    font-size: 11.5px;
    cursor: pointer;
    transition: border-color 0.14s ease, background 0.14s ease;
  }

  .physica-ai-suggestion:hover {
    background: rgba(51, 65, 85, 0.92);
    border-color: rgba(56, 189, 248, 0.55);
  }

  .physica-ai-msg {
    display: flex;
    flex-direction: column;
    gap: 4px;
    max-width: 92%;
  }

  .physica-ai-msg.ai-user {
    align-self: flex-end;
    align-items: flex-end;
  }

  .physica-ai-msg.ai-bot {
    align-self: flex-start;
    align-items: flex-start;
  }

  .physica-ai-bubble {
    padding: 8px 11px;
    border-radius: 10px;
    line-height: 1.5;
    font-size: 12px;
    word-break: break-word;
  }

  .physica-ai-msg.ai-user .physica-ai-bubble {
    background: #0284c7;
    color: #ffffff;
    border-bottom-right-radius: 3px;
    white-space: pre-wrap;
  }

  .physica-ai-msg.ai-bot .physica-ai-bubble {
    background: rgba(30, 41, 59, 0.94);
    border: 1px solid rgba(148, 163, 184, 0.22);
    color: #f1f5f9;
    border-bottom-left-radius: 3px;
  }

  .physica-ai-msg.ai-error .physica-ai-bubble {
    background: rgba(127, 29, 29, 0.55);
    border-color: rgba(248, 113, 113, 0.45);
    color: #fee2e2;
  }

  .physica-ai-bubble > :first-child {
    margin-top: 0;
  }

  .physica-ai-bubble > :last-child {
    margin-bottom: 0;
  }

  .physica-ai-md-p {
    margin: 0 0 7px 0;
  }

  .physica-ai-md-h {
    margin: 9px 0 4px 0;
    font-weight: 700;
    color: #f8fafc;
    line-height: 1.35;
  }

  .physica-ai-md-h1 { font-size: 13.5px; }
  .physica-ai-md-h2 { font-size: 13px; }
  .physica-ai-md-h3,
  .physica-ai-md-h4 { font-size: 12.25px; color: #bae6fd; }

  .physica-ai-md-list {
    margin: 0 0 7px 0;
    padding-left: 18px;
  }

  .physica-ai-md-list li {
    margin: 2px 0;
  }

  .physica-ai-md-code {
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    font-size: 11px;
    background: rgba(2, 6, 23, 0.65);
    border: 1px solid rgba(148, 163, 184, 0.24);
    color: #7dd3fc;
    padding: 1px 4px;
    border-radius: 4px;
  }

  .physica-ai-md-pre {
    margin: 6px 0 8px 0;
    padding: 8px 10px;
    background: rgba(2, 6, 23, 0.84);
    border: 1px solid rgba(148, 163, 184, 0.25);
    border-radius: 7px;
    overflow-x: auto;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    font-size: 11px;
    line-height: 1.45;
    color: #e2e8f0;
    white-space: pre;
  }

  .physica-ai-md-quote {
    margin: 6px 0 8px 0;
    padding: 4px 0 4px 10px;
    border-left: 2.5px solid #38bdf8;
    color: #cbd5e1;
  }

  .physica-ai-md-hr {
    border: none;
    border-top: 1px solid rgba(148, 163, 184, 0.25);
    margin: 8px 0;
  }

  .physica-ai-md-link {
    color: #38bdf8;
    text-decoration: underline;
    text-underline-offset: 2px;
  }

  .physica-ai-md-link:hover {
    color: #7dd3fc;
  }

  .physica-ai-md-table-wrap {
    margin: 6px 0 8px 0;
    overflow-x: auto;
  }

  .physica-ai-md-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 11px;
  }

  .physica-ai-md-table th,
  .physica-ai-md-table td {
    border: 1px solid rgba(148, 163, 184, 0.24);
    padding: 4px 7px;
    text-align: left;
  }

  .physica-ai-md-table th {
    background: rgba(15, 23, 42, 0.85);
    font-weight: 600;
    color: #e2e8f0;
  }

  .physica-ai-source-tag {
    font-size: 10px;
    color: #94a3b8;
    padding: 0 2px;
    display: inline-flex;
    align-items: center;
    gap: 5px;
  }

  .physica-ai-source-tag.ai-src-cloud {
    color: #7dd3fc;
  }

  .physica-ai-source-tag.ai-src-device {
    color: #6ee7b7;
  }

  .physica-ai-form {
    padding: 10px;
    border-top: 1px solid rgba(148, 163, 184, 0.18);
    display: flex;
    align-items: flex-end;
    gap: 7px;
    background: rgba(15, 23, 42, 0.98);
    flex-shrink: 0;
  }

  #physica-ai-input {
    flex: 1;
    min-height: 36px;
    max-height: 96px;
    resize: none;
    background: rgba(2, 6, 23, 0.72);
    border: 1px solid rgba(148, 163, 184, 0.3);
    border-radius: 8px;
    padding: 8px 10px;
    color: #f8fafc;
    font-family: inherit;
    font-size: 12px;
    line-height: 1.4;
    outline: none;
  }

  #physica-ai-input:focus {
    border-color: #38bdf8;
  }

  #physica-ai-input::placeholder {
    color: #64748b;
  }

  #physica-ai-send {
    height: 36px;
    padding: 0 13px;
    border-radius: 8px;
    border: 1px solid #38bdf8;
    background: #0284c7;
    color: #ffffff;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    flex-shrink: 0;
  }

  #physica-ai-send:hover:not(:disabled) {
    background: #0369a1;
  }

  #physica-ai-send:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  @media (max-width: 640px) {
    #physica-ai-launcher {
      bottom: 12px;
      right: 12px;
      padding: 8px 12px;
      font-size: 12px;
    }

    #physica-ai-drawer {
      bottom: 56px;
      right: 12px;
      left: 12px;
      width: auto;
      height: min(440px, calc(100vh - 80px));
    }
  }
</style>

<button
  id="physica-ai-launcher"
  type="button"
  aria-expanded="false"
  aria-controls="physica-ai-drawer"
  title="Ask the Firebase Hybrid AI Assistant about ${safeTitle}"
>
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
    <path d="M9.5 9h5"/>
    <path d="M9.5 13h3"/>
  </svg>
  <span>Ask AI</span>
</button>

<section
  id="physica-ai-drawer"
  role="dialog"
  aria-label="${safeTitle} Hybrid AI Assistant"
>
  <header class="physica-ai-header">
    <div class="physica-ai-title-wrap">
      <div class="physica-ai-title">${safeTitle} Assistant</div>
      <div class="physica-ai-subtitle">
        <span id="physica-ai-status-dot" class="physica-ai-dot" aria-hidden="true"></span>
        <span id="physica-ai-status-text">Firebase Hybrid AI · Online Gemini → Offline Fallback</span>
      </div>
    </div>
    <div class="physica-ai-header-actions">
      <button id="physica-ai-clear" class="physica-ai-icon-btn" type="button" title="Clear conversation">Clear</button>
      <button id="physica-ai-close" class="physica-ai-icon-btn" type="button" title="Close assistant" aria-label="Close assistant">&times;</button>
    </div>
  </header>

  <div id="physica-ai-offline-banner">
    <span id="physica-ai-offline-note">Offline AI model available for download</span>
    <button id="physica-ai-prepare-btn" type="button">Download Offline AI</button>
  </div>

  <div id="physica-ai-messages" role="log" aria-live="polite"></div>

  <form id="physica-ai-form" class="physica-ai-form">
    <textarea
      id="physica-ai-input"
      rows="1"
      placeholder="Ask about the physics, equations, or controls..."
      aria-label="Ask a question about this simulation"
    ></textarea>
    <button id="physica-ai-send" type="submit">Send</button>
  </form>
</section>

<script id="physica-hybrid-assistant-script" type="module">
(function () {
  const FIREBASE_APP_CDN = ${JSON.stringify(FIREBASE_APP_CDN_URL)};
  const FIREBASE_AI_CDN = ${JSON.stringify(FIREBASE_AI_CDN_URL)};
  const DEFAULT_CLOUD_MODEL = ${JSON.stringify(cloudModel)};

  const launcher = document.getElementById('physica-ai-launcher');
  const drawer = document.getElementById('physica-ai-drawer');
  const closeBtn = document.getElementById('physica-ai-close');
  const clearBtn = document.getElementById('physica-ai-clear');
  const messagesEl = document.getElementById('physica-ai-messages');
  const formEl = document.getElementById('physica-ai-form');
  const inputEl = document.getElementById('physica-ai-input');
  const sendBtn = document.getElementById('physica-ai-send');
  const statusDot = document.getElementById('physica-ai-status-dot');
  const statusText = document.getElementById('physica-ai-status-text');
  const offlineBanner = document.getElementById('physica-ai-offline-banner');
  const offlineNote = document.getElementById('physica-ai-offline-note');
  const prepareBtn = document.getElementById('physica-ai-prepare-btn');

  if (!launcher || !drawer || !messagesEl || !formEl || !inputEl || !sendBtn) {
    return;
  }

  function readJsonScript(id, fallback) {
    try {
      const el = document.getElementById(id);
      if (!el || !el.textContent) return fallback;
      return JSON.parse(el.textContent);
    } catch (_) {
      return fallback;
    }
  }

  const firebaseConfig = readJsonScript('physica-firebase-config', {});
  const simContext = readJsonScript('physica-assistant-context', {
    title: document.title || 'Physics Simulation',
    subject: 'Physics',
    topic: '',
    governingEquations: [],
    learningObjectives: [],
    interactiveParameters: [],
    cloudModel: DEFAULT_CLOUD_MODEL,
  });

  function buildSystemInstruction() {
    const lines = [
      'You are an interactive physics tutor embedded inside the "' + simContext.title + '" 3D simulation.',
      'Give concise, accurate, student-friendly explanations grounded in the simulation equations and controls.',
    ];
    if (simContext.subject) lines.push('Subject: ' + simContext.subject);
    if (simContext.topic) lines.push('Topic: ' + simContext.topic);
    if (Array.isArray(simContext.governingEquations) && simContext.governingEquations.length) {
      lines.push('Governing equations: ' + simContext.governingEquations.join('; '));
    }
    if (Array.isArray(simContext.interactiveParameters) && simContext.interactiveParameters.length) {
      lines.push('Interactive parameters: ' + simContext.interactiveParameters.join('; '));
    }
    if (Array.isArray(simContext.learningObjectives) && simContext.learningObjectives.length) {
      lines.push('Learning objectives: ' + simContext.learningObjectives.join('; '));
    }
    lines.push('Keep answers clear and focused (typically 2-5 short sentences unless a step-by-step derivation is requested).');
    return lines.join('\\n');
  }

  function readLiveSimulationStateSummary() {
    try {
      if (window.simulationAPI && typeof window.simulationAPI.getState === 'function') {
        const state = window.simulationAPI.getState();
        if (state && typeof state === 'object') {
          const pairs = Object.entries(state)
            .filter(function (entry) {
              const v = entry[1];
              return typeof v === 'number' || typeof v === 'boolean' || typeof v === 'string';
            })
            .slice(0, 12)
            .map(function (entry) {
              const val = typeof entry[1] === 'number' ? Number(entry[1].toFixed(3)) : entry[1];
              return entry[0] + '=' + val;
            });
          if (pairs.length) {
            return '[Current live simulation parameters: ' + pairs.join(', ') + ']';
          }
        }
      }
    } catch (_) {}
    return '';
  }

  const SYSTEM_INSTRUCTION = buildSystemInstruction();
  const ON_DEVICE_CREATE_OPTIONS = {
    expectedInputs: [{ type: 'text' }],
    expectedOutputs: [{ type: 'text' }],
    initialPrompts: [{ role: 'system', content: SYSTEM_INSTRUCTION }],
  };

  let firebaseHybridModel = null;
  let firebaseInferenceSourceEnum = { IN_CLOUD: 'in_cloud', ON_DEVICE: 'on_device' };
  let localLmSession = null;
  let isBusy = false;
  let onDeviceAvailability = 'unknown';
  const conversationHistory = [];

  async function checkOnDeviceAvailability() {
    const provider = typeof self !== 'undefined' ? self.LanguageModel : undefined;
    if (!provider || typeof provider.availability !== 'function') {
      onDeviceAvailability = 'unavailable';
      updateStatusDisplay();
      return onDeviceAvailability;
    }
    try {
      const avail = await provider.availability({
        expectedInputs: [{ type: 'text' }],
        expectedOutputs: [{ type: 'text' }],
      });
      onDeviceAvailability = String(avail || 'unavailable');
    } catch (_) {
      onDeviceAvailability = 'unavailable';
    }
    updateStatusDisplay();
    return onDeviceAvailability;
  }

  function updateStatusDisplay() {
    const isOffline = typeof navigator !== 'undefined' && navigator.onLine === false;
    const localReady = onDeviceAvailability === 'available' || onDeviceAvailability === 'readily';
    const localDownloadable =
      onDeviceAvailability === 'downloadable' || onDeviceAvailability === 'after-download';

    if (statusDot) {
      statusDot.classList.remove('ai-dot-offline', 'ai-dot-ready');
      if (isOffline) {
        statusDot.classList.add(localReady ? 'ai-dot-ready' : 'ai-dot-offline');
      } else if (localReady) {
        statusDot.classList.add('ai-dot-ready');
      }
    }

    if (statusText) {
      if (isOffline) {
        statusText.textContent = localReady
          ? 'Offline · Using On-Device AI Fallback'
          : 'Offline · Waiting for On-Device AI or Network';
      } else if (localReady) {
        statusText.textContent = 'Online Gemini · Offline AI Ready';
      } else if (localDownloadable) {
        statusText.textContent = 'Online Gemini · Offline AI Downloadable';
      } else {
        statusText.textContent = 'Firebase Hybrid AI · Online Gemini → Offline';
      }
    }

    if (offlineBanner && offlineNote && prepareBtn) {
      if (localDownloadable && !isOffline) {
        offlineBanner.classList.add('ai-visible');
        offlineNote.textContent = 'Pre-download on-device model for offline fallback';
        prepareBtn.disabled = false;
        prepareBtn.textContent = 'Download Offline AI';
      } else if (onDeviceAvailability === 'downloading') {
        offlineBanner.classList.add('ai-visible');
        offlineNote.textContent = 'Downloading on-device Gemini model...';
        prepareBtn.disabled = true;
        prepareBtn.textContent = 'Downloading...';
      } else {
        offlineBanner.classList.remove('ai-visible');
      }
    }
  }

  async function ensureFirebaseHybridModel() {
    if (firebaseHybridModel) return firebaseHybridModel;
    if (!firebaseConfig || !firebaseConfig.projectId || !firebaseConfig.apiKey || !firebaseConfig.appId) {
      throw new Error('Firebase web configuration is missing.');
    }

    const [firebaseAppMod, firebaseAiMod] = await Promise.all([
      import(FIREBASE_APP_CDN),
      import(FIREBASE_AI_CDN),
    ]);

    const appName = 'physica-hybrid-assistant';
    const existing = firebaseAppMod.getApps().find(function (a) {
      return a && a.name === appName;
    });
    const app = existing || firebaseAppMod.initializeApp(firebaseConfig, appName);

    const ai = firebaseAiMod.getAI(app, {
      backend: new firebaseAiMod.GoogleAIBackend(),
    });

    if (firebaseAiMod.InferenceSource) {
      firebaseInferenceSourceEnum = firebaseAiMod.InferenceSource;
    }

    firebaseHybridModel = firebaseAiMod.getGenerativeModel(ai, {
      mode: firebaseAiMod.InferenceMode.PREFER_IN_CLOUD,
      inCloudParams: {
        model: simContext.cloudModel || DEFAULT_CLOUD_MODEL,
        systemInstruction: SYSTEM_INSTRUCTION,
      },
      onDeviceParams: {
        createOptions: ON_DEVICE_CREATE_OPTIONS,
      },
    });

    return firebaseHybridModel;
  }

  async function runDirectOnDeviceFallback(promptText, onChunk) {
    const provider = typeof self !== 'undefined' ? self.LanguageModel : undefined;
    if (!provider || typeof provider.create !== 'function') {
      return null;
    }
    const avail = await checkOnDeviceAvailability();
    if (avail !== 'available' && avail !== 'readily') {
      return null;
    }
    if (!localLmSession) {
      localLmSession = await provider.create(ON_DEVICE_CREATE_OPTIONS);
    }
    if (typeof localLmSession.promptStreaming === 'function') {
      const stream = localLmSession.promptStreaming(promptText);
      let fullText = '';
      for await (const chunk of stream) {
        const piece = typeof chunk === 'string' ? chunk : String(chunk || '');
        if (!piece) continue;
        // Handle both delta streams and cumulative streams safely
        if (piece.startsWith(fullText) && fullText.length > 0) {
          fullText = piece;
        } else {
          fullText += piece;
        }
        onChunk(fullText);
      }
      return fullText.trim();
    }
    const reply = await localLmSession.prompt(promptText);
    const text = String(reply || '').trim();
    onChunk(text);
    return text;
  }

  function renderEmptyState() {
    messagesEl.textContent = '';
    const wrap = document.createElement('div');
    wrap.className = 'physica-ai-empty';

    const intro = document.createElement('div');
    intro.textContent =
      'Ask any question about ' +
      simContext.title +
      '. Powered by Firebase AI Logic Hybrid Inference (online Gemini with automatic offline on-device fallback).';
    wrap.appendChild(intro);

    const suggestionsWrap = document.createElement('div');
    suggestionsWrap.className = 'physica-ai-suggestions';
    const prompts = [
      'Explain the core physics behind ' + simContext.title + '.',
      'What happens when I adjust the simulation parameters?',
      'Walk me through the governing equations shown here.',
    ];
    prompts.forEach(function (q) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'physica-ai-suggestion';
      btn.textContent = q;
      btn.addEventListener('click', function () {
        inputEl.value = q;
        submitQuestion();
      });
      suggestionsWrap.appendChild(btn);
    });
    wrap.appendChild(suggestionsWrap);
    messagesEl.appendChild(wrap);
  }

  function isSafeHttpUrl(rawUrl) {
    try {
      const parsed = new URL(rawUrl);
      return parsed.protocol === 'https:' || parsed.protocol === 'http:';
    } catch (_) {
      return false;
    }
  }

  function appendInlineMarkdown(parent, text) {
    const str = String(text || '');
    const BT = String.fromCharCode(96);
    let i = 0;
    let buf = '';

    function flush() {
      if (buf) {
        parent.appendChild(document.createTextNode(buf));
        buf = '';
      }
    }

    while (i < str.length) {
      // Escaped markdown punctuation
      if (str[i] === '\\\\' && i + 1 < str.length && '\\\\*_~[]()'.indexOf(str[i + 1]) !== -1) {
        buf += str[i + 1];
        i += 2;
        continue;
      }

      // Inline code: \`code\`
      if (str[i] === BT) {
        const end = str.indexOf(BT, i + 1);
        if (end !== -1) {
          flush();
          const codeEl = document.createElement('code');
          codeEl.className = 'physica-ai-md-code';
          codeEl.textContent = str.slice(i + 1, end);
          parent.appendChild(codeEl);
          i = end + 1;
          continue;
        }
      }

      // Link: [label](url)
      if (str[i] === '[') {
        const closeBracket = str.indexOf(']', i + 1);
        if (closeBracket !== -1 && str[closeBracket + 1] === '(') {
          const closeParen = str.indexOf(')', closeBracket + 2);
          if (closeParen !== -1) {
            const label = str.slice(i + 1, closeBracket);
            const href = str.slice(closeBracket + 2, closeParen).trim();
            flush();
            if (isSafeHttpUrl(href)) {
              const a = document.createElement('a');
              a.className = 'physica-ai-md-link';
              a.href = href;
              a.target = '_blank';
              a.rel = 'noopener noreferrer';
              appendInlineMarkdown(a, label);
              parent.appendChild(a);
            } else {
              appendInlineMarkdown(parent, label);
            }
            i = closeParen + 1;
            continue;
          }
        }
      }

      // Bold + Italic: ***text***
      if (str.slice(i, i + 3) === '***') {
        const end = str.indexOf('***', i + 3);
        if (end !== -1 && end > i + 3) {
          flush();
          const strong = document.createElement('strong');
          const em = document.createElement('em');
          appendInlineMarkdown(em, str.slice(i + 3, end));
          strong.appendChild(em);
          parent.appendChild(strong);
          i = end + 3;
          continue;
        }
      }

      // Bold: **text** or __text__
      if (str.slice(i, i + 2) === '**' || str.slice(i, i + 2) === '__') {
        const delim = str.slice(i, i + 2);
        const end = str.indexOf(delim, i + 2);
        if (end !== -1 && end > i + 2) {
          flush();
          const strong = document.createElement('strong');
          appendInlineMarkdown(strong, str.slice(i + 2, end));
          parent.appendChild(strong);
          i = end + 2;
          continue;
        }
      }

      // Strikethrough: ~~text~~
      if (str.slice(i, i + 2) === '~~') {
        const end = str.indexOf('~~', i + 2);
        if (end !== -1 && end > i + 2) {
          flush();
          const del = document.createElement('del');
          appendInlineMarkdown(del, str.slice(i + 2, end));
          parent.appendChild(del);
          i = end + 2;
          continue;
        }
      }

      // Italic: *text* (avoid matching list bullets or stray spaces)
      if (str[i] === '*' && str[i + 1] && str[i + 1] !== ' ' && str[i + 1] !== '*') {
        const end = str.indexOf('*', i + 1);
        if (end !== -1 && end > i + 1 && str[end - 1] !== ' ') {
          flush();
          const em = document.createElement('em');
          appendInlineMarkdown(em, str.slice(i + 1, end));
          parent.appendChild(em);
          i = end + 1;
          continue;
        }
      }

      // Italic: _text_ (word-boundary guarded so physics identifiers like m_1 + m_2 stay intact)
      if (
        str[i] === '_' &&
        str[i + 1] &&
        str[i + 1] !== ' ' &&
        str[i + 1] !== '_' &&
        (i === 0 || !/[A-Za-z0-9]/.test(str[i - 1]))
      ) {
        const end = str.indexOf('_', i + 1);
        if (
          end !== -1 &&
          end > i + 1 &&
          str[end - 1] !== ' ' &&
          (end + 1 === str.length || !/[A-Za-z0-9]/.test(str[end + 1]))
        ) {
          flush();
          const em = document.createElement('em');
          appendInlineMarkdown(em, str.slice(i + 1, end));
          parent.appendChild(em);
          i = end + 1;
          continue;
        }
      }

      buf += str[i];
      i += 1;
    }

    flush();
  }

  function parseTableRowCells(line) {
    return line
      .trim()
      .replace(/^\\|/, '')
      .replace(/\\|$/, '')
      .split('|')
      .map(function (cell) {
        return cell.trim();
      });
  }

  function isTableSeparatorLine(line) {
    const trimmed = line.trim();
    if (trimmed.indexOf('|') === -1 && trimmed.indexOf('-') === -1) return false;
    return /^\\|?\\s*:?-{3,}:?\\s*(\\|\\s*:?-{3,}:?\\s*)+\\|?$/.test(trimmed);
  }

  function renderMarkdownInto(container, source) {
    container.textContent = '';
    const text = String(source || '').replace(/\\r\\n?/g, '\\n');
    if (!text.trim()) return;

    const lines = text.split('\\n');
    const FENCE = String.fromCharCode(96, 96, 96);
    let idx = 0;

    function isBlockBoundary(line, nextLine) {
      const t = line.trim();
      if (!t) return true;
      if (t.startsWith(FENCE)) return true;
      if (/^#{1,6}\\s+/.test(t)) return true;
      if (/^(?:-{3,}|[*]{3,}|_{3,})\\s*$/.test(t)) return true;
      if (/^>\\s?/.test(t)) return true;
      if (/^\\s*[-*+•]\\s+/.test(line)) return true;
      if (/^\\s*\\d+[.)]\\s+/.test(line)) return true;
      if (t.indexOf('|') !== -1 && typeof nextLine === 'string' && isTableSeparatorLine(nextLine)) {
        return true;
      }
      return false;
    }

    while (idx < lines.length) {
      const rawLine = lines[idx];
      const trimmed = rawLine.trim();

      if (!trimmed) {
        idx += 1;
        continue;
      }

      // Fenced code block
      if (trimmed.startsWith(FENCE)) {
        const codeLines = [];
        idx += 1;
        while (idx < lines.length && !lines[idx].trim().startsWith(FENCE)) {
          codeLines.push(lines[idx]);
          idx += 1;
        }
        if (idx < lines.length && lines[idx].trim().startsWith(FENCE)) {
          idx += 1;
        }
        const pre = document.createElement('pre');
        pre.className = 'physica-ai-md-pre';
        const code = document.createElement('code');
        code.textContent = codeLines.join('\\n');
        pre.appendChild(code);
        container.appendChild(pre);
        continue;
      }

      // Headings (# .. ######)
      const headingMatch = trimmed.match(/^(#{1,6})\\s+(.+)$/);
      if (headingMatch) {
        const level = Math.min(headingMatch[1].length, 4);
        const tag = level === 1 ? 'h3' : level === 2 ? 'h4' : 'h5';
        const hEl = document.createElement(tag);
        hEl.className = 'physica-ai-md-h physica-ai-md-h' + level;
        appendInlineMarkdown(hEl, headingMatch[2]);
        container.appendChild(hEl);
        idx += 1;
        continue;
      }

      // Horizontal rule
      if (/^(?:-{3,}|[*]{3,}|_{3,})\\s*$/.test(trimmed)) {
        const hr = document.createElement('hr');
        hr.className = 'physica-ai-md-hr';
        container.appendChild(hr);
        idx += 1;
        continue;
      }

      // Blockquote
      if (/^>\\s?/.test(trimmed)) {
        const quoteLines = [];
        while (idx < lines.length && /^>\\s?/.test(lines[idx].trim())) {
          quoteLines.push(lines[idx].trim().replace(/^>\\s?/, ''));
          idx += 1;
        }
        const bq = document.createElement('blockquote');
        bq.className = 'physica-ai-md-quote';
        renderMarkdownInto(bq, quoteLines.join('\\n'));
        container.appendChild(bq);
        continue;
      }

      // Pipe table
      if (trimmed.indexOf('|') !== -1 && idx + 1 < lines.length && isTableSeparatorLine(lines[idx + 1])) {
        const headers = parseTableRowCells(rawLine);
        idx += 2;
        const bodyRows = [];
        while (idx < lines.length && lines[idx].trim() && lines[idx].indexOf('|') !== -1) {
          bodyRows.push(parseTableRowCells(lines[idx]));
          idx += 1;
        }
        const wrap = document.createElement('div');
        wrap.className = 'physica-ai-md-table-wrap';
        const table = document.createElement('table');
        table.className = 'physica-ai-md-table';
        const thead = document.createElement('thead');
        const headTr = document.createElement('tr');
        headers.forEach(function (cell) {
          const th = document.createElement('th');
          appendInlineMarkdown(th, cell);
          headTr.appendChild(th);
        });
        thead.appendChild(headTr);
        table.appendChild(thead);

        if (bodyRows.length) {
          const tbody = document.createElement('tbody');
          bodyRows.forEach(function (row) {
            const tr = document.createElement('tr');
            row.forEach(function (cell) {
              const td = document.createElement('td');
              appendInlineMarkdown(td, cell);
              tr.appendChild(td);
            });
            tbody.appendChild(tr);
          });
          table.appendChild(tbody);
        }
        wrap.appendChild(table);
        container.appendChild(wrap);
        continue;
      }

      // Unordered list
      if (/^\\s*[-*+•]\\s+/.test(rawLine)) {
        const ul = document.createElement('ul');
        ul.className = 'physica-ai-md-list';
        while (idx < lines.length && /^\\s*[-*+•]\\s+/.test(lines[idx])) {
          const li = document.createElement('li');
          appendInlineMarkdown(li, lines[idx].replace(/^\\s*[-*+•]\\s+/, ''));
          ul.appendChild(li);
          idx += 1;
        }
        container.appendChild(ul);
        continue;
      }

      // Ordered list
      if (/^\\s*\\d+[.)]\\s+/.test(rawLine)) {
        const ol = document.createElement('ol');
        ol.className = 'physica-ai-md-list';
        while (idx < lines.length && /^\\s*\\d+[.)]\\s+/.test(lines[idx])) {
          const li = document.createElement('li');
          appendInlineMarkdown(li, lines[idx].replace(/^\\s*\\d+[.)]\\s+/, ''));
          ol.appendChild(li);
          idx += 1;
        }
        container.appendChild(ol);
        continue;
      }

      // Paragraph (accumulate lines until blank line or next block)
      const paraLines = [];
      while (idx < lines.length) {
        if (paraLines.length > 0 && isBlockBoundary(lines[idx], lines[idx + 1])) {
          break;
        }
        paraLines.push(lines[idx]);
        idx += 1;
        if (idx < lines.length && !lines[idx].trim()) {
          break;
        }
      }
      const p = document.createElement('p');
      p.className = 'physica-ai-md-p';
      paraLines.forEach(function (pLine, lineIdx) {
        if (lineIdx > 0) p.appendChild(document.createElement('br'));
        appendInlineMarkdown(p, pLine);
      });
      container.appendChild(p);
    }
  }

  function appendMessage(role, text, options) {
    const opts = options || {};
    const emptyEl = messagesEl.querySelector('.physica-ai-empty');
    if (emptyEl) emptyEl.remove();

    const msgEl = document.createElement('div');
    msgEl.className =
      'physica-ai-msg ' +
      (role === 'user' ? 'ai-user' : 'ai-bot') +
      (opts.isError ? ' ai-error' : '');

    const bubble = document.createElement('div');
    bubble.className = 'physica-ai-bubble';
    if (role === 'user') {
      bubble.textContent = text;
    } else {
      renderMarkdownInto(bubble, text);
    }
    msgEl.appendChild(bubble);

    let sourceEl = null;
    if (role !== 'user') {
      sourceEl = document.createElement('div');
      sourceEl.className = 'physica-ai-source-tag';
      if (opts.sourceLabel) {
        sourceEl.textContent = opts.sourceLabel;
      }
      msgEl.appendChild(sourceEl);
    }

    messagesEl.appendChild(msgEl);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    return { msgEl: msgEl, bubble: bubble, sourceEl: sourceEl };
  }

  function formatHelpfulError(err) {
    const raw = (err && (err.message || String(err))) || 'Unknown inference error';
    const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
    if (offline) {
      return (
        'You are currently offline and no on-device model is ready yet. ' +
        'On Chrome Desktop (138+) with Built-in AI enabled, reconnect once and click "Download Offline AI" to enable offline answers.'
      );
    }
    if (/403|PERMISSION_DENIED|API_NOT_ENABLED|ACCESS_DENIED/i.test(raw)) {
      const proj = firebaseConfig && firebaseConfig.projectId ? firebaseConfig.projectId : 'your Firebase project';
      return (
        'Online Firebase AI Logic is not enabled yet for project "' +
        proj +
        '", and no local on-device model is available as a fallback. ' +
        'Enable Firebase AI Logic (Gemini Developer API) in the Firebase Console for "' +
        proj +
        '" or enable Chrome Built-in AI on-device inference.'
      );
    }
    return 'Assistant could not reach online Gemini or an on-device fallback model: ' + raw;
  }

  async function submitQuestion() {
    if (isBusy) return;
    const question = (inputEl.value || '').trim();
    if (!question) return;

    inputEl.value = '';
    inputEl.style.height = 'auto';
    isBusy = true;
    sendBtn.disabled = true;

    appendMessage('user', question);
    const botUi = appendMessage('assistant', 'Thinking...', { sourceLabel: 'Connecting via Firebase Hybrid AI...' });

    const liveStateNote = readLiveSimulationStateSummary();
    const enrichedQuestion = liveStateNote ? liveStateNote + '\\n\\nQuestion: ' + question : question;

    // Build recent multi-turn contents (cap to last 6 turns to stay within on-device context window)
    const recentHistory = conversationHistory.slice(-6).map(function (turn) {
      return { role: turn.role, parts: [{ text: turn.text }] };
    });
    const contents = recentHistory.concat([{ role: 'user', parts: [{ text: enrichedQuestion }] }]);

    try {
      const model = await ensureFirebaseHybridModel();
      let streamedText = '';
      let inferenceSource = firebaseInferenceSourceEnum.IN_CLOUD;

      if (typeof model.generateContentStream === 'function') {
        const streamResult = await model.generateContentStream({ contents: contents });
        for await (const chunk of streamResult.stream) {
          const chunkText = typeof chunk.text === 'function' ? chunk.text() : '';
          if (chunkText) {
            streamedText += chunkText;
            renderMarkdownInto(botUi.bubble, streamedText);
            messagesEl.scrollTop = messagesEl.scrollHeight;
          }
        }
        const finalResponse = await streamResult.response;
        if (!streamedText && finalResponse && typeof finalResponse.text === 'function') {
          streamedText = finalResponse.text() || '';
        }
        if (finalResponse && finalResponse.inferenceSource) {
          inferenceSource = finalResponse.inferenceSource;
        }
      } else {
        const result = await model.generateContent({ contents: contents });
        streamedText = result.response && typeof result.response.text === 'function' ? result.response.text() : '';
        if (result.response && result.response.inferenceSource) {
          inferenceSource = result.response.inferenceSource;
        }
      }

      const finalText = (streamedText || '').trim() || 'No response returned by the model.';
      renderMarkdownInto(botUi.bubble, finalText);
      const usedOnDevice = inferenceSource === firebaseInferenceSourceEnum.ON_DEVICE || inferenceSource === 'on_device';
      if (botUi.sourceEl) {
        botUi.sourceEl.textContent = usedOnDevice ? 'Offline · On-Device AI' : 'Online · Gemini Cloud';
        botUi.sourceEl.className = 'physica-ai-source-tag ' + (usedOnDevice ? 'ai-src-device' : 'ai-src-cloud');
      }

      conversationHistory.push({ role: 'user', text: question });
      conversationHistory.push({ role: 'model', text: finalText });
    } catch (firebaseErr) {
      // Secondary fallback: if Firebase cloud failed (e.g. offline on file:// or API not yet enabled)
      // and Chrome's on-device LanguageModel is available, answer locally on-device.
      let fallbackReply = null;
      try {
        fallbackReply = await runDirectOnDeviceFallback(enrichedQuestion, function (partial) {
          renderMarkdownInto(botUi.bubble, partial);
          messagesEl.scrollTop = messagesEl.scrollHeight;
        });
      } catch (_) {
        fallbackReply = null;
      }

      if (fallbackReply) {
        renderMarkdownInto(botUi.bubble, fallbackReply);
        if (botUi.sourceEl) {
          botUi.sourceEl.textContent = 'Offline · On-Device AI';
          botUi.sourceEl.className = 'physica-ai-source-tag ai-src-device';
        }
        conversationHistory.push({ role: 'user', text: question });
        conversationHistory.push({ role: 'model', text: fallbackReply });
      } else {
        botUi.msgEl.classList.add('ai-error');
        renderMarkdownInto(botUi.bubble, formatHelpfulError(firebaseErr));
        if (botUi.sourceEl) {
          botUi.sourceEl.textContent = 'Hybrid AI unavailable';
        }
      }
    } finally {
      isBusy = false;
      sendBtn.disabled = false;
      messagesEl.scrollTop = messagesEl.scrollHeight;
      updateStatusDisplay();
    }
  }

  function setDrawerOpen(open) {
    drawer.classList.toggle('ai-open', open);
    launcher.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (open) {
      checkOnDeviceAvailability();
      setTimeout(function () {
        inputEl.focus();
      }, 40);
    }
  }

  launcher.addEventListener('click', function () {
    setDrawerOpen(!drawer.classList.contains('ai-open'));
  });

  if (closeBtn) {
    closeBtn.addEventListener('click', function () {
      setDrawerOpen(false);
    });
  }

  if (clearBtn) {
    clearBtn.addEventListener('click', function () {
      conversationHistory.length = 0;
      if (localLmSession && typeof localLmSession.destroy === 'function') {
        try {
          localLmSession.destroy();
        } catch (_) {}
      }
      localLmSession = null;
      renderEmptyState();
    });
  }

  if (prepareBtn) {
    prepareBtn.addEventListener('click', async function () {
      const provider = typeof self !== 'undefined' ? self.LanguageModel : undefined;
      if (!provider || typeof provider.create !== 'function') return;
      prepareBtn.disabled = true;
      prepareBtn.textContent = 'Downloading 0%';
      if (offlineNote) offlineNote.textContent = 'Downloading on-device Gemini model...';
      try {
        localLmSession = await provider.create({
          ...ON_DEVICE_CREATE_OPTIONS,
          monitor: function (m) {
            m.addEventListener('downloadprogress', function (e) {
              const pct = Math.round(((e && typeof e.loaded === 'number' ? e.loaded : 0) || 0) * 100);
              prepareBtn.textContent = 'Downloading ' + pct + '%';
            });
          },
        });
        onDeviceAvailability = 'available';
      } catch (_) {
        await checkOnDeviceAvailability();
      }
      updateStatusDisplay();
    });
  }

  formEl.addEventListener('submit', function (e) {
    e.preventDefault();
    submitQuestion();
  });

  inputEl.addEventListener('keydown', function (e) {
    e.stopPropagation();
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submitQuestion();
    }
  });

  ['keyup', 'keypress'].forEach(function (evtName) {
    drawer.addEventListener(evtName, function (e) {
      e.stopPropagation();
    });
  });

  drawer.addEventListener('keydown', function (e) {
    e.stopPropagation();
    if (e.key === 'Escape') {
      setDrawerOpen(false);
    }
  });

  window.addEventListener('online', updateStatusDisplay);
  window.addEventListener('offline', updateStatusDisplay);

  renderEmptyState();
  checkOnDeviceAvailability();
})();
</script>
${HYBRID_ASSISTANT_END_MARKER}`;
}

/**
 * Ensures the standalone HTML document contains the Firebase AI Logic Hybrid Assistant.
 * Idempotent: if already embedded, replaces the existing block cleanly without duplication.
 */
export function ensureHybridAssistantEmbedded(
  html: string,
  options?: HybridAssistantOptions
): string {
  if (!html || !html.trim()) return html;
  const cleaned = stripHybridAssistant(html);
  const bundle = buildHybridAssistantBundle(cleaned, options);

  if (/<\/body>/i.test(cleaned)) {
    return cleaned.replace(/<\/body>/i, () => `\n${bundle}\n</body>`);
  }
  return `${cleaned}\n${bundle}`;
}
