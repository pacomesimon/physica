import { ensureWalkthroughEmbedded } from '../walkthrough/embedder.ts';

export interface DoublePendulumState {
  theta1: number; // rad from downward vertical
  theta2: number; // rad from downward vertical
  omega1: number; // rad/s
  omega2: number; // rad/s
}

export interface DoublePendulumParams {
  m1: number; // kg
  m2: number; // kg
  L1: number; // m
  L2: number; // m
  g: number; // m/s^2
}

export interface DoublePendulumEnergy {
  kinetic: number;
  potential: number;
  total: number;
  v1: number;
  v2: number;
}

/**
 * Exact coupled Euler-Lagrange angular accelerations for an ideal planar double pendulum.
 */
export function computeDoublePendulumDerivatives(
  state: DoublePendulumState,
  params: DoublePendulumParams
): DoublePendulumState {
  const { theta1, theta2, omega1, omega2 } = state;
  const { m1, m2, L1, L2, g } = params;
  const delta = theta1 - theta2;
  const sinD = Math.sin(delta);
  const cosD = Math.cos(delta);
  const denom = Math.max(1e-6, 2 * m1 + m2 - m2 * Math.cos(2 * delta));

  const alpha1 =
    (-g * (2 * m1 + m2) * Math.sin(theta1) -
      m2 * g * Math.sin(theta1 - 2 * theta2) -
      2 * sinD * m2 * (omega2 * omega2 * L2 + omega1 * omega1 * L1 * cosD)) /
    (L1 * denom);

  const alpha2 =
    (2 *
      sinD *
      (omega1 * omega1 * L1 * (m1 + m2) +
        g * (m1 + m2) * Math.cos(theta1) +
        omega2 * omega2 * L2 * m2 * cosD)) /
    (L2 * denom);

  return {
    theta1: omega1,
    theta2: omega2,
    omega1: alpha1,
    omega2: alpha2,
  };
}

/**
 * 4th-order Runge-Kutta (RK4) integrator step for high-accuracy energy conservation.
 */
export function stepDoublePendulumRK4(
  state: DoublePendulumState,
  params: DoublePendulumParams,
  dt: number
): DoublePendulumState {
  const k1 = computeDoublePendulumDerivatives(state, params);
  const s2: DoublePendulumState = {
    theta1: state.theta1 + 0.5 * dt * k1.theta1,
    theta2: state.theta2 + 0.5 * dt * k1.theta2,
    omega1: state.omega1 + 0.5 * dt * k1.omega1,
    omega2: state.omega2 + 0.5 * dt * k1.omega2,
  };
  const k2 = computeDoublePendulumDerivatives(s2, params);
  const s3: DoublePendulumState = {
    theta1: state.theta1 + 0.5 * dt * k2.theta1,
    theta2: state.theta2 + 0.5 * dt * k2.theta2,
    omega1: state.omega1 + 0.5 * dt * k2.omega1,
    omega2: state.omega2 + 0.5 * dt * k2.omega2,
  };
  const k3 = computeDoublePendulumDerivatives(s3, params);
  const s4: DoublePendulumState = {
    theta1: state.theta1 + dt * k3.theta1,
    theta2: state.theta2 + dt * k3.theta2,
    omega1: state.omega1 + dt * k3.omega1,
    omega2: state.omega2 + dt * k3.omega2,
  };
  const k4 = computeDoublePendulumDerivatives(s4, params);

  return {
    theta1: state.theta1 + (dt / 6) * (k1.theta1 + 2 * k2.theta1 + 2 * k3.theta1 + k4.theta1),
    theta2: state.theta2 + (dt / 6) * (k1.theta2 + 2 * k2.theta2 + 2 * k3.theta2 + k4.theta2),
    omega1: state.omega1 + (dt / 6) * (k1.omega1 + 2 * k2.omega1 + 2 * k3.omega1 + k4.omega1),
    omega2: state.omega2 + (dt / 6) * (k1.omega2 + 2 * k2.omega2 + 2 * k3.omega2 + k4.omega2),
  };
}

/**
 * Exact mechanical energies (K, U, E = K + U) referenced to the lowest hanging configuration (U = 0 at theta1 = theta2 = 0).
 */
export function computeDoublePendulumEnergy(
  state: DoublePendulumState,
  params: DoublePendulumParams
): DoublePendulumEnergy {
  const { theta1, theta2, omega1, omega2 } = state;
  const { m1, m2, L1, L2, g } = params;

  const v1x = L1 * omega1 * Math.cos(theta1);
  const v1y = L1 * omega1 * Math.sin(theta1);
  const v2x = v1x + L2 * omega2 * Math.cos(theta2);
  const v2y = v1y + L2 * omega2 * Math.sin(theta2);

  const v1Sq = v1x * v1x + v1y * v1y;
  const v2Sq = v2x * v2x + v2y * v2y;

  const kinetic = 0.5 * m1 * v1Sq + 0.5 * m2 * v2Sq;
  const potential =
    m1 * g * L1 * (1 - Math.cos(theta1)) +
    m2 * g * (L1 * (1 - Math.cos(theta1)) + L2 * (1 - Math.cos(theta2)));

  return {
    kinetic,
    potential,
    total: kinetic + potential,
    v1: Math.sqrt(v1Sq),
    v2: Math.sqrt(v2Sq),
  };
}

const RAW_DOUBLE_PENDULUM_HTML = `<!--
SIMULATION_METADATA
Title: Double Pendulum
Subject: Classical Mechanics
Topic: Coupled nonlinear oscillations and deterministic chaos
Difficulty: AP Physics / Undergraduate
Simulation Type: Interactive 3D Visualization

LEARNING_OBJECTIVES:
- Observe how two coupled rigid pendulums exhibit rich, non-periodic chaotic motion at high energy.
- Explore how initial release angles control the transition between gentle oscillation and chaotic tumbling.
- Verify conservation of total mechanical energy (E = K + U) as energy transfers rapidly between the upper and lower bobs.
- Explore how changing bob masses, rod lengths, and gravitational acceleration alter oscillation dynamics.

PHYSICAL_MODEL:
- Ideal planar double pendulum solved via exact Euler-Lagrange coupled differential equations.
- Massless rigid rods of lengths L1 and L2 with point-mass bobs m1 and m2 under uniform gravity g.
- Integrated with fixed-step 4th-order Runge-Kutta (RK4, dt = 1/240 s) for accurate energy conservation.
- Frictionless pivot point and negligible aerodynamic drag.

GOVERNING_EQUATIONS:
- L = T - V = 0.5*(m1+m2)*L1^2*w1^2 + 0.5*m2*L2^2*w2^2 + m2*L1*L2*w1*w2*cos(th1-th2) - V
- th1'' = [-g*(2m1+m2)*sin(th1) - m2*g*sin(th1-2*th2) - 2*sin(d)*m2*(w2^2*L2 + w1^2*L1*cos(d))] / [L1*(2m1+m2-m2*cos(2d))]
- th2'' = [2*sin(d)*(w1^2*L1*(m1+m2) + g*(m1+m2)*cos(th1) + w2^2*L2*m2*cos(d))] / [L2*(2m1+m2-m2*cos(2d))]
- E = K + U = const (with U = 0 at th1 = th2 = 0)

INTERACTIVE_PARAMETERS:
- Initial upper angle theta1 (degrees)
- Initial lower angle theta2 (degrees)
- Upper bob mass m1 (kg)
- Lower bob mass m2 (kg)
- Upper rod length L1 (m)
- Lower rod length L2 (m)
- Gravitational acceleration g (m/s^2)
- Simulation playback speed (multiplier)

VISUAL_ELEMENTS:
- Simple visible A-frame stand supporting a fixed central pivot point
- Articulated upper and lower metallic pendulum rods with mass-scaled spherical bobs
- Luminous gradient motion trail tracing the lower-bob trajectory
- Instantaneous 3D velocity vectors v1 and v2 on both bobs

SIMULATION_CONTROLS:
- Play / Pause
- Reset
- Clear Trail
- Speed adjustment (0.25x, 0.5x, 1x, 1.5x)
- Planetary gravity presets (Earth, Moon, Mars, Jupiter)
- Parameter adjustment sliders (angles, masses, lengths, gravity)
- Trail and Velocity Vectors visibility toggles

SIMULATION_STATE_SCHEMA:
- time: number (elapsed simulation time in seconds)
- running: boolean (whether RK4 integration is advancing)
- pendulum: { theta1, theta2, omega1, omega2 }
- parameters: { theta1Deg, theta2Deg, m1, m2, L1, L2, g, timeScale, showTrail, showVectors }
- controls: { showTrail, showVectors, timeScale }
- camera: { position: [x, y, z], target: [x, y, z] }

WALKTHROUGH_METADATA:
- Title: Guided Tour: 3D Double Pendulum
- Language: en-US
- Segments: 6 structured narration segments (Introduction, Playback & Speed, Initial Angles & Energy, Trail & Velocity Vectors, Masses & Lengths & Gravity, Conservation & Equations)
- Narration Engine: Native browser SpeechSynthesis API with synchronized captions, transcript, and background audio

WALKTHROUGH_TRANSCRIPT:
- Segment 1 (intro): Introduction to the coupled 3D double pendulum and nonlinear motion.
- Segment 2 (controls): Using Play, Pause, Reset, and slow-motion playback to inspect rapid whips.
- Segment 3 (angles): Adjusting initial release angles theta1 and theta2 to transition between gentle and chaotic regimes.
- Segment 4 (trail-vectors): Tracing the lower bob path with the motion trail and inspecting velocity vectors v1 and v2.
- Segment 5 (mass-length-gravity): Exploring how bob masses, arm lengths, and planetary gravity alter motion.
- Segment 6 (equations-energy): Verifying mechanical energy conservation E = K + U against the governing Lagrangian equations.

AGENT_GUIDANCE:
- Physical calculations are implemented strictly inside Section 3 (PHYSICS MODEL) using RK4 integration.
- Visual representation and Three.js transforms are implemented separately in Sections 5 and 7.
- Keep window.simulationAPI and window.WALKTHROUGH_CONFIG synchronized whenever controls or parameters change.
- Keep top-right viewport clear for #walkthrough-panel; stack telemetry & equations on top-left and parameter controls in #control-dock.
- Keep SI physical units consistent (kilograms, meters, seconds, m/s, m/s^2, degrees, Joules).
-->
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Double Pendulum — 3D Chaos &amp; Mechanics Simulation</title>
  <script type="importmap">
    {
      "imports": {
        "three": "https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js",
        "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/"
      }
    }
  </script>
  <style>
    :root {
      --bg-hud: rgba(15, 23, 42, 0.9);
      --border-hud: rgba(148, 163, 184, 0.24);
      --text-main: #f8fafc;
      --text-muted: #94a3b8;
      --accent: #38bdf8;
      --bob1-color: #eab308;
      --bob2-color: #38bdf8;
      --energy-k: #22c55e;
      --energy-u: #60a5fa;
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    html, body {
      width: 100%;
      height: 100%;
      overflow: hidden;
      background: #0b1120;
      color: var(--text-main);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      font-size: 13px;
      user-select: none;
    }

    #canvas-container {
      position: fixed;
      inset: 0;
      width: 100%;
      height: 100%;
    }

    .hud-panel {
      background: var(--bg-hud);
      border: 1px solid var(--border-hud);
      border-radius: 10px;
      box-shadow: 0 8px 24px rgba(2, 6, 23, 0.45);
    }

    #hud-left {
      position: fixed;
      top: 14px;
      left: 14px;
      width: 268px;
      display: flex;
      flex-direction: column;
      gap: 10px;
      z-index: 12;
      max-height: calc(100vh - 190px);
      overflow-y: auto;
    }

    #telemetry-panel {
      padding: 11px 13px;
    }

    .panel-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      margin-bottom: 8px;
      padding-bottom: 6px;
      border-bottom: 1px solid rgba(148, 163, 184, 0.16);
    }

    .panel-title {
      font-size: 12.5px;
      font-weight: 600;
      letter-spacing: -0.01em;
    }

    .panel-subtitle {
      font-size: 10.5px;
      color: var(--text-muted);
    }

    .telemetry-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 6px 10px;
      font-variant-numeric: tabular-nums;
    }

    .telemetry-band {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 6px 10px;
      margin-top: 7px;
      padding-top: 7px;
      border-top: 1px solid rgba(148, 163, 184, 0.14);
      font-variant-numeric: tabular-nums;
    }

    .metric-item {
      display: flex;
      flex-direction: column;
    }

    .metric-label {
      font-size: 10px;
      color: var(--text-muted);
    }

    .metric-value {
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      font-size: 11.5px;
      font-weight: 600;
      color: #f1f5f9;
    }

    .energy-bar-wrap {
      margin-top: 8px;
      padding-top: 7px;
      border-top: 1px solid rgba(148, 163, 184, 0.14);
    }

    .energy-bar-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-size: 10px;
      color: var(--text-muted);
      margin-bottom: 4px;
      font-variant-numeric: tabular-nums;
    }

    .energy-bar-track {
      height: 7px;
      width: 100%;
      background: rgba(30, 41, 59, 0.9);
      border-radius: 999px;
      overflow: hidden;
      display: flex;
    }

    .energy-bar-k {
      height: 100%;
      background: var(--energy-k);
      width: 0%;
    }

    .energy-bar-u {
      height: 100%;
      background: var(--energy-u);
      width: 100%;
    }

    .legend-row {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px 12px;
      margin-top: 8px;
      padding-top: 7px;
      border-top: 1px solid rgba(148, 163, 184, 0.16);
      font-size: 10.5px;
      color: var(--text-muted);
    }

    .legend-swatch {
      display: inline-flex;
      align-items: center;
      gap: 5px;
    }

    .swatch-bar {
      width: 10px;
      height: 3px;
      border-radius: 2px;
    }

    #equations-panel {
      padding: 10px 13px;
    }

    .eq-toggle-btn {
      background: transparent;
      border: 1px solid var(--border-hud);
      color: var(--text-muted);
      border-radius: 6px;
      padding: 2px 8px;
      font-size: 10.5px;
      cursor: pointer;
    }

    .eq-toggle-btn:hover {
      color: var(--text-main);
      border-color: rgba(148, 163, 184, 0.45);
    }

    .eq-list {
      display: flex;
      flex-direction: column;
      gap: 4px;
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      font-size: 10.5px;
      color: #cbd5e1;
    }

    .eq-line {
      padding: 4px 7px;
      background: rgba(30, 41, 59, 0.72);
      border-radius: 5px;
      line-height: 1.35;
    }

    .assumptions {
      margin-top: 7px;
      font-size: 10.5px;
      color: var(--text-muted);
    }

    #control-dock {
      position: fixed;
      bottom: 14px;
      left: 50%;
      transform: translateX(-50%);
      width: min(900px, calc(100vw - 28px));
      padding: 11px 15px;
      z-index: 15;
      transition: transform 0.2s cubic-bezier(0.16, 1, 0.3, 1);
    }

    #control-dock.collapsed {
      transform: translate(-50%, calc(100% + 20px));
    }

    #dock-restore-btn {
      position: fixed;
      bottom: 14px;
      left: 50%;
      transform: translateX(-50%);
      z-index: 14;
      display: none;
      padding: 6px 14px;
      background: var(--bg-hud);
      border: 1px solid var(--border-hud);
      color: var(--text-main);
      border-radius: 8px;
      font-size: 12px;
      cursor: pointer;
    }

    .dock-top-row {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      margin-bottom: 9px;
      padding-bottom: 9px;
      border-bottom: 1px solid rgba(148, 163, 184, 0.16);
    }

    .btn-group {
      display: flex;
      align-items: center;
      gap: 6px;
      flex-wrap: wrap;
    }

    button.ctrl-btn {
      background: rgba(30, 41, 59, 0.9);
      border: 1px solid rgba(148, 163, 184, 0.25);
      color: #f8fafc;
      border-radius: 6px;
      padding: 5px 10px;
      font-size: 11.5px;
      font-weight: 500;
      cursor: pointer;
      white-space: nowrap;
    }

    button.ctrl-btn:hover {
      background: rgba(51, 65, 85, 0.95);
    }

    button.ctrl-btn.primary {
      background: #0284c7;
      border-color: #0ea5e9;
      color: #ffffff;
    }

    button.ctrl-btn.primary:hover {
      background: #0369a1;
    }

    button.ctrl-btn.active {
      background: rgba(2, 132, 199, 0.28);
      border-color: #38bdf8;
      color: #e0f2fe;
    }

    .toggle-group {
      display: flex;
      align-items: center;
      gap: 12px;
      font-size: 11.5px;
      color: #cbd5e1;
      flex-wrap: wrap;
    }

    .toggle-group label {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      cursor: pointer;
      white-space: nowrap;
    }

    .sliders-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(116px, 1fr));
      gap: 9px 12px;
    }

    .control-group {
      display: flex;
      flex-direction: column;
      gap: 3px;
      padding: 2px;
      border-radius: 6px;
    }

    .slider-head {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      font-size: 11px;
      color: #cbd5e1;
      font-variant-numeric: tabular-nums;
      gap: 4px;
    }

    .slider-val {
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      color: #38bdf8;
      font-weight: 600;
    }

    input[type="range"] {
      width: 100%;
      accent-color: #38bdf8;
      cursor: pointer;
    }

    .preset-row {
      display: flex;
      gap: 4px;
      margin-top: 2px;
    }

    .preset-btn {
      flex: 1;
      font-size: 10px;
      padding: 2px 3px;
      background: rgba(30, 41, 59, 0.85);
      border: 1px solid rgba(148, 163, 184, 0.22);
      color: #cbd5e1;
      border-radius: 4px;
      cursor: pointer;
    }

    .preset-btn:hover {
      border-color: #38bdf8;
      color: #ffffff;
    }

    @media (max-width: 720px) {
      #hud-left {
        width: calc(100vw - 24px);
        max-height: 28vh;
      }
      #equations-panel {
        display: none;
      }
    }
  </style>
</head>
<body>
  <div id="canvas-container"></div>

  <div id="hud-left">
    <section id="telemetry-panel" class="hud-panel" aria-label="Double Pendulum Telemetry">
      <div class="panel-header">
        <div>
          <div class="panel-title">Double Pendulum</div>
          <div class="panel-subtitle">Coupled Nonlinear Dynamics · RK4</div>
        </div>
        <span id="status-text" class="panel-subtitle">Running</span>
      </div>

      <div class="telemetry-grid">
        <div class="metric-item">
          <span class="metric-label">Elapsed Time t</span>
          <span id="val-time" class="metric-value">0.00 s</span>
        </div>
        <div class="metric-item">
          <span class="metric-label">Total Energy E</span>
          <span id="val-te" class="metric-value">0.00 J</span>
        </div>
        <div class="metric-item">
          <span class="metric-label">Upper Angle θ₁</span>
          <span id="val-th1" class="metric-value">125.0°</span>
        </div>
        <div class="metric-item">
          <span class="metric-label">Lower Angle θ₂</span>
          <span id="val-th2" class="metric-value">140.0°</span>
        </div>
        <div class="metric-item">
          <span class="metric-label">Speed |v₁|</span>
          <span id="val-v1" class="metric-value">0.00 m/s</span>
        </div>
        <div class="metric-item">
          <span class="metric-label">Speed |v₂|</span>
          <span id="val-v2" class="metric-value">0.00 m/s</span>
        </div>
      </div>

      <div class="telemetry-band">
        <div class="metric-item">
          <span class="metric-label">Kinetic Energy K</span>
          <span id="val-ke" class="metric-value">0.00 J</span>
        </div>
        <div class="metric-item">
          <span class="metric-label">Potential Energy U</span>
          <span id="val-pe" class="metric-value">0.00 J</span>
        </div>
      </div>

      <div class="energy-bar-wrap">
        <div class="energy-bar-head">
          <span>K / U Energy Exchange</span>
          <span id="val-ku-ratio">0% K · 100% U</span>
        </div>
        <div class="energy-bar-track" aria-hidden="true">
          <div id="bar-ke" class="energy-bar-k"></div>
          <div id="bar-pe" class="energy-bar-u"></div>
        </div>
      </div>

      <div class="legend-row">
        <span class="legend-swatch"><span class="swatch-bar" style="background: var(--bob1-color);"></span>Upper Bob (m₁)</span>
        <span class="legend-swatch"><span class="swatch-bar" style="background: var(--bob2-color);"></span>Lower Bob (m₂)</span>
      </div>
    </section>

    <section id="equations-panel" class="hud-panel" aria-label="Governing Equations">
      <div class="panel-header">
        <span class="panel-title">Governing Equations</span>
        <button id="btn-toggle-eq" class="eq-toggle-btn" type="button">Hide</button>
      </div>
      <div id="eq-body">
        <div class="eq-list">
          <div class="eq-line">L = T − V  (Euler-Lagrange)</div>
          <div class="eq-line">x₁ = L₁ sinθ₁,  y₁ = −L₁ cosθ₁</div>
          <div class="eq-line">x₂ = x₁ + L₂ sinθ₂,  y₂ = y₁ − L₂ cosθ₂</div>
          <div class="eq-line">E = ½m₁v₁² + ½m₂v₂² + U(θ₁, θ₂) = const</div>
        </div>
        <p class="assumptions">Ideal rigid massless rods, frictionless pivot, RK4 fixed-step (240 Hz).</p>
      </div>
    </section>
  </div>

  <button id="dock-restore-btn" type="button">Show Controls</button>

  <section id="control-dock" class="hud-panel" aria-label="Simulation Controls">
    <div class="dock-top-row">
      <div id="playback-controls" class="btn-group">
        <button id="btn-play-pause" class="ctrl-btn primary" type="button">Pause</button>
        <button id="btn-reset" class="ctrl-btn" type="button">Reset</button>
        <button id="btn-clear-trail" class="ctrl-btn" type="button">Clear Trail</button>
        <button id="btn-collapse-dock" class="ctrl-btn" type="button">Hide Controls</button>
      </div>

      <div id="speed-controls" class="btn-group" aria-label="Playback Speed">
        <button class="ctrl-btn speed-btn" data-speed="0.25" type="button">0.25×</button>
        <button class="ctrl-btn speed-btn" data-speed="0.5" type="button">0.5×</button>
        <button class="ctrl-btn speed-btn active" data-speed="1" type="button">1×</button>
        <button class="ctrl-btn speed-btn" data-speed="1.5" type="button">1.5×</button>
      </div>

      <div class="toggle-group">
        <label id="trail-control"><input id="chk-trail" type="checkbox" checked /> Motion Trail</label>
        <label id="vectors-control"><input id="chk-vectors" type="checkbox" checked /> Velocity Vectors</label>
      </div>
    </div>

    <div class="sliders-grid">
      <div id="theta1-control" class="control-group">
        <div class="slider-head">
          <label for="slider-th1">Initial θ₁</label>
          <span id="lbl-th1" class="slider-val">125°</span>
        </div>
        <input id="slider-th1" data-param="theta1Deg" type="range" min="-175" max="175" step="1" value="125" />
      </div>

      <div id="theta2-control" class="control-group">
        <div class="slider-head">
          <label for="slider-th2">Initial θ₂</label>
          <span id="lbl-th2" class="slider-val">140°</span>
        </div>
        <input id="slider-th2" data-param="theta2Deg" type="range" min="-175" max="175" step="1" value="140" />
      </div>

      <div id="mass1-control" class="control-group">
        <div class="slider-head">
          <label for="slider-m1">Mass m₁</label>
          <span id="lbl-m1" class="slider-val">1.5 kg</span>
        </div>
        <input id="slider-m1" data-param="m1" type="range" min="0.3" max="5.0" step="0.1" value="1.5" />
      </div>

      <div id="mass2-control" class="control-group">
        <div class="slider-head">
          <label for="slider-m2">Mass m₂</label>
          <span id="lbl-m2" class="slider-val">1.2 kg</span>
        </div>
        <input id="slider-m2" data-param="m2" type="range" min="0.3" max="5.0" step="0.1" value="1.2" />
      </div>

      <div id="length1-control" class="control-group">
        <div class="slider-head">
          <label for="slider-l1">Length L₁</label>
          <span id="lbl-l1" class="slider-val">2.0 m</span>
        </div>
        <input id="slider-l1" data-param="L1" type="range" min="0.8" max="3.0" step="0.1" value="2.0" />
      </div>

      <div id="length2-control" class="control-group">
        <div class="slider-head">
          <label for="slider-l2">Length L₂</label>
          <span id="lbl-l2" class="slider-val">1.0 m</span>
        </div>
        <input id="slider-l2" data-param="L2" type="range" min="0.8" max="3.0" step="0.1" value="1.0" />
      </div>

      <div id="gravity-control" class="control-group">
        <div class="slider-head">
          <label for="slider-g">Gravity g</label>
          <span id="lbl-g" class="slider-val">9.81 m/s²</span>
        </div>
        <input id="slider-g" data-param="g" type="range" min="1.0" max="24.8" step="0.01" value="9.81" />
        <div class="preset-row">
          <button class="preset-btn" data-g="9.81" type="button">Earth</button>
          <button class="preset-btn" data-g="1.62" type="button">Moon</button>
          <button class="preset-btn" data-g="3.71" type="button">Mars</button>
          <button class="preset-btn" data-g="24.79" type="button">Jup</button>
        </div>
      </div>
    </div>
  </section>

  <script type="module">
    import * as THREE from 'three';
    import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
    import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

    // =========================================================================
    // 1. SIMULATION CONFIGURATION
    // =========================================================================
    const CONFIG = {
      backgroundColor: 0x0b1120,
      fogDensity: 0.018,
      pivotY: 5.5,
      fixedDt: 1 / 240,
      maxFrameDt: 0.05,
      maxTrailPoints: 480,
      defaultCameraPos: [0, 4.3, 12.0],
      defaultCameraTarget: [0, 3.6, 0],
    };

    // =========================================================================
    // 2. PHYSICAL CONSTANTS AND PARAMETERS
    // =========================================================================
    const params = {
      theta1Deg: 125,
      theta2Deg: 140,
      m1: 1.5,
      m2: 1.2,
      L1: 2.0,
      L2: 1.0,
      g: 9.81,
      timeScale: 1.0,
      showTrail: true,
      showVectors: true,
    };

    const DEG2RAD = Math.PI / 180;
    const RAD2DEG = 180 / Math.PI;

    // =========================================================================
    // 3. PHYSICS MODEL
    // =========================================================================
    function computeDerivatives(st, p) {
      const delta = st.theta1 - st.theta2;
      const sinD = Math.sin(delta);
      const cosD = Math.cos(delta);
      const denom = Math.max(1e-6, 2 * p.m1 + p.m2 - p.m2 * Math.cos(2 * delta));

      const alpha1 =
        (-p.g * (2 * p.m1 + p.m2) * Math.sin(st.theta1) -
          p.m2 * p.g * Math.sin(st.theta1 - 2 * st.theta2) -
          2 * sinD * p.m2 * (st.omega2 * st.omega2 * p.L2 + st.omega1 * st.omega1 * p.L1 * cosD)) /
        (p.L1 * denom);

      const alpha2 =
        (2 *
          sinD *
          (st.omega1 * st.omega1 * p.L1 * (p.m1 + p.m2) +
            p.g * (p.m1 + p.m2) * Math.cos(st.theta1) +
            st.omega2 * st.omega2 * p.L2 * p.m2 * cosD)) /
        (p.L2 * denom);

      return {
        theta1: st.omega1,
        theta2: st.omega2,
        omega1: alpha1,
        omega2: alpha2,
      };
    }

    function stepRK4(st, p, dt) {
      const k1 = computeDerivatives(st, p);
      const s2 = {
        theta1: st.theta1 + 0.5 * dt * k1.theta1,
        theta2: st.theta2 + 0.5 * dt * k1.theta2,
        omega1: st.omega1 + 0.5 * dt * k1.omega1,
        omega2: st.omega2 + 0.5 * dt * k1.omega2,
      };
      const k2 = computeDerivatives(s2, p);
      const s3 = {
        theta1: st.theta1 + 0.5 * dt * k2.theta1,
        theta2: st.theta2 + 0.5 * dt * k2.theta2,
        omega1: st.omega1 + 0.5 * dt * k2.omega1,
        omega2: st.omega2 + 0.5 * dt * k2.omega2,
      };
      const k3 = computeDerivatives(s3, p);
      const s4 = {
        theta1: st.theta1 + dt * k3.theta1,
        theta2: st.theta2 + dt * k3.theta2,
        omega1: st.omega1 + dt * k3.omega1,
        omega2: st.omega2 + dt * k3.omega2,
      };
      const k4 = computeDerivatives(s4, p);

      st.theta1 += (dt / 6) * (k1.theta1 + 2 * k2.theta1 + 2 * k3.theta1 + k4.theta1);
      st.theta2 += (dt / 6) * (k1.theta2 + 2 * k2.theta2 + 2 * k3.theta2 + k4.theta2);
      st.omega1 += (dt / 6) * (k1.omega1 + 2 * k2.omega1 + 2 * k3.omega1 + k4.omega1);
      st.omega2 += (dt / 6) * (k1.omega2 + 2 * k2.omega2 + 2 * k3.omega2 + k4.omega2);
    }

    function computeKinematicsAndEnergy(st, p) {
      const x1 = p.L1 * Math.sin(st.theta1);
      const y1 = CONFIG.pivotY - p.L1 * Math.cos(st.theta1);
      const x2 = x1 + p.L2 * Math.sin(st.theta2);
      const y2 = y1 - p.L2 * Math.cos(st.theta2);

      const v1x = p.L1 * st.omega1 * Math.cos(st.theta1);
      const v1y = p.L1 * st.omega1 * Math.sin(st.theta1);
      const v2x = v1x + p.L2 * st.omega2 * Math.cos(st.theta2);
      const v2y = v1y + p.L2 * st.omega2 * Math.sin(st.theta2);

      const v1Sq = v1x * v1x + v1y * v1y;
      const v2Sq = v2x * v2x + v2y * v2y;
      const ke = 0.5 * p.m1 * v1Sq + 0.5 * p.m2 * v2Sq;
      const pe =
        p.m1 * p.g * p.L1 * (1 - Math.cos(st.theta1)) +
        p.m2 * p.g * (p.L1 * (1 - Math.cos(st.theta1)) + p.L2 * (1 - Math.cos(st.theta2)));

      return {
        x1, y1, x2, y2,
        v1x, v1y, v2x, v2y,
        v1: Math.sqrt(v1Sq),
        v2: Math.sqrt(v2Sq),
        ke,
        pe,
        total: ke + pe,
      };
    }

    function wrapAngleDeg(rad) {
      let deg = ((rad * RAD2DEG) % 360 + 540) % 360 - 180;
      if (Object.is(deg, -0)) deg = 0;
      return deg;
    }

    // =========================================================================
    // 4. SCENE INITIALIZATION
    // =========================================================================
    const container = document.getElementById('canvas-container');
    const isSoftwareGl = (() => {
      try {
        const probeCanvas = document.createElement('canvas');
        const gl = probeCanvas.getContext('webgl2') || probeCanvas.getContext('webgl');
        if (!gl) return true;
        const ext = gl.getExtension('WEBGL_debug_renderer_info');
        const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
        const gpu = String(gl.getParameter(param) || '');
        gl.getExtension('WEBGL_lose_context')?.loseContext();
        return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
      } catch {
        return false;
      }
    })();

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(CONFIG.backgroundColor);
    scene.fog = new THREE.FogExp2(CONFIG.backgroundColor, CONFIG.fogDensity);

    const camera = new THREE.PerspectiveCamera(44, window.innerWidth / window.innerHeight, 0.1, 150);
    camera.position.set(...CONFIG.defaultCameraPos);

    const renderer = new THREE.WebGLRenderer({
      antialias: !isSoftwareGl,
      powerPreference: 'high-performance',
    });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);

    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    scene.environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
    pmremGenerator.dispose();

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(...CONFIG.defaultCameraTarget);
    controls.enableDamping = !isSoftwareGl;
    controls.dampingFactor = 0.06;
    controls.minDistance = 4;
    controls.maxDistance = 30;
    controls.maxPolarAngle = Math.PI * 0.495;
    controls.update();

    // Studio 3-point lighting
    const hemiLight = new THREE.HemisphereLight(0xcbd5e1, 0x1e293b, 0.85);
    scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight(0xfff1dc, 2.2);
    keyLight.position.set(8, 14, 11);
    keyLight.castShadow = !isSoftwareGl;
    keyLight.shadow.mapSize.set(1024, 1024);
    keyLight.shadow.camera.near = 2;
    keyLight.shadow.camera.far = 36;
    keyLight.shadow.camera.left = -9;
    keyLight.shadow.camera.right = 9;
    keyLight.shadow.camera.top = 11;
    keyLight.shadow.camera.bottom = -4;
    keyLight.shadow.bias = -0.0005;
    keyLight.shadow.normalBias = 0.02;
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0x38bdf8, 0.9);
    rimLight.position.set(-10, 8, -9);
    scene.add(rimLight);

    // =========================================================================
    // 5. VISUAL OBJECT CREATION
    // =========================================================================
    const disposables = { geometries: [], materials: [], textures: [] };
    function trackGeo(g) { disposables.geometries.push(g); return g; }
    function trackMat(m) { disposables.materials.push(m); return m; }

    // Subtle ground reference plane & grid
    const floorMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x0f172a,
        roughness: 0.88,
        metalness: 0.08,
      })
    );
    const floor = new THREE.Mesh(trackGeo(new THREE.PlaneGeometry(80, 80)), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);

    const grid = new THREE.GridHelper(36, 36, 0x334155, 0x1e293b);
    grid.position.y = 0.02;
    grid.material.opacity = 0.4;
    grid.material.transparent = true;
    scene.add(grid);

    // Clean PBR materials
    const pivotMat = trackMat(
      new THREE.MeshPhysicalMaterial({ color: 0xe2e8f0, roughness: 0.2, metalness: 0.92, clearcoat: 0.35 })
    );
    const rodMat = trackMat(
      new THREE.MeshPhysicalMaterial({ color: 0xcbd5e1, roughness: 0.24, metalness: 0.85 })
    );
    const bob1Mat = trackMat(
      new THREE.MeshPhysicalMaterial({ color: 0xeab308, roughness: 0.2, metalness: 0.88, clearcoat: 0.45 })
    );
    const bob2Mat = trackMat(
      new THREE.MeshPhysicalMaterial({ color: 0x0ea5e9, roughness: 0.18, metalness: 0.85, clearcoat: 0.65 })
    );

    const aFrameMat = trackMat(
      new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.44, metalness: 0.62 })
    );

    // Helper to build an exact point-to-point cylindrical strut
    const _upAxis = new THREE.Vector3(0, 1, 0);
    function createStrut(pA, pB, radius, material) {
      const diff = new THREE.Vector3().subVectors(pB, pA);
      const len = diff.length();
      const mesh = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(radius, radius, len, 16)), material);
      mesh.position.addVectors(pA, pB).multiplyScalar(0.5);
      mesh.quaternion.setFromUnitVectors(_upAxis, diff.normalize());
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      return mesh;
    }

    // Simple visible A-frame stand supporting the central pivot point
    const aFrameGroup = new THREE.Group();
    const frameZ = -0.34;
    const footHalfSpan = 1.9;
    const apexPos = new THREE.Vector3(0, CONFIG.pivotY, frameZ);
    const leftFootPos = new THREE.Vector3(-footHalfSpan, 0.05, frameZ);
    const rightFootPos = new THREE.Vector3(footHalfSpan, 0.05, frameZ);

    // Two slanted A-frame legs meeting cleanly at the apex
    aFrameGroup.add(createStrut(leftFootPos, apexPos, 0.068, aFrameMat));
    aFrameGroup.add(createStrut(rightFootPos, apexPos, 0.068, aFrameMat));

    // Horizontal A-frame crossbar
    const crossT = 0.36;
    const leftCross = new THREE.Vector3().lerpVectors(leftFootPos, apexPos, crossT);
    const rightCross = new THREE.Vector3().lerpVectors(rightFootPos, apexPos, crossT);
    aFrameGroup.add(createStrut(leftCross, rightCross, 0.052, aFrameMat));

    // Grounded stabilizer feet resting flush on y = 0
    const footGeo = trackGeo(new THREE.BoxGeometry(0.24, 0.1, 1.1));
    [-footHalfSpan, footHalfSpan].forEach((fx) => {
      const foot = new THREE.Mesh(footGeo, aFrameMat);
      foot.position.set(fx, 0.05, frameZ);
      foot.castShadow = true;
      foot.receiveShadow = true;
      aFrameGroup.add(foot);
    });

    // Small apex joint cap & short horizontal pin attaching the simple pivot point to the A-frame
    const apexJoint = new THREE.Mesh(trackGeo(new THREE.SphereGeometry(0.095, 20, 16)), aFrameMat);
    apexJoint.position.copy(apexPos);
    aFrameGroup.add(apexJoint);

    const pivotCenterPos = new THREE.Vector3(0, CONFIG.pivotY, 0);
    aFrameGroup.add(createStrut(apexPos, pivotCenterPos, 0.048, pivotMat));

    scene.add(aFrameGroup);

    // Simple fixed pivot point & subtle vertical reference plumb line
    const pivotPoint = new THREE.Mesh(trackGeo(new THREE.SphereGeometry(0.11, 24, 18)), pivotMat);
    pivotPoint.position.copy(pivotCenterPos);
    pivotPoint.castShadow = true;
    scene.add(pivotPoint);

    const plumbGeo = trackGeo(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, CONFIG.pivotY, -0.02),
        new THREE.Vector3(0, 0.2, -0.02),
      ])
    );
    const plumbMat = trackMat(
      new THREE.LineDashedMaterial({
        color: 0x475569,
        dashSize: 0.18,
        gapSize: 0.14,
        transparent: true,
        opacity: 0.45,
      })
    );
    const plumbLine = new THREE.Line(plumbGeo, plumbMat);
    plumbLine.computeLineDistances();
    scene.add(plumbLine);

    // Double pendulum assembly (upper arm at z = 0, lower arm slightly forward at z = 0.08 to avoid Z-clipping)
    const z1 = 0.0;
    const z2 = 0.08;

    const arm1Pivot = new THREE.Group();
    arm1Pivot.position.set(0, CONFIG.pivotY, z1);

    const rod1Mesh = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.036, 0.036, 1, 16)), rodMat);
    rod1Mesh.castShadow = true;
    arm1Pivot.add(rod1Mesh);

    const bob1Group = new THREE.Group();
    const bob1Mesh = new THREE.Mesh(trackGeo(new THREE.SphereGeometry(0.24, 28, 22)), bob1Mat);
    bob1Mesh.castShadow = true;
    bob1Group.add(bob1Mesh);
    arm1Pivot.add(bob1Group);
    scene.add(arm1Pivot);

    const arm2Pivot = new THREE.Group();
    arm2Pivot.position.set(0, CONFIG.pivotY, z2);

    const rod2Mesh = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.032, 0.032, 1, 16)), rodMat);
    rod2Mesh.castShadow = true;
    arm2Pivot.add(rod2Mesh);

    const bob2Group = new THREE.Group();
    const bob2Mesh = new THREE.Mesh(trackGeo(new THREE.SphereGeometry(0.24, 28, 22)), bob2Mat);
    bob2Mesh.castShadow = true;
    bob2Group.add(bob2Mesh);
    arm2Pivot.add(bob2Group);
    scene.add(arm2Pivot);

    // Pre-allocated Luminous Gradient Trail for lower bob (zero GC per frame)
    const trailPositions = new Float32Array(CONFIG.maxTrailPoints * 3);
    const trailColors = new Float32Array(CONFIG.maxTrailPoints * 3);
    const trailGeometry = trackGeo(new THREE.BufferGeometry());
    trailGeometry.setAttribute('position', new THREE.BufferAttribute(trailPositions, 3));
    trailGeometry.setAttribute('color', new THREE.BufferAttribute(trailColors, 3));
    trailGeometry.setDrawRange(0, 0);

    const trailMaterial = trackMat(
      new THREE.LineBasicMaterial({
        vertexColors: true,
        transparent: true,
        opacity: 0.92,
      })
    );
    const trailLine = new THREE.Line(trailGeometry, trailMaterial);
    trailLine.frustumCulled = false;
    scene.add(trailLine);

    const trailPoints = [];
    const trailHeadColor = new THREE.Color(0x38bdf8);
    const trailTailColor = new THREE.Color(0x0f172a);

    // Reusable velocity ArrowHelpers
    const _v1Dir = new THREE.Vector3(1, 0, 0);
    const _v2Dir = new THREE.Vector3(1, 0, 0);
    const vel1Arrow = new THREE.ArrowHelper(_v1Dir, new THREE.Vector3(), 1, 0x22c55e, 0.24, 0.14);
    const vel2Arrow = new THREE.ArrowHelper(_v2Dir, new THREE.Vector3(), 1, 0x38bdf8, 0.24, 0.14);
    scene.add(vel1Arrow);
    scene.add(vel2Arrow);

    // =========================================================================
    // 6. SIMULATION STATE
    // =========================================================================
    const simState = {
      time: 0,
      running: true,
      accumulator: 0,
      pendulum: {
        theta1: params.theta1Deg * DEG2RAD,
        theta2: params.theta2Deg * DEG2RAD,
        omega1: 0,
        omega2: 0,
      },
    };

    function clearTrail() {
      trailPoints.length = 0;
      trailGeometry.setDrawRange(0, 0);
    }

    function pushTrailPoint(x, y, z) {
      trailPoints.push(x, y, z);
      const maxFloats = CONFIG.maxTrailPoints * 3;
      if (trailPoints.length > maxFloats) {
        trailPoints.splice(0, trailPoints.length - maxFloats);
      }
      const count = trailPoints.length / 3;
      const posAttr = trailGeometry.attributes.position;
      const colAttr = trailGeometry.attributes.color;
      for (let i = 0; i < count; i++) {
        const i3 = i * 3;
        trailPositions[i3] = trailPoints[i3];
        trailPositions[i3 + 1] = trailPoints[i3 + 1];
        trailPositions[i3 + 2] = trailPoints[i3 + 2];

        const alpha = count > 1 ? i / (count - 1) : 1;
        const fade = alpha * alpha;
        trailColors[i3] = THREE.MathUtils.lerp(trailTailColor.r, trailHeadColor.r, fade);
        trailColors[i3 + 1] = THREE.MathUtils.lerp(trailTailColor.g, trailHeadColor.g, fade);
        trailColors[i3 + 2] = THREE.MathUtils.lerp(trailTailColor.b, trailHeadColor.b, fade);
      }
      posAttr.needsUpdate = true;
      colAttr.needsUpdate = true;
      trailGeometry.setDrawRange(0, count);
    }

    // =========================================================================
    // 7. ANIMATION AND PHYSICS UPDATE
    // =========================================================================
    const dom = {
      statusText: document.getElementById('status-text'),
      valTime: document.getElementById('val-time'),
      valTh1: document.getElementById('val-th1'),
      valTh2: document.getElementById('val-th2'),
      valV1: document.getElementById('val-v1'),
      valV2: document.getElementById('val-v2'),
      valKe: document.getElementById('val-ke'),
      valPe: document.getElementById('val-pe'),
      valTe: document.getElementById('val-te'),
      valKuRatio: document.getElementById('val-ku-ratio'),
      barKe: document.getElementById('bar-ke'),
      barPe: document.getElementById('bar-pe'),
      btnPlayPause: document.getElementById('btn-play-pause'),
      sliderTh1: document.getElementById('slider-th1'),
      sliderTh2: document.getElementById('slider-th2'),
      sliderM1: document.getElementById('slider-m1'),
      sliderM2: document.getElementById('slider-m2'),
      sliderL1: document.getElementById('slider-l1'),
      sliderL2: document.getElementById('slider-l2'),
      sliderG: document.getElementById('slider-g'),
      lblTh1: document.getElementById('lbl-th1'),
      lblTh2: document.getElementById('lbl-th2'),
      lblM1: document.getElementById('lbl-m1'),
      lblM2: document.getElementById('lbl-m2'),
      lblL1: document.getElementById('lbl-l1'),
      lblL2: document.getElementById('lbl-l2'),
      lblG: document.getElementById('lbl-g'),
      chkTrail: document.getElementById('chk-trail'),
      chkVectors: document.getElementById('chk-vectors'),
    };

    function updateTelemetry(kin) {
      dom.valTime.textContent = simState.time.toFixed(2) + ' s';
      dom.valTh1.textContent = wrapAngleDeg(simState.pendulum.theta1).toFixed(1) + '°';
      dom.valTh2.textContent = wrapAngleDeg(simState.pendulum.theta2).toFixed(1) + '°';
      dom.valV1.textContent = kin.v1.toFixed(2) + ' m/s';
      dom.valV2.textContent = kin.v2.toFixed(2) + ' m/s';
      dom.valKe.textContent = kin.ke.toFixed(2) + ' J';
      dom.valPe.textContent = kin.pe.toFixed(2) + ' J';
      dom.valTe.textContent = kin.total.toFixed(2) + ' J';

      const kPct = kin.total > 1e-4 ? Math.min(100, Math.max(0, (kin.ke / kin.total) * 100)) : 0;
      const uPct = 100 - kPct;
      dom.barKe.style.width = kPct.toFixed(1) + '%';
      dom.barPe.style.width = uPct.toFixed(1) + '%';
      dom.valKuRatio.textContent = Math.round(kPct) + '% K · ' + Math.round(uPct) + '% U';
      dom.statusText.textContent = simState.running ? 'Running' : 'Paused';
    }

    function updateVisualization(appendTrail) {
      const st = simState.pendulum;
      const m1Scale = Math.cbrt(params.m1 / 1.5);
      const m2Scale = Math.cbrt(params.m2 / 1.2);

      rod1Mesh.scale.set(1, params.L1, 1);
      rod1Mesh.position.set(0, -params.L1 / 2, 0);
      bob1Group.position.set(0, -params.L1, 0);
      bob1Group.scale.setScalar(m1Scale);
      arm1Pivot.rotation.z = st.theta1;

      const kin = computeKinematicsAndEnergy(st, params);

      arm2Pivot.position.set(kin.x1, kin.y1, z2);
      rod2Mesh.scale.set(1, params.L2, 1);
      rod2Mesh.position.set(0, -params.L2 / 2, 0);
      bob2Group.position.set(0, -params.L2, 0);
      bob2Group.scale.setScalar(m2Scale);
      arm2Pivot.rotation.z = st.theta2;

      if (appendTrail) {
        pushTrailPoint(kin.x2, kin.y2, z2);
      }

      trailLine.visible = params.showTrail;

      const showVec = params.showVectors;
      if (showVec && kin.v1 > 0.08) {
        vel1Arrow.visible = true;
        vel1Arrow.position.set(kin.x1, kin.y1, z1 + 0.06);
        _v1Dir.set(kin.v1x, kin.v1y, 0).normalize();
        vel1Arrow.setDirection(_v1Dir);
        const len1 = Math.min(2.4, kin.v1 * 0.22);
        vel1Arrow.setLength(len1, Math.min(0.28, len1 * 0.35), 0.14);
      } else {
        vel1Arrow.visible = false;
      }

      if (showVec && kin.v2 > 0.08) {
        vel2Arrow.visible = true;
        vel2Arrow.position.set(kin.x2, kin.y2, z2 + 0.06);
        _v2Dir.set(kin.v2x, kin.v2y, 0).normalize();
        vel2Arrow.setDirection(_v2Dir);
        const len2 = Math.min(2.8, kin.v2 * 0.2);
        vel2Arrow.setLength(len2, Math.min(0.3, len2 * 0.35), 0.14);
      } else {
        vel2Arrow.visible = false;
      }

      updateTelemetry(kin);
    }

    function updatePhysics(frameDt) {
      if (!simState.running) return;
      const scaledDt = Math.min(frameDt, CONFIG.maxFrameDt) * params.timeScale;
      simState.accumulator += scaledDt;

      let steps = 0;
      const maxSteps = 24;
      while (simState.accumulator >= CONFIG.fixedDt && steps < maxSteps) {
        stepRK4(simState.pendulum, params, CONFIG.fixedDt);
        simState.time += CONFIG.fixedDt;
        simState.accumulator -= CONFIG.fixedDt;
        steps++;
      }
      if (steps > 0) {
        updateVisualization(true);
      }
    }

    let animFrameId = 0;
    let lastWallMs = performance.now();

    function afterDraw(cb) {
      const gl = renderer.getContext();
      if (typeof gl.fenceSync === 'function') {
        const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
        gl.flush();
        const poll = () => {
          const status = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
          if (status === gl.UNSIGNALED) {
            animFrameId = window.setTimeout(poll, 5);
          } else {
            if (sync) gl.deleteSync(sync);
            animFrameId = window.setTimeout(cb, 80);
          }
        };
        animFrameId = window.setTimeout(poll, 5);
      } else {
        animFrameId = window.setTimeout(cb, 80);
      }
    }

    function animate() {
      const now = performance.now();
      const dt = Math.min(0.1, Math.max(0, (now - lastWallMs) / 1000));
      lastWallMs = now;

      updatePhysics(dt);
      controls.update();
      renderer.render(scene, camera);

      if (isSoftwareGl) {
        afterDraw(animate);
      } else {
        animFrameId = requestAnimationFrame(animate);
      }
    }

    // =========================================================================
    // 8. USER INTERACTION
    // =========================================================================
    function onWindowResize() {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    }
    window.addEventListener('resize', onWindowResize);

    // =========================================================================
    // 9. UI CONTROLS
    // =========================================================================
    function syncControlLabels() {
      dom.sliderTh1.value = String(params.theta1Deg);
      dom.sliderTh2.value = String(params.theta2Deg);
      dom.sliderM1.value = String(params.m1);
      dom.sliderM2.value = String(params.m2);
      dom.sliderL1.value = String(params.L1);
      dom.sliderL2.value = String(params.L2);
      dom.sliderG.value = String(params.g);

      dom.lblTh1.textContent = Math.round(params.theta1Deg) + '°';
      dom.lblTh2.textContent = Math.round(params.theta2Deg) + '°';
      dom.lblM1.textContent = params.m1.toFixed(1) + ' kg';
      dom.lblM2.textContent = params.m2.toFixed(1) + ' kg';
      dom.lblL1.textContent = params.L1.toFixed(1) + ' m';
      dom.lblL2.textContent = params.L2.toFixed(1) + ' m';
      dom.lblG.textContent = params.g.toFixed(2) + ' m/s²';

      dom.chkTrail.checked = Boolean(params.showTrail);
      dom.chkVectors.checked = Boolean(params.showVectors);
      dom.btnPlayPause.textContent = simState.running ? 'Pause' : 'Play';

      document.querySelectorAll('.speed-btn').forEach((btn) => {
        const spd = parseFloat(btn.getAttribute('data-speed') || '1');
        btn.classList.toggle('active', Math.abs(spd - params.timeScale) < 0.01);
      });
    }

    function setSimulationParameters(partial, shouldReset = false) {
      Object.assign(params, partial);
      syncControlLabels();
      if (shouldReset) {
        resetSimulation(simState.running);
      } else {
        updateVisualization(false);
      }
    }

    dom.btnPlayPause.addEventListener('click', () => {
      simState.running = !simState.running;
      lastWallMs = performance.now();
      syncControlLabels();
      updateVisualization(false);
    });

    document.getElementById('btn-reset').addEventListener('click', () => {
      resetSimulation(true);
    });

    document.getElementById('btn-clear-trail').addEventListener('click', () => {
      clearTrail();
    });

    const dockEl = document.getElementById('control-dock');
    const restoreDockBtn = document.getElementById('dock-restore-btn');
    document.getElementById('btn-collapse-dock').addEventListener('click', () => {
      dockEl.classList.add('collapsed');
      restoreDockBtn.style.display = 'block';
    });
    restoreDockBtn.addEventListener('click', () => {
      dockEl.classList.remove('collapsed');
      restoreDockBtn.style.display = 'none';
    });

    const eqBody = document.getElementById('eq-body');
    const eqToggleBtn = document.getElementById('btn-toggle-eq');
    eqToggleBtn.addEventListener('click', () => {
      const hidden = eqBody.style.display === 'none';
      eqBody.style.display = hidden ? 'block' : 'none';
      eqToggleBtn.textContent = hidden ? 'Hide' : 'Show';
    });

    document.querySelectorAll('.speed-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const spd = parseFloat(btn.getAttribute('data-speed') || '1');
        setSimulationParameters({ timeScale: spd }, false);
      });
    });

    document.querySelectorAll('.preset-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const nextG = parseFloat(btn.getAttribute('data-g') || '9.81');
        setSimulationParameters({ g: nextG }, false);
      });
    });

    dom.sliderTh1.addEventListener('input', (e) => {
      setSimulationParameters({ theta1Deg: parseFloat(e.target.value) }, true);
    });
    dom.sliderTh2.addEventListener('input', (e) => {
      setSimulationParameters({ theta2Deg: parseFloat(e.target.value) }, true);
    });
    dom.sliderM1.addEventListener('input', (e) => {
      setSimulationParameters({ m1: parseFloat(e.target.value) }, false);
    });
    dom.sliderM2.addEventListener('input', (e) => {
      setSimulationParameters({ m2: parseFloat(e.target.value) }, false);
    });
    dom.sliderL1.addEventListener('input', (e) => {
      setSimulationParameters({ L1: parseFloat(e.target.value) }, false);
    });
    dom.sliderL2.addEventListener('input', (e) => {
      setSimulationParameters({ L2: parseFloat(e.target.value) }, false);
    });
    dom.sliderG.addEventListener('input', (e) => {
      setSimulationParameters({ g: parseFloat(e.target.value) }, false);
    });

    dom.chkTrail.addEventListener('change', (e) => {
      setSimulationParameters({ showTrail: Boolean(e.target.checked) }, false);
    });
    dom.chkVectors.addEventListener('change', (e) => {
      setSimulationParameters({ showVectors: Boolean(e.target.checked) }, false);
    });

    // =========================================================================
    // 10. CLEANUP AND RESET
    // =========================================================================
    function resetSimulation(keepRunning = true) {
      simState.time = 0;
      simState.accumulator = 0;
      simState.running = keepRunning;
      simState.pendulum = {
        theta1: params.theta1Deg * DEG2RAD,
        theta2: params.theta2Deg * DEG2RAD,
        omega1: 0,
        omega2: 0,
      };
      clearTrail();
      lastWallMs = performance.now();
      syncControlLabels();
      updateVisualization(true);
    }

    function disposeSimulation() {
      cancelAnimationFrame(animFrameId);
      clearTimeout(animFrameId);
      window.removeEventListener('resize', onWindowResize);
      disposables.geometries.forEach((g) => g.dispose());
      disposables.materials.forEach((m) => m.dispose());
      disposables.textures.forEach((t) => t.dispose());
      renderer.dispose();
    }
    window.addEventListener('beforeunload', disposeSimulation);

    // =========================================================================
    // 11. SIMULATION API & WALKTHROUGH CONFIGURATION
    // =========================================================================
    window.simulationAPI = {
      getState() {
        return {
          time: simState.time,
          running: simState.running,
          pendulum: { ...simState.pendulum },
          parameters: { ...params },
          controls: {
            showTrail: params.showTrail,
            showVectors: params.showVectors,
            timeScale: params.timeScale,
          },
          camera: {
            position: [camera.position.x, camera.position.y, camera.position.z],
            target: [controls.target.x, controls.target.y, controls.target.z],
          },
        };
      },
      setState(next) {
        if (!next || typeof next !== 'object') return;
        if (next.parameters && typeof next.parameters === 'object') {
          Object.assign(params, next.parameters);
        }
        if (next.controls && typeof next.controls === 'object') {
          Object.assign(params, next.controls);
        }
        if (typeof next.time === 'number') simState.time = next.time;
        if (typeof next.running === 'boolean') simState.running = next.running;
        if (next.pendulum && typeof next.pendulum === 'object') {
          Object.assign(simState.pendulum, next.pendulum);
        }
        if (next.camera && Array.isArray(next.camera.position) && next.camera.position.length === 3) {
          camera.position.set(next.camera.position[0], next.camera.position[1], next.camera.position[2]);
        }
        if (next.camera && Array.isArray(next.camera.target) && next.camera.target.length === 3) {
          controls.target.set(next.camera.target[0], next.camera.target[1], next.camera.target[2]);
        }
        controls.update();
        clearTrail();
        syncControlLabels();
        updateVisualization(true);
      },
      getParameters() {
        return { ...params };
      },
      setParameter(name, value) {
        if (Object.prototype.hasOwnProperty.call(params, name)) {
          const isAngle = name === 'theta1Deg' || name === 'theta2Deg';
          setSimulationParameters({ [name]: value }, isAngle);
        }
      },
      play() {
        simState.running = true;
        lastWallMs = performance.now();
        syncControlLabels();
      },
      pause() {
        simState.running = false;
        syncControlLabels();
      },
      reset() {
        resetSimulation(true);
      },
    };

    window.WALKTHROUGH_CONFIG = {
      title: 'Guided Tour: 3D Double Pendulum',
      description: 'Nonlinear dynamics, energy conservation, and chaotic motion',
      language: 'en-US',
      segments: [
        {
          id: 'intro',
          title: 'Introduction to Coupled Motion',
          text: 'Welcome to the 3D Double Pendulum simulation. Two rigid pendulum arms hang from a single fixed pivot point under gravity, forming one of the simplest mechanical systems in physics that exhibits chaotic motion.',
          durationEstimate: 11,
          highlight: ['#telemetry-panel'],
          experimentSuggestion: 'Drag the 3D viewport to orbit around the pendulum and observe its motion from different angles.',
        },
        {
          id: 'controls',
          title: 'Playback & Slow Motion',
          text: 'Use Play, Pause, Reset, and the playback speed buttons to slow the motion down to quarter speed whenever the lower bob whips rapidly around the upper joint.',
          durationEstimate: 10,
          highlight: ['#playback-controls', '#speed-controls'],
          experimentSuggestion: 'Switch to 0.25x speed to observe momentum transfer at the instant the lower arm flips over the top.',
        },
        {
          id: 'angles',
          title: 'Initial Release Angles',
          text: 'Adjust the initial angles theta one and theta two to control the starting potential energy. Small angles produce nearly periodic oscillations, while large angles trigger dramatic chaotic tumbling.',
          durationEstimate: 12,
          highlight: ['#theta1-control', '#theta2-control'],
          experimentSuggestion: 'Try setting both theta1 and theta2 to 25 degrees to compare gentle oscillation against 140 degrees.',
        },
        {
          id: 'trail-vectors',
          title: 'Motion Trail & Velocity Vectors',
          text: 'Toggle the Motion Trail to trace the intricate non-repeating path of the lower bob, and toggle Velocity Vectors to compare how speed shifts rapidly between the upper and lower masses.',
          durationEstimate: 11,
          highlight: ['#trail-control', '#vectors-control'],
          experimentSuggestion: 'Click Clear Trail after changing angles to compare fresh trajectory patterns.',
        },
        {
          id: 'mass-length-gravity',
          title: 'Masses, Arm Lengths & Gravity',
          text: 'Experiment with the bob masses, rod lengths, and planetary gravity presets. A heavier upper bob stabilizes the inner arm, while stronger gravity accelerates every swing.',
          durationEstimate: 11,
          highlight: ['#mass1-control', '#length1-control', '#gravity-control'],
          experimentSuggestion: 'Compare Earth gravity against Moon gravity, or increase m1 to 4.5 kg while keeping m2 light.',
        },
        {
          id: 'equations-energy',
          title: 'Lagrangian Mechanics & Energy Conservation',
          text: 'Even though the path looks unpredictable, total mechanical energy stays strictly conserved. Watch the live kinetic and potential energy bar exchange continuously while total energy remains constant.',
          durationEstimate: 12,
          highlight: ['#equations-panel', '#telemetry-panel'],
          experimentSuggestion: 'Pause at a high turning point to verify potential energy peaks while kinetic energy drops near zero.',
        },
      ],
    };

    // Initial render and startup
    resetSimulation(true);
    animate();
  </script>
</body>
</html>`;

export const DOUBLE_PENDULUM_HTML = ensureWalkthroughEmbedded(RAW_DOUBLE_PENDULUM_HTML);
