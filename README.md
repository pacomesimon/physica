# Physica Studio — AI-Powered 3D Physics Simulation Studio

Physica Studio is a web-based simulation engineering environment built for physics teachers. It pairs a natural-language AI simulation developer with a live sandboxed Three.js preview, CodeMirror source inspector, version history with diff comparison, and single-file standalone HTML export for students.

## Architecture & Directory Structure

```text
├── server.ts                          # Express + Vite middleware server (API routes & static serving)
├── server/
│   ├── agentController.ts             # Request validation, HTML verification, error mapping
│   └── llm/
│       ├── types.ts                   # ProviderAdapter interface & structured JSON normalization
│       ├── geminiAdapter.ts           # @google/genai server-side adapter
│       ├── openAiCompatAdapter.ts     # OpenAI-compatible /v1/chat/completions adapter
│       ├── providerRegistry.ts        # Configurable adapter registry
│       └── simulationSystemPrompt.ts  # Physics accuracy & AI-friendly HTML conventions
├── src/
│   ├── App.tsx                        # 3-part studio workspace (Projects, AI Chat, Dominant Preview)
│   ├── components/
│   │   ├── TopBar.tsx                 # Project title, save status, versions, standalone HTML export
│   │   ├── ProjectSidebar.tsx         # New simulation, saved simulations, settings
│   │   ├── ChatPanel.tsx              # Resizable AI conversation panel & suggested prompts
│   │   ├── PreviewPanel.tsx           # Sandboxed iframe, viewport toggle, error recovery, source view
│   │   ├── CodeEditor.tsx             # CodeMirror 6 editor & AI metadata section inspector
│   │   ├── VersionHistoryModal.tsx    # Snapshot timeline, restore, and line-by-line diff viewer
│   │   ├── ExportModal.tsx            # Standalone readiness checks & HTML download
│   │   └── SettingsModal.tsx          # Provider/model selector, appearance theme, auto-snapshot
│   └── lib/
│       ├── demos/projectileMotion.ts  # Reference 3D Projectile Motion simulation & analytical engine
│       ├── metadataParser.ts          # Parser for SIMULATION_METADATA & 10-section JS convention
│       ├── htmlValidator.ts           # Structure, Three.js dependency, and secret-isolation validator
│   │   ├── bridgeInjector.ts          # Ephemeral iframe postMessage bridge (stripped on export)
│   │   ├── exporter.ts                # Standalone HTML packager (auto-embeds walkthrough engine)
│   │   ├── storage.ts                 # LocalStorageRepository persistence abstraction
│   │   └── walkthrough/               # Guided Walkthrough types, reusable controller, & standalone embedder
└── tests/
    ├── studio.test.ts                 # Analytical physics, validation, bridge, and versioning tests
    └── walkthrough.test.ts            # Speech engine, playback, highlighting, state sync, & export tests
```

## Standalone HTML, Guided Walkthroughs & AI-Friendly Documentation

Every generated simulation is a self-contained, unminified HTML5 document using Three.js r170 via an import map (`https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js`), with:
- A structured `<!-- SIMULATION_METADATA ... -->` header documenting learning objectives, physical model, governing equations, interactive parameters, visual elements, controls, state schema, walkthrough metadata/transcript, and agent guidance.
- JavaScript organized into 10 consistent sections (`1. SIMULATION CONFIGURATION` through `10. CLEANUP AND RESET`), plus standardized `window.simulationAPI` (`getState`, `setState`, `getParameters`, `setParameter`, `play`, `pause`, `reset`) and tailored `window.WALKTHROUGH_CONFIG`.
- An embedded standalone **Narrated Guided Walkthrough** engine using the native browser `window.speechSynthesis` API (with graceful silent transcript fallback), synchronized clickable transcript, non-blocking control highlighting, and deterministic checkpoint + interaction-history state reconstruction on pause, resume, seek, and stop.
- Strict separation between physics calculations (`PHYSICS MODEL`), visual rendering, UI controls, and walkthrough narration.

> **CDN Note:** Exported `.html` files run directly in any modern browser without an account or backend server, though internet access is required to load Three.js from jsDelivr CDN.

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

4. **Run tests & typechecks**
   ```bash
   npm test
   npm run lint
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
