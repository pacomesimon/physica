# Physica Studio — AI-Powered 3D Physics Simulation Studio

Physica Studio is a web-based simulation engineering environment built for physics teachers and learners. It pairs a natural-language AI simulation developer with a live sandboxed Three.js preview, CodeMirror source inspector, narrated guided walkthroughs with cinematic camera motion, version history with diff comparison, installable offline-capable PWA hosting, an embedded Firebase Hybrid AI assistant, and optional Google Authentication with Cloud Firestore workspace sync.

Try the app here: https://physica-studio.ai.studio/
## Key Features

- **Preloaded 3D Double Pendulum Default Simulation**: Opens immediately with a clean, RK4-integrated 3D double pendulum suspended from a simple pivot on a visible A-frame stand (initial lengths $L_1 = 2\text{ m}$ and $L_2 = 1\text{ m}$), alongside the reference Projectile Motion simulation.
- **Natural-Language AI Simulation Studio**: Build, modify, and debug interactive Three.js physics simulations through a structured AI chat agent, inspect or edit raw source code in CodeMirror 6, capture automatic/manual version snapshots with line-by-line diffs, and fix runtime errors in one click.
- **Narrated Guided Walkthroughs with Video-Like Camera Motion**: Every simulation includes an embedded narrated walkthrough engine using `window.speechSynthesis` (with voice selection and graceful silent transcript fallback), synchronized clickable transcripts, non-blocking control highlighting, deterministic state reconstruction on pause/resume/seek/stop, and continuous video-like camera motion (oscillating horizontally from $-30^\circ$ to $+30^\circ$ with subtle organic vertical drift between $-5^\circ$ and $+5^\circ$).
- **Preview Webpage, Copy Link, Download HTML & Installable Offline PWAs**: Alongside single-file **Download HTML**, teachers can click **Preview Webpage** (opens the published simulation in a new tab) or **Copy Link** to share a hosted `/sim/:id/` Progressive Web App complete with a Web App Manifest, generated PNG/SVG icons, an offline-capable Service Worker, and an install prompt so students can install and run simulations on edge devices.
- **Embedded Firebase Hybrid AI Assistant (Online + Offline Fallback)**: Exported HTML files and hosted PWAs include an interactive Q&A physics assistant powered by **Firebase AI Logic Hybrid Inference** (`InferenceMode.PREFER_IN_CLOUD`), which answers student questions using an online Gemini model with live simulation context and automatically falls back to an on-device browser model when offline. Assistant responses are rendered as formatted Markdown using safe DOM construction.
- **Optional Google Sign-In & Cloud Firestore Sync (Guest-First)**: Anyone can use the full studio immediately without signing in—projects, versions, chat history, and settings are always persisted locally in the browser. Clicking **Sign in** with Google optionally syncs projects, version snapshots, chat conversations, and studio preferences in real time across devices using Cloud Firestore, with manual workspace sync and one-click return to guest mode.

## Architecture & Directory Structure

```text
├── server.ts                          # Express + Vite middleware server (API routes, /sim/:id/ PWA host)
├── server/
│   ├── agentController.ts             # Request validation, HTML verification, error mapping
│   ├── publishedStore.ts              # Persistent store for published standalone simulations (/sim/:id/)
│   ├── pwaAssets.ts                   # Dynamic PWA manifest, Service Worker, & PNG/SVG icon generators
│   └── llm/
│       ├── types.ts                   # ProviderAdapter interface & structured JSON normalization
│       ├── geminiAdapter.ts           # @google/genai server-side adapter
│       ├── openAiCompatAdapter.ts     # OpenAI-compatible /v1/chat/completions adapter
│       ├── providerRegistry.ts        # Configurable adapter registry
│       └── simulationSystemPrompt.ts  # Physics accuracy & AI-friendly HTML conventions
├── src/
│   ├── main.tsx                       # App entry wrapped in ErrorBoundary & FirebaseProvider
│   ├── App.tsx                        # 3-part studio workspace + optional real-time Firestore sync
│   ├── contexts/
│   │   └── FirebaseContext.tsx        # Optional Google Auth state (guest-first, no login gate)
│   ├── components/
│   │   ├── TopBar.tsx                 # Title, sync status, Versions, Preview Webpage, Copy Link, Export, Google Auth menu
│   │   ├── ProjectSidebar.tsx         # New simulation, restore Double Pendulum demo, saved simulations, settings
│   │   ├── ChatPanel.tsx              # Resizable AI conversation panel & suggested prompts
│   │   ├── PreviewPanel.tsx           # Sandboxed iframe, viewport toggle, error recovery, source view
│   │   ├── CodeEditor.tsx             # CodeMirror 6 editor & AI metadata section inspector
│   │   ├── VersionHistoryModal.tsx    # Snapshot timeline, restore, and line-by-line diff viewer
│   │   ├── ExportModal.tsx            # Standalone/PWA readiness checks, hosted link copy, & HTML download
│   │   ├── SettingsModal.tsx          # Provider/model selector, theme, voice picker, auto-snapshot
│   │   └── ErrorBoundary.tsx          # Graceful React & Firestore error boundary recovery UI
│   └── lib/
│       ├── firebase.ts                # Firebase App, named Firestore DB, Google Auth, error & limit helpers
│       ├── firestoreStore.ts          # Real-time Firestore CRUD & subcollection hydration (projects, versions, messages)
│       ├── demos/
│       │   ├── doublePendulum.ts      # Default 3D Double Pendulum simulation (A-frame, L1=2m, L2=1m, RK4)
│       │   └── projectileMotion.ts    # Reference 3D Projectile Motion simulation & analytical engine
│       ├── assistant/                 # Embedded Firebase Hybrid AI Logic Q&A widget & safe Markdown renderer
│       ├── walkthrough/               # Guided Walkthrough engine, camera oscillator, & standalone embedder
│       ├── metadataParser.ts          # Parser for SIMULATION_METADATA & 10-section JS convention
│       ├── htmlValidator.ts           # Structure, Three.js dependency, and secret-isolation validator
│       ├── bridgeInjector.ts          # Ephemeral iframe postMessage bridge (stripped on export)
│       ├── exporter.ts                # Standalone HTML & hosted PWA packager (embeds walkthrough + Hybrid AI)
│       └── storage.ts                 # LocalStorageRepository guest/offline persistence abstraction
├── firebase-applet-config.json        # Firebase project & named Firestore database configuration
├── firebase-blueprint.json            # Firestore data schema & collection structure blueprint
├── firestore.rules                    # Hardened Firestore security rules (owner-isolated, schema-validated)
├── security_spec.md                   # Firestore security invariants & adversarial test specification
├── eslint.config.mjs                  # ESLint configuration for @firebase/eslint-plugin-security-rules
└── tests/
    ├── studio.test.ts                 # Analytical physics, Double Pendulum RK4, validation, & versioning tests
    ├── walkthrough.test.ts            # Speech engine, camera motion, highlighting, state sync, & export tests
    ├── pwa.test.ts                    # Hosted PWA manifest, SW, icons, Hybrid AI embed, & Markdown tests
    └── firestore.rules.test.ts        # Security rules, Dirty Dozen invariants, & blueprint alignment tests
```

## Standalone HTML, Hosted PWAs & Embedded Hybrid AI

Every generated simulation is a self-contained, unminified HTML5 document using Three.js r170 via an import map (`https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js`), with:
- A structured `<!-- SIMULATION_METADATA ... -->` header documenting learning objectives, physical model, governing equations, interactive parameters, visual elements, controls, state schema, walkthrough metadata/transcript, and agent guidance.
- JavaScript organized into 10 consistent sections (`1. SIMULATION CONFIGURATION` through `10. CLEANUP AND RESET`), plus standardized `window.simulationAPI` (`getState`, `setState`, `getParameters`, `setParameter`, `play`, `pause`, `reset`) and tailored `window.WALKTHROUGH_CONFIG`.
- An embedded **Narrated Guided Walkthrough** engine with animated video-like horizontal/vertical camera sweep, clickable transcript, control highlighting, and deterministic state synchronization.
- An embedded **Firebase AI Logic Hybrid Assistant** drawer that reads live simulation metadata and parameters, renders Markdown replies safely without raw HTML injection, and uses cloud Gemini when online with automatic on-device fallback when offline.
- When published via **Preview Webpage** or **Copy Link**, the server serves the simulation at `/sim/:id/` with an installable `manifest.webmanifest`, cached Service Worker (`sw.js`), and generated app icons so it can be installed as an offline-capable PWA on edge devices.

## Firebase, Cloud Sync & Security Rules

Physica Studio integrates three Firebase capabilities:
1. **Firebase AI Logic (Hybrid Inference)** inside exported standalone simulations and hosted PWAs.
2. **Firebase Authentication (Google Sign-In)** as an optional top-bar sign-in (guests retain full local functionality).
3. **Cloud Firestore** (using the named database configured in `firebase-applet-config.json`) storing owner-isolated documents under:
   - `/users/{userId}` — Private user profile and studio preferences
   - `/users/{userId}/projects/{projectId}` — Synced 3D simulation projects
   - `/users/{userId}/projects/{projectId}/versions/{versionId}` — Append-only version snapshots
   - `/users/{userId}/projects/{projectId}/messages/{messageId}` — Builder chat history

All Firestore paths are protected by `firestore.rules` (default-deny catch-all, verified owner checks, strict schema & payload size validation synchronized with `firebase-blueprint.json`, immutable ownership/timestamp fields, and no cross-tenant reads). You can lint the security rules locally with:

```bash
npx eslint firestore.rules
```

## Setup & Local Development

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Configure environment variables**
   Set `GEMINI_API_KEY` in your server environment or `.env` (never exposed to browser code):
   ```bash
   GEMINI_API_KEY="your-gemini-api-key"
   ```

3. **Run development server**
   ```bash
   npm run dev
   ```
   Open `http://localhost:3000`.

4. **Run tests, typechecks & security rules linting**
   ```bash
   npm test
   npm run lint
   npx eslint firestore.rules
   ```

## Configuring Alternative LLM Providers

Physica Studio supports any OpenAI-compatible chat completions server (OpenAI, Ollama, LM Studio, vLLM, OpenRouter) via server-side environment variables:

```bash
LLM_PROVIDER="openai-compatible"
OPENAI_COMPAT_BASE_URL="http://localhost:11434/v1"
OPENAI_COMPAT_API_KEY="optional-key"
OPENAI_COMPAT_MODEL="qwen2.5-coder:32b"
```

Select **OpenAI-Compatible Endpoint** in **Provider & Studio Settings** inside the app. All API credentials stay exclusively on the server.

## Production Build & Deployment

```bash
npm run build
NODE_ENV=production npm start
```

## License

This project is licensed under the Apache License 2.0 — see the [LICENSE](./LICENSE) file for details.
