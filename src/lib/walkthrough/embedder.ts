export const WALKTHROUGH_ENGINE_START_MARKER = '<!-- WALKTHROUGH_ENGINE_START -->';
export const WALKTHROUGH_ENGINE_END_MARKER = '<!-- WALKTHROUGH_ENGINE_END -->';

export function buildStandaloneWalkthroughBundle(): string {
  return `${WALKTHROUGH_ENGINE_START_MARKER}
<!--
  REUSABLE STANDALONE GUIDED WALKTHROUGH ENGINE
  Sections covered:
  - WALKTHROUGH_HIGHLIGHT_TARGETS
  - WALKTHROUGH_STATE_CHECKPOINTS
  - WALKTHROUGH_INTERACTION_HISTORY
  - WALKTHROUGH_PLAYBACK_ENGINE
  Zero external dependencies; runs independently in any modern browser.
-->
<style id="walkthrough-engine-styles">
  .walkthrough-highlight {
    outline: 2px solid #38bdf8 !important;
    outline-offset: 3px !important;
    box-shadow: 0 0 0 4px rgba(56, 189, 248, 0.24), 0 0 16px rgba(56, 189, 248, 0.28) !important;
    border-radius: 6px;
    transition: outline-color 0.2s ease, box-shadow 0.2s ease;
    position: relative;
    z-index: 25;
  }

  @media (prefers-reduced-motion: no-preference) {
    .walkthrough-highlight {
      animation: wt-soft-ring 2.2s ease-in-out infinite;
    }
    @keyframes wt-soft-ring {
      0%, 100% {
        box-shadow: 0 0 0 3px rgba(56, 189, 248, 0.22), 0 0 12px rgba(56, 189, 248, 0.22);
      }
      50% {
        box-shadow: 0 0 0 6px rgba(56, 189, 248, 0.34), 0 0 20px rgba(56, 189, 248, 0.34);
      }
    }
  }

  #walkthrough-tooltip {
    position: fixed;
    z-index: 45;
    pointer-events: none;
    max-width: 260px;
    padding: 7px 10px;
    background: rgba(15, 23, 42, 0.96);
    border: 1px solid rgba(56, 189, 248, 0.65);
    border-radius: 7px;
    color: #f8fafc;
    font-size: 11px;
    line-height: 1.4;
    box-shadow: 0 8px 20px rgba(2, 6, 23, 0.45);
    display: none;
  }

  #walkthrough-panel {
    position: fixed;
    top: 14px;
    right: 14px;
    width: min(326px, calc(100vw - 28px));
    max-height: calc(100vh - 188px);
    display: flex;
    flex-direction: column;
    background: rgba(15, 23, 42, 0.92);
    border: 1px solid rgba(148, 163, 184, 0.28);
    border-radius: 10px;
    color: #f8fafc;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    font-size: 12px;
    z-index: 35;
    box-shadow: 0 10px 28px rgba(2, 6, 23, 0.45);
    overflow: hidden;
  }

  #walkthrough-panel.wt-minimized {
    max-height: none;
  }

  #walkthrough-panel.wt-minimized .wt-body {
    display: none;
  }

  .wt-header {
    padding: 10px 12px;
    border-bottom: 1px solid rgba(148, 163, 184, 0.16);
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 8px;
  }

  .wt-title {
    font-size: 12.5px;
    font-weight: 600;
    color: #f8fafc;
    line-height: 1.3;
  }

  .wt-description {
    font-size: 11px;
    color: #94a3b8;
    margin-top: 2px;
    line-height: 1.35;
  }

  .wt-header-actions {
    display: flex;
    align-items: center;
    gap: 4px;
    flex-shrink: 0;
  }

  .wt-mini-btn {
    background: transparent;
    border: 1px solid rgba(148, 163, 184, 0.28);
    color: #cbd5e1;
    border-radius: 5px;
    padding: 2px 7px;
    font-size: 10.5px;
    cursor: pointer;
    white-space: nowrap;
  }

  .wt-mini-btn:hover {
    color: #ffffff;
    border-color: rgba(148, 163, 184, 0.55);
  }

  .wt-toolbar {
    padding: 9px 12px;
    border-bottom: 1px solid rgba(148, 163, 184, 0.16);
    display: flex;
    flex-direction: column;
    gap: 8px;
    background: rgba(15, 23, 42, 0.65);
  }

  .wt-controls-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 6px;
    flex-wrap: wrap;
  }

  .wt-btn-group {
    display: flex;
    align-items: center;
    gap: 5px;
  }

  .wt-btn {
    background: rgba(30, 41, 59, 0.95);
    border: 1px solid rgba(148, 163, 184, 0.28);
    color: #f8fafc;
    border-radius: 6px;
    padding: 5px 9px;
    font-size: 11.5px;
    font-weight: 500;
    cursor: pointer;
    white-space: nowrap;
  }

  .wt-btn:hover:not(:disabled) {
    background: rgba(51, 65, 85, 0.98);
  }

  .wt-btn:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  .wt-btn.wt-primary {
    background: #0284c7;
    border-color: #0ea5e9;
    color: #ffffff;
  }

  .wt-btn.wt-primary:hover:not(:disabled) {
    background: #0369a1;
  }

  .wt-rate-select {
    background: rgba(30, 41, 59, 0.95);
    border: 1px solid rgba(148, 163, 184, 0.28);
    color: #e2e8f0;
    border-radius: 6px;
    padding: 4px 6px;
    font-size: 11px;
    cursor: pointer;
  }

  .wt-progress-wrap {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .wt-progress-track {
    position: relative;
    height: 8px;
    background: rgba(51, 65, 85, 0.85);
    border-radius: 999px;
    cursor: pointer;
    overflow: hidden;
  }

  .wt-progress-fill {
    height: 100%;
    width: 0%;
    background: #38bdf8;
    border-radius: 999px;
    transition: width 0.18s linear;
  }

  .wt-progress-markers {
    position: absolute;
    inset: 0;
    pointer-events: none;
  }

  .wt-progress-tick {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 1px;
    background: rgba(15, 23, 42, 0.65);
  }

  .wt-meta-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 10.5px;
    color: #94a3b8;
    font-variant-numeric: tabular-nums;
  }

  .wt-status-banner {
    font-size: 10.5px;
    color: #fbbf24;
    background: rgba(245, 158, 11, 0.12);
    border: 1px solid rgba(245, 158, 11, 0.28);
    border-radius: 6px;
    padding: 5px 8px;
    display: none;
  }

  #walkthrough-transcript {
    overflow-y: auto;
    padding: 8px 10px 10px;
    display: flex;
    flex-direction: column;
    gap: 6px;
    max-height: 280px;
  }

  #walkthrough-transcript.wt-hidden {
    display: none;
  }

  .transcript-segment {
    padding: 8px 9px;
    border-radius: 7px;
    border: 1px solid rgba(148, 163, 184, 0.14);
    background: rgba(30, 41, 59, 0.45);
    color: #cbd5e1;
    cursor: pointer;
    transition: border-color 0.15s ease, background-color 0.15s ease, color 0.15s ease;
    text-align: left;
  }

  .transcript-segment:hover {
    border-color: rgba(56, 189, 248, 0.45);
    background: rgba(30, 41, 59, 0.75);
  }

  .transcript-segment.wt-completed {
    opacity: 0.74;
    border-color: rgba(34, 197, 94, 0.25);
  }

  .transcript-segment.wt-active {
    background: rgba(2, 132, 199, 0.2);
    border-color: #38bdf8;
    color: #ffffff;
  }

  .transcript-segment-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    font-size: 10.5px;
    color: #94a3b8;
    margin-bottom: 3px;
    font-variant-numeric: tabular-nums;
  }

  .transcript-segment.wt-active .transcript-segment-head {
    color: #7dd3fc;
    font-weight: 600;
  }

  .transcript-segment-text {
    font-size: 11.5px;
    line-height: 1.45;
  }

  .transcript-segment-tip {
    margin-top: 4px;
    font-size: 10.5px;
    color: #7dd3fc;
  }

  @media (max-width: 720px) {
    #walkthrough-panel {
      top: auto;
      bottom: 12px;
      right: 12px;
      left: 12px;
      width: auto;
      max-height: 44vh;
    }
  }
</style>

<div id="walkthrough-tooltip" role="tooltip" aria-hidden="true"></div>

<section id="walkthrough-panel" aria-label="Guided Simulation Walkthrough">
  <div class="wt-header">
    <div>
      <div id="wt-title" class="wt-title">Guided Walkthrough</div>
      <div id="wt-description" class="wt-description">Interactive narrated orientation</div>
    </div>
    <div class="wt-header-actions">
      <button id="wt-btn-transcript" class="wt-mini-btn" type="button">Hide Transcript</button>
      <button id="wt-btn-minimize" class="wt-mini-btn" type="button">Minimize</button>
    </div>
  </div>

  <div class="wt-body">
    <div class="wt-toolbar">
      <div class="wt-controls-row">
        <div class="wt-btn-group">
          <button id="wt-btn-play" class="wt-btn wt-primary" type="button">Play</button>
          <button id="wt-btn-pause" class="wt-btn" type="button" disabled>Pause</button>
          <button id="wt-btn-stop" class="wt-btn" type="button" disabled>Stop</button>
          <button id="wt-btn-replay" class="wt-btn" type="button" title="Replay current segment">Replay</button>
        </div>
        <select id="wt-select-rate" class="wt-rate-select" aria-label="Narration speech speed">
          <option value="0.75">0.75×</option>
          <option value="1" selected>1.0×</option>
          <option value="1.25">1.25×</option>
          <option value="1.5">1.5×</option>
        </select>
      </div>

      <div class="wt-progress-wrap">
        <div
          id="wt-progress-track"
          class="wt-progress-track"
          role="slider"
          tabindex="0"
          aria-label="Walkthrough timeline progress"
          aria-valuemin="0"
          aria-valuemax="100"
          aria-valuenow="0"
        >
          <div id="wt-progress-fill" class="wt-progress-fill"></div>
          <div id="wt-progress-markers" class="wt-progress-markers"></div>
        </div>
        <div class="wt-meta-row">
          <span id="wt-time-label">0:00 / 0:00</span>
          <span id="wt-segment-label">Ready · 0 / 0</span>
        </div>
      </div>

      <div id="wt-status-banner" class="wt-status-banner" role="status"></div>
    </div>

    <div id="walkthrough-transcript" aria-label="Walkthrough Transcript"></div>
  </div>
</section>

<script id="walkthrough-playback-engine-script">
(function () {
  if (window.__walkthroughEngineMounted) return;
  window.__walkthroughEngineMounted = true;

  // =========================================================================
  // WALKTHROUGH_HIGHLIGHT_TARGETS
  // =========================================================================
  let primaryHighlightSelector = null;

  function positionTooltip(targetEl, tooltipText) {
    const tip = document.getElementById('walkthrough-tooltip');
    if (!tip) return;
    if (!targetEl || !tooltipText) {
      tip.style.display = 'none';
      tip.setAttribute('aria-hidden', 'true');
      return;
    }
    tip.textContent = tooltipText;
    tip.style.display = 'block';
    tip.setAttribute('aria-hidden', 'false');

    const rect = targetEl.getBoundingClientRect();
    const tipRect = tip.getBoundingClientRect();
    let top = rect.top - tipRect.height - 10;
    if (top < 10) {
      top = Math.min(window.innerHeight - tipRect.height - 10, rect.bottom + 10);
    }
    let left = rect.left + rect.width / 2 - tipRect.width / 2;
    left = Math.max(10, Math.min(window.innerWidth - tipRect.width - 10, left));
    tip.style.top = Math.round(top) + 'px';
    tip.style.left = Math.round(left) + 'px';
  }

  function highlightElement(selector) {
    if (!selector || typeof selector !== 'string') return null;
    try {
      const element = document.querySelector(selector);
      if (!element) return null;
      element.classList.add('walkthrough-highlight');
      return element;
    } catch (err) {
      return null;
    }
  }

  function clearWalkthroughHighlights() {
    primaryHighlightSelector = null;
    document.querySelectorAll('.walkthrough-highlight').forEach(function (el) {
      el.classList.remove('walkthrough-highlight');
    });
    positionTooltip(null, '');
  }

  function applySegmentHighlights(segment) {
    clearWalkthroughHighlights();
    if (!segment) return;

    const targets = [];
    if (Array.isArray(segment.highlight)) {
      segment.highlight.forEach(function (s) {
        if (s && targets.indexOf(s) === -1) targets.push(s);
      });
    }
    if (Array.isArray(segment.actions)) {
      segment.actions.forEach(function (action) {
        if (action && action.type === 'highlight' && action.target && targets.indexOf(action.target) === -1) {
          targets.push(action.target);
        }
      });
    }

    let firstMatchedEl = null;
    targets.forEach(function (selector) {
      const el = highlightElement(selector);
      if (el && !firstMatchedEl) {
        firstMatchedEl = el;
        primaryHighlightSelector = selector;
      }
    });

    if (firstMatchedEl && segment.tooltip) {
      positionTooltip(firstMatchedEl, segment.tooltip);
    }
  }

  // =========================================================================
  // WALKTHROUGH_STATE_CHECKPOINTS & WALKTHROUGH_INTERACTION_HISTORY
  // =========================================================================
  window.WALKTHROUGH_STATE_CHECKPOINTS = [];
  window.WALKTHROUGH_INTERACTION_HISTORY = [];
  window.WALKTHROUGH_HISTORY = window.WALKTHROUGH_INTERACTION_HISTORY;

  function cloneJson(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  function getSafeSimAPI() {
    if (window.simulationAPI && typeof window.simulationAPI.getState === 'function') {
      return window.simulationAPI;
    }
    return {
      getState: function () { return { time: 0, parameters: {} }; },
      setState: function () {},
      getParameters: function () { return {}; },
      setParameter: function () {},
      play: function () {},
      pause: function () {},
      reset: function () {},
    };
  }

  // =========================================================================
  // WALKTHROUGH_PLAYBACK_ENGINE
  // =========================================================================
  function formatClock(ms) {
    const totalSec = Math.max(0, Math.round(ms / 1000));
    const mins = Math.floor(totalSec / 60);
    const secs = totalSec % 60;
    return mins + ':' + (secs < 10 ? '0' : '') + secs;
  }

  function initWalkthroughEngine() {
    const config = window.WALKTHROUGH_CONFIG;
    if (!config || !Array.isArray(config.segments) || config.segments.length === 0) {
      const panel = document.getElementById('walkthrough-panel');
      if (panel) panel.style.display = 'none';
      return;
    }

    const simAPI = getSafeSimAPI();
    const segments = config.segments;
    const segmentStartsMs = [];
    let totalDurationMs = 0;

    segments.forEach(function (seg) {
      segmentStartsMs.push(totalDurationMs);
      totalDurationMs += Math.max(1, Number(seg.durationEstimate) || 10) * 1000;
    });

    const speechSupported =
      typeof window.speechSynthesis !== 'undefined' &&
      typeof window.SpeechSynthesisUtterance !== 'undefined';

    const state = {
      status: 'ready', // ready | playing | paused | completed
      activeSegmentIndex: -1,
      walkthroughTimeMs: 0,
      speechRate: 1.0,
      pitch: 1.0,
      volume: 1.0,
      utteranceToken: 0,
      segmentPlayStartedWallMs: 0,
      segmentElapsedBeforePauseMs: 0,
      silentTimer: null,
      progressTimer: null,
      initialSnapshot: null,
      pausedSnapshot: null,
      suppressRecording: false,
      voices: [],
    };

    function loadVoices() {
      if (!speechSupported) return;
      try {
        state.voices = window.speechSynthesis.getVoices() || [];
      } catch (e) {
        state.voices = [];
      }
    }
    if (speechSupported) {
      loadVoices();
      if (typeof window.speechSynthesis.addEventListener === 'function') {
        window.speechSynthesis.addEventListener('voiceschanged', loadVoices);
      }
    }

    function captureCheckpoint(reason, segIdx, segId) {
      const snap = {
        id: 'cp-' + reason + '-' + segIdx + '-' + Date.now(),
        timestamp: Math.max(0, Math.round(state.walkthroughTimeMs)),
        wallClock: Date.now(),
        segmentIndex: segIdx,
        walkthroughSegment: segId || 'initial',
        reason: reason,
        simulation: cloneJson(simAPI.getState()),
      };

      if (reason === 'initial') {
        state.initialSnapshot = snap;
        window.WALKTHROUGH_STATE_CHECKPOINTS = [snap];
      } else if (reason === 'pause') {
        state.pausedSnapshot = snap;
      } else if (reason === 'start' || reason === 'segment') {
        const idx = window.WALKTHROUGH_STATE_CHECKPOINTS.findIndex(function (cp) {
          return cp.segmentIndex === segIdx && cp.reason === reason;
        });
        if (idx >= 0) {
          window.WALKTHROUGH_STATE_CHECKPOINTS[idx] = snap;
        } else {
          window.WALKTHROUGH_STATE_CHECKPOINTS.push(snap);
        }
        window.WALKTHROUGH_STATE_CHECKPOINTS.sort(function (a, b) {
          return a.timestamp - b.timestamp;
        });
      }
      return snap;
    }

    function getCurrentWalkthroughTimeMs() {
      if (state.status !== 'playing' || state.activeSegmentIndex < 0) {
        return Math.max(0, Math.round(state.walkthroughTimeMs));
      }
      const seg = segments[state.activeSegmentIndex];
      if (!seg) return Math.max(0, Math.round(state.walkthroughTimeMs));
      const segStart = segmentStartsMs[state.activeSegmentIndex] || 0;
      const segDurMs = Math.max(1, Number(seg.durationEstimate) || 10) * 1000;
      const elapsed =
        (state.segmentElapsedBeforePauseMs + (Date.now() - state.segmentPlayStartedWallMs)) *
        state.speechRate;
      const clamped = Math.min(segDurMs * 0.99, Math.max(0, elapsed));
      return Math.round(Math.min(totalDurationMs, segStart + clamped));
    }

    function recordInteraction(event) {
      if (state.suppressRecording || !event) return null;
      const segIdx = state.activeSegmentIndex >= 0 ? state.activeSegmentIndex : 0;
      const segId = segments[segIdx] ? segments[segIdx].id : 'initial';
      const currentState = cloneJson(simAPI.getState());
      const nowWtMs = getCurrentWalkthroughTimeMs();
      const entry = {
        time: nowWtMs,
        wallClock: Date.now(),
        segmentIndex: segIdx,
        segmentId: segId,
        type: event.type || 'parameter-change',
        target: event.target || 'unknown',
        previousValue: event.previousValue,
        newValue: event.newValue,
        stateAfter: currentState,
      };
      window.WALKTHROUGH_INTERACTION_HISTORY.push(entry);

      if (state.pausedSnapshot) {
        state.pausedSnapshot = Object.assign({}, state.pausedSnapshot, {
          simulation: currentState,
          wallClock: Date.now(),
        });
      }
      return entry;
    }

    function reconstructStateAt(targetTimeMs, targetSegmentIndex) {
      if (!state.initialSnapshot) return null;
      let baseCp = state.initialSnapshot;
      window.WALKTHROUGH_STATE_CHECKPOINTS.forEach(function (cp) {
        const withinTime = cp.timestamp <= targetTimeMs;
        const withinSeg =
          typeof targetSegmentIndex !== 'number' || cp.segmentIndex <= targetSegmentIndex;
        if (withinTime && withinSeg && cp.timestamp >= baseCp.timestamp) {
          baseCp = cp;
        }
      });

      let reconstructed = cloneJson(baseCp.simulation);
      const events = window.WALKTHROUGH_INTERACTION_HISTORY
        .filter(function (ev) {
          return ev.time > baseCp.timestamp && ev.time <= targetTimeMs;
        })
        .sort(function (a, b) {
          return a.time - b.time;
        });

      events.forEach(function (ev) {
        if (ev.type === 'parameter-change' && typeof ev.newValue !== 'undefined') {
          reconstructed.parameters = Object.assign({}, reconstructed.parameters || {});
          reconstructed.parameters[ev.target] = ev.newValue;
        } else if (ev.type === 'control-toggle' && typeof ev.newValue !== 'undefined') {
          reconstructed.controls = Object.assign({}, reconstructed.controls || {});
          reconstructed.controls[ev.target] = ev.newValue;
          if (reconstructed.parameters && Object.prototype.hasOwnProperty.call(reconstructed.parameters, ev.target)) {
            reconstructed.parameters = Object.assign({}, reconstructed.parameters);
            reconstructed.parameters[ev.target] = ev.newValue;
          }
        } else if (ev.type === 'camera-change' && ev.stateAfter && ev.stateAfter.camera) {
          reconstructed.camera = cloneJson(ev.stateAfter.camera);
        } else if (ev.stateAfter) {
          reconstructed = cloneJson(ev.stateAfter);
        }
      });

      return reconstructed;
    }

    function applyStateSafely(simStateObj) {
      if (!simStateObj) return;
      state.suppressRecording = true;
      try {
        simAPI.setState(cloneJson(simStateObj));
      } finally {
        state.suppressRecording = false;
      }
    }

    function stopTimers() {
      if (state.silentTimer) {
        clearTimeout(state.silentTimer);
        state.silentTimer = null;
      }
      if (state.progressTimer) {
        clearInterval(state.progressTimer);
        state.progressTimer = null;
      }
    }

    function cancelSpeech() {
      if (!speechSupported) return;
      try {
        window.speechSynthesis.cancel();
      } catch (e) {}
    }

    function setBanner(message) {
      const banner = document.getElementById('wt-status-banner');
      if (!banner) return;
      if (message) {
        banner.textContent = message;
        banner.style.display = 'block';
      } else {
        banner.textContent = '';
        banner.style.display = 'none';
      }
    }

    function renderTranscript() {
      const container = document.getElementById('walkthrough-transcript');
      if (!container) return;
      container.innerHTML = '';

      segments.forEach(function (seg, idx) {
        const item = document.createElement('button');
        item.type = 'button';
        item.className = 'transcript-segment';
        item.setAttribute('data-segment', seg.id);
        item.setAttribute('data-index', String(idx));

        const head = document.createElement('div');
        head.className = 'transcript-segment-head';
        const titleSpan = document.createElement('span');
        titleSpan.textContent = (idx + 1) + '. ' + (seg.title || seg.id);
        const durSpan = document.createElement('span');
        durSpan.textContent = formatClock((seg.durationEstimate || 10) * 1000);
        head.appendChild(titleSpan);
        head.appendChild(durSpan);

        const body = document.createElement('div');
        body.className = 'transcript-segment-text';
        body.textContent = seg.text;

        item.appendChild(head);
        item.appendChild(body);

        if (seg.experimentSuggestion) {
          const tip = document.createElement('div');
          tip.className = 'transcript-segment-tip';
          tip.textContent = 'Try: ' + seg.experimentSuggestion;
          item.appendChild(tip);
        }

        item.addEventListener('click', function () {
          seekToSegment(idx, true);
        });
        container.appendChild(item);
      });

      // Render progress tick markers
      const markersEl = document.getElementById('wt-progress-markers');
      if (markersEl && totalDurationMs > 0) {
        markersEl.innerHTML = '';
        segmentStartsMs.forEach(function (startMs, idx) {
          if (idx === 0) return;
          const tick = document.createElement('div');
          tick.className = 'wt-progress-tick';
          tick.style.left = ((startMs / totalDurationMs) * 100).toFixed(2) + '%';
          markersEl.appendChild(tick);
        });
      }
    }

    function updateUI(scrollActiveIntoView) {
      const btnPlay = document.getElementById('wt-btn-play');
      const btnPause = document.getElementById('wt-btn-pause');
      const btnStop = document.getElementById('wt-btn-stop');
      const fill = document.getElementById('wt-progress-fill');
      const track = document.getElementById('wt-progress-track');
      const timeLbl = document.getElementById('wt-time-label');
      const segLbl = document.getElementById('wt-segment-label');

      if (btnPlay) {
        btnPlay.textContent = state.status === 'paused' ? 'Resume' : 'Play';
        btnPlay.disabled = state.status === 'playing';
      }
      if (btnPause) {
        btnPause.disabled = state.status !== 'playing';
      }
      if (btnStop) {
        btnStop.disabled = state.status === 'ready' && state.activeSegmentIndex < 0;
      }

      const pct = totalDurationMs > 0
        ? Math.min(100, Math.max(0, (state.walkthroughTimeMs / totalDurationMs) * 100))
        : 0;
      if (fill) fill.style.width = pct.toFixed(1) + '%';
      if (track) track.setAttribute('aria-valuenow', String(Math.round(pct)));
      if (timeLbl) {
        timeLbl.textContent = formatClock(state.walkthroughTimeMs) + ' / ' + formatClock(totalDurationMs);
      }

      if (segLbl) {
        const displayIdx = state.activeSegmentIndex >= 0 ? state.activeSegmentIndex + 1 : 0;
        const statusWord =
          state.status === 'playing'
            ? (speechSupported ? 'Narrating' : 'Silent Mode')
            : state.status === 'paused'
              ? 'Paused'
              : state.status === 'completed'
                ? 'Completed'
                : 'Ready';
        segLbl.textContent = statusWord + ' · ' + displayIdx + ' / ' + segments.length;
      }

      const nodes = document.querySelectorAll('#walkthrough-transcript .transcript-segment');
      nodes.forEach(function (node, idx) {
        node.classList.remove('wt-active', 'wt-completed');
        if (state.status === 'completed' || (state.activeSegmentIndex >= 0 && idx < state.activeSegmentIndex)) {
          node.classList.add('wt-completed');
        } else if (idx === state.activeSegmentIndex) {
          node.classList.add('wt-active');
          if (scrollActiveIntoView && typeof node.scrollIntoView === 'function') {
            node.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          }
        }
      });
    }

    function startProgressTicker() {
      if (state.progressTimer) clearInterval(state.progressTimer);
      state.progressTimer = setInterval(function () {
        if (state.status !== 'playing' || state.activeSegmentIndex < 0) return;
        const seg = segments[state.activeSegmentIndex];
        if (!seg) return;
        const segStart = segmentStartsMs[state.activeSegmentIndex] || 0;
        const segDurMs = Math.max(1, Number(seg.durationEstimate) || 10) * 1000;
        const elapsed =
          (state.segmentElapsedBeforePauseMs + (Date.now() - state.segmentPlayStartedWallMs)) *
          state.speechRate;
        const clamped = Math.min(segDurMs * 0.98, Math.max(0, elapsed));
        state.walkthroughTimeMs = Math.min(totalDurationMs, segStart + clamped);
        updateUI(false);
      }, 220);
    }

    function scheduleSilentAdvance(index) {
      const seg = segments[index];
      if (!seg) return;
      const token = state.utteranceToken;
      const fullMs = (Math.max(1, Number(seg.durationEstimate) || 10) * 1000) / Math.max(0.5, state.speechRate);
      const remainingMs = Math.max(250, fullMs - state.segmentElapsedBeforePauseMs);
      state.silentTimer = setTimeout(function () {
        if (token !== state.utteranceToken || state.status !== 'playing') return;
        advanceToNextSegment();
      }, remainingMs);
    }

    function speakSegment(index, captureCp) {
      const seg = segments[index];
      if (!seg) return;

      state.utteranceToken += 1;
      const token = state.utteranceToken;
      stopTimers();
      cancelSpeech();

      state.segmentPlayStartedWallMs = Date.now();
      state.segmentElapsedBeforePauseMs = 0;

      if (captureCp) {
        captureCheckpoint('segment', index, seg.id);
      }

      applySegmentHighlights(seg);
      startProgressTicker();
      updateUI(true);

      if (!speechSupported) {
        setBanner('Browser speech synthesis unavailable — following synchronized transcript.');
        scheduleSilentAdvance(index);
        return;
      }

      setBanner('');
      const utterance = new window.SpeechSynthesisUtterance(seg.text);
      utterance.lang = config.language || 'en-US';
      utterance.rate = state.speechRate;
      utterance.pitch = state.pitch;
      utterance.volume = state.volume;

      if (state.voices.length === 0) loadVoices();
      const targetLang = (config.language || 'en-US').toLowerCase();
      const langPrefix = targetLang.split('-')[0];
      const chosenVoice =
        state.voices.find(function (v) { return (v.lang || '').toLowerCase() === targetLang; }) ||
        state.voices.find(function (v) { return (v.lang || '').toLowerCase().indexOf(langPrefix) === 0; }) ||
        state.voices[0];
      if (chosenVoice) utterance.voice = chosenVoice;

      utterance.onstart = function () {
        if (token !== state.utteranceToken) return;
        state.segmentPlayStartedWallMs = Date.now();
        updateUI(false);
      };

      utterance.onpause = function () {
        if (token !== state.utteranceToken) return;
        updateUI(false);
      };

      utterance.onresume = function () {
        if (token !== state.utteranceToken) return;
        state.segmentPlayStartedWallMs = Date.now();
        updateUI(false);
      };

      utterance.onend = function () {
        if (token !== state.utteranceToken || state.status !== 'playing') return;
        advanceToNextSegment();
      };

      utterance.onerror = function (ev) {
        if (token !== state.utteranceToken) return;
        const code = ev && ev.error ? ev.error : 'speech-error';
        if (code === 'canceled' || code === 'interrupted') return;
        setBanner('Speech unavailable (' + code + ') — continuing in silent transcript mode.');
        scheduleSilentAdvance(index);
      };

      try {
        window.speechSynthesis.speak(utterance);
      } catch (e) {
        setBanner('Speech synthesis blocked — continuing in silent transcript mode.');
        scheduleSilentAdvance(index);
      }
    }

    function advanceToNextSegment() {
      const nextIdx = state.activeSegmentIndex + 1;
      if (nextIdx >= segments.length) {
        stopTimers();
        state.status = 'completed';
        state.walkthroughTimeMs = totalDurationMs;
        clearWalkthroughHighlights();
        updateUI(false);
        return;
      }
      state.activeSegmentIndex = nextIdx;
      state.walkthroughTimeMs = segmentStartsMs[nextIdx] || state.walkthroughTimeMs;
      speakSegment(nextIdx, true);
    }

    function play() {
      if (state.status === 'playing') return;
      if (state.status === 'paused' && state.activeSegmentIndex >= 0) {
        resume();
        return;
      }
      state.status = 'playing';
      state.activeSegmentIndex = 0;
      state.walkthroughTimeMs = 0;
      state.segmentElapsedBeforePauseMs = 0;
      captureCheckpoint('start', 0, segments[0].id);
      speakSegment(0, false);
    }

    function pause() {
      if (state.status !== 'playing') return;
      state.status = 'paused';
      stopTimers();
      state.segmentElapsedBeforePauseMs += Math.max(0, Date.now() - state.segmentPlayStartedWallMs);
      const seg = segments[state.activeSegmentIndex];
      if (seg) {
        captureCheckpoint('pause', state.activeSegmentIndex, seg.id);
      }
      if (speechSupported && window.speechSynthesis.speaking && !window.speechSynthesis.paused) {
        try {
          window.speechSynthesis.pause();
        } catch (e) {}
      }
      updateUI(false);
    }

    function resume() {
      if (state.status !== 'paused' || state.activeSegmentIndex < 0) return;
      state.status = 'playing';
      if (state.pausedSnapshot) {
        applyStateSafely(state.pausedSnapshot.simulation);
      }
      const seg = segments[state.activeSegmentIndex];
      if (seg) applySegmentHighlights(seg);

      state.segmentPlayStartedWallMs = Date.now();
      startProgressTicker();

      if (speechSupported && window.speechSynthesis.paused) {
        try {
          window.speechSynthesis.resume();
        } catch (e) {
          speakSegment(state.activeSegmentIndex, false);
        }
      } else if (speechSupported) {
        speakSegment(state.activeSegmentIndex, false);
      } else {
        scheduleSilentAdvance(state.activeSegmentIndex);
      }
      updateUI(false);
    }

    function stop() {
      state.utteranceToken += 1;
      stopTimers();
      cancelSpeech();
      clearWalkthroughHighlights();
      setBanner('');

      state.status = 'ready';
      state.activeSegmentIndex = -1;
      state.walkthroughTimeMs = 0;
      state.segmentElapsedBeforePauseMs = 0;
      state.pausedSnapshot = null;

      if (state.initialSnapshot) {
        applyStateSafely(state.initialSnapshot.simulation);
      } else if (typeof simAPI.reset === 'function') {
        simAPI.reset();
      }
      updateUI(false);
    }

    function seekToSegment(index, autoPlay) {
      if (index < 0 || index >= segments.length) return;
      state.utteranceToken += 1;
      stopTimers();
      cancelSpeech();

      const targetMs = segmentStartsMs[index] || 0;
      state.activeSegmentIndex = index;
      state.walkthroughTimeMs = targetMs;
      state.segmentElapsedBeforePauseMs = 0;

      const reconstructed = reconstructStateAt(targetMs, index);
      if (reconstructed) {
        applyStateSafely(reconstructed);
      }

      const seg = segments[index];
      applySegmentHighlights(seg);

      if (autoPlay !== false) {
        state.status = 'playing';
        speakSegment(index, false);
      } else {
        state.status = 'paused';
        captureCheckpoint('pause', index, seg.id);
        updateUI(true);
      }
    }

    function seekByRatio(ratio) {
      const clamped = Math.min(1, Math.max(0, ratio));
      const targetMs = clamped * totalDurationMs;
      let targetIdx = 0;
      for (let i = 0; i < segmentStartsMs.length; i++) {
        if (segmentStartsMs[i] <= targetMs) targetIdx = i;
      }
      seekToSegment(targetIdx, state.status === 'playing' || state.status === 'ready');
    }

    // Populate title & description
    const titleEl = document.getElementById('wt-title');
    const descEl = document.getElementById('wt-description');
    if (titleEl && config.title) titleEl.textContent = config.title;
    if (descEl && config.description) descEl.textContent = config.description;

    renderTranscript();
    captureCheckpoint('initial', 0, 'initial');
    updateUI(false);

    // Wire toolbar controls
    const btnPlay = document.getElementById('wt-btn-play');
    const btnPause = document.getElementById('wt-btn-pause');
    const btnStop = document.getElementById('wt-btn-stop');
    const btnReplay = document.getElementById('wt-btn-replay');
    const rateSelect = document.getElementById('wt-select-rate');
    const track = document.getElementById('wt-progress-track');
    const btnTranscript = document.getElementById('wt-btn-transcript');
    const btnMinimize = document.getElementById('wt-btn-minimize');

    if (btnPlay) btnPlay.addEventListener('click', play);
    if (btnPause) btnPause.addEventListener('click', pause);
    if (btnStop) btnStop.addEventListener('click', stop);
    if (btnReplay) {
      btnReplay.addEventListener('click', function () {
        const idx = state.activeSegmentIndex >= 0 ? state.activeSegmentIndex : 0;
        seekToSegment(idx, true);
      });
    }
    if (rateSelect) {
      rateSelect.addEventListener('change', function (e) {
        state.speechRate = Math.min(2.0, Math.max(0.5, parseFloat(e.target.value) || 1.0));
        if (state.status === 'playing' && state.activeSegmentIndex >= 0) {
          speakSegment(state.activeSegmentIndex, false);
        }
      });
    }
    if (track) {
      track.addEventListener('click', function (e) {
        const rect = track.getBoundingClientRect();
        if (rect.width <= 0) return;
        seekByRatio((e.clientX - rect.left) / rect.width);
      });
      track.addEventListener('keydown', function (e) {
        if (e.key === 'ArrowRight') {
          e.preventDefault();
          const next = Math.min(segments.length - 1, Math.max(0, state.activeSegmentIndex + 1));
          seekToSegment(next, state.status === 'playing');
        } else if (e.key === 'ArrowLeft') {
          e.preventDefault();
          const prev = Math.max(0, state.activeSegmentIndex - 1);
          seekToSegment(prev, state.status === 'playing');
        }
      });
    }
    if (btnTranscript) {
      btnTranscript.addEventListener('click', function () {
        const el = document.getElementById('walkthrough-transcript');
        if (!el) return;
        const hidden = el.classList.toggle('wt-hidden');
        btnTranscript.textContent = hidden ? 'Show Transcript' : 'Hide Transcript';
      });
    }
    if (btnMinimize) {
      btnMinimize.addEventListener('click', function () {
        const panel = document.getElementById('walkthrough-panel');
        if (!panel) return;
        const minimized = panel.classList.toggle('wt-minimized');
        btnMinimize.textContent = minimized ? 'Expand' : 'Minimize';
      });
    }

    // Automatic delegated capture for any student control changes outside the walkthrough panel
    document.addEventListener('change', function (e) {
      const target = e.target;
      if (!target || !target.closest) return;
      if (target.closest('#walkthrough-panel')) return;
      if (target.tagName === 'INPUT' || target.tagName === 'SELECT') {
        const key = target.getAttribute('data-param') || target.id || target.name || 'control';
        const val = target.type === 'checkbox'
          ? Boolean(target.checked)
          : (target.type === 'range' || target.type === 'number' ? parseFloat(target.value) : target.value);
        recordInteraction({
          type: target.type === 'checkbox' ? 'control-toggle' : 'parameter-change',
          target: key,
          newValue: val,
        });
      }
    });

    // Reposition active tooltip on window resize
    window.addEventListener('resize', function () {
      if (primaryHighlightSelector && state.activeSegmentIndex >= 0) {
        const el = document.querySelector(primaryHighlightSelector);
        const seg = segments[state.activeSegmentIndex];
        if (el && seg && seg.tooltip) {
          positionTooltip(el, seg.tooltip);
        }
      }
    });

    // Pause cleanly if browser tab is hidden while playing so walkthrough clock does not drift
    document.addEventListener('visibilitychange', function () {
      if (document.hidden && state.status === 'playing') {
        pause();
      }
    });

    window.addEventListener('beforeunload', function () {
      stopTimers();
      cancelSpeech();
    });

    // Expose public walkthrough controller for simulations and debugging
    window.walkthroughEngine = {
      play: play,
      pause: pause,
      resume: resume,
      stop: stop,
      seekToSegment: seekToSegment,
      recordInteraction: recordInteraction,
      highlightElement: highlightElement,
      clearWalkthroughHighlights: clearWalkthroughHighlights,
      reconstructStateAt: reconstructStateAt,
      getState: function () {
        return {
          status: state.status,
          activeSegmentIndex: state.activeSegmentIndex,
          walkthroughTimeMs: state.walkthroughTimeMs,
          totalDurationMs: totalDurationMs,
          speechRate: state.speechRate,
          speechSupported: speechSupported,
        };
      },
    };
  }

  // Wait for module scripts (which define window.simulationAPI & window.WALKTHROUGH_CONFIG) to complete
  function bootstrapWhenReady(attemptsLeft) {
    if (window.WALKTHROUGH_CONFIG && Array.isArray(window.WALKTHROUGH_CONFIG.segments)) {
      initWalkthroughEngine();
      return;
    }
    if (attemptsLeft > 0) {
      setTimeout(function () {
        bootstrapWhenReady(attemptsLeft - 1);
      }, 60);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      bootstrapWhenReady(30);
    });
  } else {
    bootstrapWhenReady(30);
  }
})();
</script>
${WALKTHROUGH_ENGINE_END_MARKER}`;
}

export function stripWalkthroughBundle(html: string): string {
  const escapedStart = WALKTHROUGH_ENGINE_START_MARKER.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const escapedEnd = WALKTHROUGH_ENGINE_END_MARKER.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return html.replace(new RegExp(`${escapedStart}[\\s\\S]*?${escapedEnd}\\s*`, 'g'), '');
}

/**
 * Ensures that a standalone simulation HTML document containing WALKTHROUGH_CONFIG
 * embeds the complete, unminified reusable WALKTHROUGH_PLAYBACK_ENGINE before </body>.
 */
export function ensureWalkthroughEmbedded(html: string): string {
  if (!/WALKTHROUGH_CONFIG/.test(html)) {
    return html;
  }

  // If the bundle is already embedded, refresh it cleanly; if the author wrote a custom
  // #walkthrough-panel and speechSynthesis engine without our markers, preserve theirs.
  const hasMarkers = html.includes(WALKTHROUGH_ENGINE_START_MARKER);
  const hasCustomEngine =
    !hasMarkers &&
    /id=["']walkthrough-transcript["']/i.test(html) &&
    /speechSynthesis/i.test(html);

  if (hasCustomEngine) {
    return html;
  }

  const cleaned = stripWalkthroughBundle(html);
  const bundle = buildStandaloneWalkthroughBundle();

  if (/<\/body>/i.test(cleaned)) {
    return cleaned.replace(/<\/body>/i, () => `\n${bundle}\n</body>`);
  }
  return `${cleaned}\n${bundle}`;
}

/**
 * Extracts all CSS selectors referenced in WALKTHROUGH_CONFIG highlight/actions arrays
 * and verifies whether their target IDs or data-attributes exist in the HTML document.
 */
export function validateWalkthroughSelectors(html: string): {
  selectors: string[];
  missingSelectors: string[];
} {
  const selectors = new Set<string>();

  const highlightMatches = html.matchAll(/highlight\s*:\s*\[([^\]]*)\]/g);
  for (const match of highlightMatches) {
    const inner = match[1] || '';
    for (const strMatch of inner.matchAll(/['"]([^'"]+)['"]/g)) {
      if (strMatch[1]?.trim()) {
        selectors.add(strMatch[1].trim());
      }
    }
  }

  const targetMatches = html.matchAll(/target\s*:\s*['"]([#.\[][^'"]+)['"]/g);
  for (const match of targetMatches) {
    if (match[1]?.trim()) {
      selectors.add(match[1].trim());
    }
  }

  const missingSelectors: string[] = [];
  for (const sel of selectors) {
    if (sel.startsWith('#')) {
      const id = sel.slice(1);
      const idPattern = new RegExp(`id\\s*=\\s*["']${id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["']`, 'i');
      if (!idPattern.test(html)) {
        missingSelectors.push(sel);
      }
    } else if (sel.startsWith('[data-')) {
      const attrMatch = sel.match(/^\[(data-[a-z0-9-]+)(?:=["']?([^"'\]]+)["']?)?\]$/i);
      if (attrMatch) {
        const attrName = attrMatch[1];
        const attrVal = attrMatch[2];
        const attrPattern = attrVal
          ? new RegExp(`${attrName}\\s*=\\s*["']${attrVal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["']`, 'i')
          : new RegExp(`${attrName}\\b`, 'i');
        if (!attrPattern.test(html)) {
          missingSelectors.push(sel);
        }
      }
    }
  }

  return {
    selectors: Array.from(selectors),
    missingSelectors,
  };
}
