export interface ProjectilePosition {
  x: number;
  y: number;
  z: number;
}

export interface ProjectileVelocity {
  vx: number;
  vy: number;
  vz: number;
  speed: number;
}

export interface ProjectileAnalyticalMetrics {
  vx0: number;
  vy0: number;
  apexTime: number;
  maxHeight: number;
  timeOfFlight: number;
  range: number;
}

export function calculateProjectilePosition(
  x0: number,
  y0: number,
  v0: number,
  angleDeg: number,
  g: number,
  t: number
): ProjectilePosition {
  const rad = (angleDeg * Math.PI) / 180;
  const vx0 = v0 * Math.cos(rad);
  const vy0 = v0 * Math.sin(rad);
  return {
    x: x0 + vx0 * t,
    y: y0 + vy0 * t - 0.5 * g * t * t,
    z: 0,
  };
}

export function calculateProjectileVelocity(
  v0: number,
  angleDeg: number,
  g: number,
  t: number
): ProjectileVelocity {
  const rad = (angleDeg * Math.PI) / 180;
  const vx = v0 * Math.cos(rad);
  const vy = v0 * Math.sin(rad) - g * t;
  return {
    vx,
    vy,
    vz: 0,
    speed: Math.hypot(vx, vy),
  };
}

export function calculateProjectileAnalyticalMetrics(
  x0: number,
  y0: number,
  v0: number,
  angleDeg: number,
  g: number
): ProjectileAnalyticalMetrics {
  const rad = (angleDeg * Math.PI) / 180;
  const vx0 = v0 * Math.cos(rad);
  const vy0 = v0 * Math.sin(rad);
  const safeG = Math.max(g, 0.0001);
  const apexTime = Math.max(0, vy0 / safeG);
  const maxHeight = y0 + (vy0 * vy0) / (2 * safeG);
  const discriminant = vy0 * vy0 + 2 * safeG * Math.max(0, y0);
  const timeOfFlight = (vy0 + Math.sqrt(discriminant)) / safeG;
  const range = x0 + vx0 * timeOfFlight;
  return {
    vx0,
    vy0,
    apexTime,
    maxHeight,
    timeOfFlight,
    range,
  };
}

export const PROJECTILE_MOTION_HTML = `<!--
SIMULATION_METADATA
Title: Projectile Motion
Subject: Classical Mechanics
Topic: Two-dimensional kinematics
Difficulty: High School
Simulation Type: Interactive 3D Visualization

LEARNING_OBJECTIVES:
- Understand projectile trajectories under uniform gravity.
- Explore the influence of initial velocity on range and maximum height.
- Explore the influence of launch angle and complementary angles.
- Understand independent horizontal and vertical velocity components.

PHYSICAL_MODEL:
- Classical Newtonian mechanics in a uniform gravitational field.
- Constant downward gravitational acceleration g along the -Y axis.
- Negligible aerodynamic drag and Magnus forces.
- Flat horizontal ground plane at y = 0 m.

GOVERNING_EQUATIONS:
- x(t) = x0 + v0 * cos(theta) * t
- y(t) = y0 + v0 * sin(theta) * t - 0.5 * g * t^2
- vx(t) = v0 * cos(theta)
- vy(t) = v0 * sin(theta) - g * t
- R = v0 * cos(theta) * (vy0 + sqrt(vy0^2 + 2*g*y0)) / g

INTERACTIVE_PARAMETERS:
- Initial velocity v0 (m/s)
- Launch angle theta (degrees)
- Gravitational acceleration g (m/s^2)
- Initial launch height y0 (m)
- Simulation playback speed (multiplier)

VISUAL_ELEMENTS:
- Composite 3D pneumatic launcher assembly with elevation protractor
- Metallic projectile sphere and luminous trajectory trail
- Analytical predicted parabolic guide curve and apex marker
- Calibrated 3D ground range grid and X/Y/Z coordinate axes
- Instantaneous velocity vector v(t) and gravitational acceleration vector g

SIMULATION_CONTROLS:
- Play / Pause
- Launch / Fire
- Reset
- Speed adjustment
- Parameter adjustment sliders
- Vector & predicted curve visibility toggles

AGENT_GUIDANCE:
- Physical calculations are implemented strictly inside Section 3 (PHYSICS MODEL).
- Visual representation and Three.js transforms are implemented separately in Sections 5 and 7.
- Do not modify visual scaling when changing physical parameters.
- Keep SI physical units consistent (meters, seconds, m/s, m/s^2, degrees).
- Update dependent visual elements whenever simulation parameters change.
-->
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Projectile Motion — 3D Physics Simulation</title>
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
      --bg-hud: rgba(15, 23, 42, 0.88);
      --border-hud: rgba(148, 163, 184, 0.24);
      --text-main: #f8fafc;
      --text-muted: #94a3b8;
      --accent: #38bdf8;
      --vel-color: #22c55e;
      --acc-color: #ef4444;
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
    }

    #canvas-container {
      position: fixed;
      inset: 0;
      width: 100%;
      height: 100%;
    }

    .hud-panel {
      position: fixed;
      background: var(--bg-hud);
      border: 1px solid var(--border-hud);
      border-radius: 10px;
      color: var(--text-main);
      font-size: 12px;
      line-height: 1.45;
      z-index: 10;
      box-shadow: 0 8px 24px rgba(2, 6, 23, 0.35);
    }

    #telemetry-panel {
      top: 14px;
      left: 14px;
      padding: 12px 14px;
      min-width: 248px;
      max-width: 280px;
    }

    .panel-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      margin-bottom: 8px;
      padding-bottom: 6px;
      border-bottom: 1px solid rgba(148, 163, 184, 0.16);
    }

    .panel-title {
      font-size: 13px;
      font-weight: 600;
      letter-spacing: -0.01em;
    }

    .panel-subtitle {
      font-size: 11px;
      color: var(--text-muted);
    }

    .telemetry-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 6px 12px;
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
      font-size: 12px;
      font-weight: 600;
      color: #f1f5f9;
    }

    .legend-row {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-top: 10px;
      padding-top: 8px;
      border-top: 1px solid rgba(148, 163, 184, 0.16);
      font-size: 11px;
      color: var(--text-muted);
    }

    .legend-swatch {
      display: inline-flex;
      align-items: center;
      gap: 5px;
    }

    .swatch-bar {
      width: 12px;
      height: 3px;
      border-radius: 2px;
    }

    #equations-panel {
      top: 14px;
      right: 14px;
      padding: 12px 14px;
      width: 284px;
    }

    .eq-toggle-btn {
      background: transparent;
      border: 1px solid var(--border-hud);
      color: var(--text-muted);
      border-radius: 6px;
      padding: 2px 8px;
      font-size: 11px;
      cursor: pointer;
    }

    .eq-toggle-btn:hover {
      color: var(--text-main);
      border-color: rgba(148, 163, 184, 0.45);
    }

    .eq-list {
      display: flex;
      flex-direction: column;
      gap: 5px;
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      font-size: 11px;
      color: #cbd5e1;
    }

    .eq-line {
      padding: 4px 7px;
      background: rgba(30, 41, 59, 0.72);
      border-radius: 5px;
    }

    .assumptions {
      margin-top: 8px;
      font-size: 11px;
      color: var(--text-muted);
    }

    #control-dock {
      bottom: 16px;
      left: 50%;
      transform: translateX(-50%);
      width: min(880px, calc(100vw - 28px));
      padding: 12px 16px;
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
      z-index: 9;
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
      margin-bottom: 10px;
      padding-bottom: 10px;
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
      padding: 6px 12px;
      font-size: 12px;
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

    .sliders-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(155px, 1fr));
      gap: 10px 14px;
    }

    .slider-control {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .slider-label-row {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      font-size: 11px;
    }

    .slider-label-row span:first-child {
      color: var(--text-muted);
    }

    .slider-label-row span:last-child {
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      font-weight: 600;
      color: #e2e8f0;
      font-variant-numeric: tabular-nums;
    }

    input[type="range"] {
      width: 100%;
      accent-color: #38bdf8;
      cursor: pointer;
    }

    .toggles-row {
      display: flex;
      align-items: center;
      gap: 14px;
      flex-wrap: wrap;
      font-size: 11px;
      color: #cbd5e1;
    }

    .toggle-label {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      cursor: pointer;
      user-select: none;
    }

    select.ctrl-select {
      background: rgba(30, 41, 59, 0.9);
      border: 1px solid rgba(148, 163, 184, 0.25);
      color: #f8fafc;
      border-radius: 6px;
      padding: 5px 8px;
      font-size: 11px;
      cursor: pointer;
    }

    @media (max-width: 720px) {
      #equations-panel {
        display: none;
      }
      #telemetry-panel {
        min-width: 200px;
        padding: 9px 11px;
      }
    }
  </style>
</head>
<body>
  <div id="canvas-container"></div>

  <aside id="telemetry-panel" class="hud-panel" aria-label="Instantaneous Kinematics">
    <div class="panel-header">
      <div>
        <div class="panel-title">Projectile Motion</div>
        <div class="panel-subtitle">2D Kinematics · SI Units</div>
      </div>
    </div>
    <div class="telemetry-grid">
      <div class="metric-item">
        <span class="metric-label">Time t</span>
        <span class="metric-value" id="val-t">0.00 s</span>
      </div>
      <div class="metric-item">
        <span class="metric-label">Speed |v|</span>
        <span class="metric-value" id="val-speed">0.00 m/s</span>
      </div>
      <div class="metric-item">
        <span class="metric-label">Position x(t)</span>
        <span class="metric-value" id="val-x">0.00 m</span>
      </div>
      <div class="metric-item">
        <span class="metric-label">Altitude y(t)</span>
        <span class="metric-value" id="val-y">0.00 m</span>
      </div>
      <div class="metric-item">
        <span class="metric-label">Velocity vx</span>
        <span class="metric-value" id="val-vx">0.00 m/s</span>
      </div>
      <div class="metric-item">
        <span class="metric-label">Velocity vy</span>
        <span class="metric-value" id="val-vy">0.00 m/s</span>
      </div>
      <div class="metric-item">
        <span class="metric-label">Predicted Range</span>
        <span class="metric-value" id="val-range">0.00 m</span>
      </div>
      <div class="metric-item">
        <span class="metric-label">Max Height</span>
        <span class="metric-value" id="val-hmax">0.00 m</span>
      </div>
    </div>
    <div class="legend-row">
      <span class="legend-swatch">
        <span class="swatch-bar" style="background: #22c55e;"></span>
        Velocity v(t)
      </span>
      <span class="legend-swatch">
        <span class="swatch-bar" style="background: #ef4444;"></span>
        Gravity g
      </span>
      <span class="legend-swatch">
        <span class="swatch-bar" style="background: #38bdf8;"></span>
        Path
      </span>
    </div>
  </aside>

  <aside id="equations-panel" class="hud-panel" aria-label="Governing Equations">
    <div class="panel-header">
      <span class="panel-title">Governing Equations</span>
      <button id="btn-toggle-eq" class="eq-toggle-btn" type="button">Hide</button>
    </div>
    <div id="eq-body">
      <div class="eq-list">
        <div class="eq-line">x(t) = x₀ + v₀ cos(θ) · t</div>
        <div class="eq-line">y(t) = y₀ + v₀ sin(θ) · t − ½ g t²</div>
        <div class="eq-line">vₓ(t) = v₀ cos(θ)</div>
        <div class="eq-line">vᵧ(t) = v₀ sin(θ) − g · t</div>
      </div>
      <p class="assumptions">
        Assumptions: Uniform gravity along −Y, flat ground at y = 0 m, negligible air resistance. Drag scene to orbit, scroll to zoom.
      </p>
    </div>
  </aside>

  <button id="dock-restore-btn" type="button">Show Controls</button>

  <section id="control-dock" class="hud-panel" aria-label="Simulation Controls">
    <div class="dock-top-row">
      <div class="btn-group">
        <button id="btn-play-pause" class="ctrl-btn primary" type="button">Pause</button>
        <button id="btn-launch" class="ctrl-btn" type="button">Re-launch</button>
        <button id="btn-reset" class="ctrl-btn" type="button">Reset</button>
        <select id="select-gravity-preset" class="ctrl-select" aria-label="Gravity environment preset">
          <option value="9.81">Earth (9.81 m/s²)</option>
          <option value="1.62">Moon (1.62 m/s²)</option>
          <option value="3.71">Mars (3.71 m/s²)</option>
          <option value="24.79">Jupiter (24.79 m/s²)</option>
        </select>
      </div>
      <div class="toggles-row">
        <label class="toggle-label">
          <input id="chk-vectors" type="checkbox" checked />
          Vectors
        </label>
        <label class="toggle-label">
          <input id="chk-predicted" type="checkbox" checked />
          Predicted Arc
        </label>
        <button id="btn-hide-dock" class="eq-toggle-btn" type="button">Hide Controls</button>
      </div>
    </div>

    <div class="sliders-grid">
      <div class="slider-control">
        <div class="slider-label-row">
          <span>Initial Velocity v₀</span>
          <span id="lbl-v0">24.0 m/s</span>
        </div>
        <input id="slider-v0" type="range" min="5" max="45" step="0.5" value="24" />
      </div>

      <div class="slider-control">
        <div class="slider-label-row">
          <span>Launch Angle θ</span>
          <span id="lbl-angle">45°</span>
        </div>
        <input id="slider-angle" type="range" min="5" max="85" step="1" value="45" />
      </div>

      <div class="slider-control">
        <div class="slider-label-row">
          <span>Gravity g</span>
          <span id="lbl-g">9.81 m/s²</span>
        </div>
        <input id="slider-g" type="range" min="1.0" max="25.0" step="0.01" value="9.81" />
      </div>

      <div class="slider-control">
        <div class="slider-label-row">
          <span>Initial Height y₀</span>
          <span id="lbl-y0">1.5 m</span>
        </div>
        <input id="slider-y0" type="range" min="0" max="15" step="0.5" value="1.5" />
      </div>

      <div class="slider-control">
        <div class="slider-label-row">
          <span>Playback Speed</span>
          <span id="lbl-speed">1.00×</span>
        </div>
        <input id="slider-speed" type="range" min="0.25" max="2.0" step="0.25" value="1.0" />
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
      visualVectorScale: 0.22,
      visualGravityArrowScale: 0.35,
      maxTrailPoints: 600,
      trailSampleInterval: 0.025,
      groundSize: 160,
      projectileRadius: 0.55,
      skyColor: 0x0b1120,
      fixedPhysicsDt: 1 / 120,
    };

    // =========================================================================
    // 2. PHYSICAL CONSTANTS AND PARAMETERS
    // =========================================================================
    const params = {
      x0: 0,
      y0: 1.5,
      v0: 24.0,
      angleDeg: 45,
      g: 9.81,
      timeScale: 1.0,
      showVectors: true,
      showPredictedArc: true,
    };

    // =========================================================================
    // 3. PHYSICS MODEL
    // =========================================================================
    /**
     * Computes instantaneous projectile position (m) at time t (s).
     */
    function calculatePosition(x0, y0, v0, angleDeg, g, t) {
      const rad = (angleDeg * Math.PI) / 180;
      const vx0 = v0 * Math.cos(rad);
      const vy0 = v0 * Math.sin(rad);
      return {
        x: x0 + vx0 * t,
        y: y0 + vy0 * t - 0.5 * g * t * t,
        z: 0,
      };
    }

    /**
     * Computes instantaneous velocity components (m/s) at time t (s).
     */
    function calculateVelocity(v0, angleDeg, g, t) {
      const rad = (angleDeg * Math.PI) / 180;
      const vx = v0 * Math.cos(rad);
      const vy = v0 * Math.sin(rad) - g * t;
      return {
        vx,
        vy,
        vz: 0,
        speed: Math.hypot(vx, vy),
      };
    }

    /**
     * Computes closed-form analytical range, apex time, max height, and flight duration.
     */
    function calculateAnalyticalMetrics(x0, y0, v0, angleDeg, g) {
      const rad = (angleDeg * Math.PI) / 180;
      const vx0 = v0 * Math.cos(rad);
      const vy0 = v0 * Math.sin(rad);
      const safeG = Math.max(g, 0.0001);
      const apexTime = Math.max(0, vy0 / safeG);
      const maxHeight = y0 + (vy0 * vy0) / (2 * safeG);
      const discriminant = vy0 * vy0 + 2 * safeG * Math.max(0, y0);
      const timeOfFlight = (vy0 + Math.sqrt(discriminant)) / safeG;
      const range = x0 + vx0 * timeOfFlight;
      return { vx0, vy0, apexTime, maxHeight, timeOfFlight, range };
    }

    /**
     * Advances simulation physics state by dt seconds and checks ground impact at y = 0.
     */
    function updatePhysics(dt) {
      if (!simState.running || simState.landed) return;

      const metrics = calculateAnalyticalMetrics(
        params.x0,
        params.y0,
        params.v0,
        params.angleDeg,
        params.g
      );

      const nextTime = simState.t + dt * params.timeScale;
      if (nextTime >= metrics.timeOfFlight) {
        simState.t = metrics.timeOfFlight;
        simState.landed = true;
        simState.running = false;
      } else {
        simState.t = nextTime;
      }

      const pos = calculatePosition(
        params.x0,
        params.y0,
        params.v0,
        params.angleDeg,
        params.g,
        simState.t
      );
      const vel = calculateVelocity(params.v0, params.angleDeg, params.g, simState.t);

      simState.position.x = pos.x;
      simState.position.y = Math.max(0, pos.y);
      simState.position.z = 0;
      simState.velocity.vx = vel.vx;
      simState.velocity.vy = vel.vy;
      simState.velocity.speed = vel.speed;
      simState.metrics = metrics;

      if (simState.t - simState.lastTrailSampleTime >= CONFIG.trailSampleInterval || simState.landed) {
        simState.trailPoints.push(new THREE.Vector3(simState.position.x, simState.position.y, 0));
        if (simState.trailPoints.length > CONFIG.maxTrailPoints) {
          simState.trailPoints.shift();
        }
        simState.lastTrailSampleTime = simState.t;
      }
    }

    // =========================================================================
    // 4. SCENE INITIALIZATION
    // =========================================================================
    const isSoftwareGl = (() => {
      const probeCanvas = document.createElement('canvas');
      const gl = probeCanvas.getContext('webgl2');
      if (!gl) return true;
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
      const gpu = String(gl.getParameter(param));
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
    })();

    const container = document.getElementById('canvas-container');
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(CONFIG.skyColor);
    scene.fog = new THREE.Fog(CONFIG.skyColor, 75, 210);

    const camera = new THREE.PerspectiveCamera(
      48,
      window.innerWidth / window.innerHeight,
      0.1,
      400
    );
    camera.position.set(28, 18, 44);

    const renderer = new THREE.WebGLRenderer({
      antialias: !isSoftwareGl,
      powerPreference: 'high-performance',
    });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);

    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    scene.environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
    pmremGenerator.dispose();

    const hemiLight = new THREE.HemisphereLight(0x93c5fd, 0x1e293b, 0.75);
    scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight(0xfffbeb, 2.0);
    keyLight.position.set(25, 42, 24);
    keyLight.castShadow = !isSoftwareGl;
    keyLight.shadow.mapSize.width = 2048;
    keyLight.shadow.mapSize.height = 2048;
    keyLight.shadow.camera.near = 1;
    keyLight.shadow.camera.far = 140;
    keyLight.shadow.camera.left = -45;
    keyLight.shadow.camera.right = 75;
    keyLight.shadow.camera.top = 45;
    keyLight.shadow.camera.bottom = -25;
    keyLight.shadow.bias = -0.0005;
    keyLight.shadow.normalBias = 0.02;
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0x38bdf8, 0.55);
    rimLight.position.set(-20, 15, -24);
    scene.add(rimLight);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = !isSoftwareGl;
    controls.dampingFactor = 0.06;
    controls.target.set(24, 6, 0);
    controls.minDistance = 8;
    controls.maxDistance = 150;
    controls.maxPolarAngle = Math.PI * 0.49;

    // =========================================================================
    // 5. VISUAL OBJECT CREATION
    // =========================================================================
    function createRangeFloorTexture() {
      const canvas = document.createElement('canvas');
      canvas.width = 512;
      canvas.height = 512;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(0, 0, 512, 512);

      ctx.strokeStyle = 'rgba(56, 189, 248, 0.14)';
      ctx.lineWidth = 2;
      for (let i = 0; i <= 512; i += 64) {
        ctx.beginPath();
        ctx.moveTo(i, 0);
        ctx.lineTo(i, 512);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(0, i);
        ctx.lineTo(512, i);
        ctx.stroke();
      }

      ctx.strokeStyle = 'rgba(148, 163, 184, 0.35)';
      ctx.lineWidth = 3;
      ctx.strokeRect(0, 0, 512, 512);

      const tex = new THREE.CanvasTexture(canvas);
      tex.wrapS = THREE.RepeatWrapping;
      tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(32, 32);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
      return tex;
    }

    const groundMat = new THREE.MeshStandardMaterial({
      map: createRangeFloorTexture(),
      roughness: 0.85,
      metalness: 0.1,
    });
    const groundMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(CONFIG.groundSize, CONFIG.groundSize),
      groundMat
    );
    groundMesh.rotation.x = -Math.PI / 2;
    groundMesh.position.set(45, 0, 0);
    groundMesh.receiveShadow = true;
    scene.add(groundMesh);

    // Coordinate Axes & Range Markers
    const axesGroup = new THREE.Group();
    const xAxisGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0.03, 0),
      new THREE.Vector3(90, 0.03, 0),
    ]);
    axesGroup.add(new THREE.Line(xAxisGeo, new THREE.LineBasicMaterial({ color: 0x38bdf8 })));

    const yAxisGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0.03, 0),
      new THREE.Vector3(0, 40, 0),
    ]);
    axesGroup.add(new THREE.Line(yAxisGeo, new THREE.LineBasicMaterial({ color: 0x4ade80 })));

    const zAxisGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0.03, -15),
      new THREE.Vector3(0, 0.03, 15),
    ]);
    axesGroup.add(new THREE.Line(zAxisGeo, new THREE.LineBasicMaterial({ color: 0x94a3b8 })));
    scene.add(axesGroup);

    // Composite 3D Pneumatic Launcher Assembly (6-part THREE.Group)
    const launcherGroup = new THREE.Group();
    const castIronMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.65,
      metalness: 0.45,
    });
    const brushedSteelMat = new THREE.MeshStandardMaterial({
      color: 0xcbd5e1,
      roughness: 0.25,
      metalness: 0.88,
    });
    const accentCollarMat = new THREE.MeshStandardMaterial({
      color: 0x0284c7,
      roughness: 0.35,
      metalness: 0.5,
    });

    // Elevation pedestal tower (scales dynamically with y0)
    const pedestalTower = new THREE.Mesh(
      new THREE.CylinderGeometry(0.42, 0.58, 1, 20),
      castIronMat
    );
    pedestalTower.castShadow = true;
    pedestalTower.receiveShadow = true;
    launcherGroup.add(pedestalTower);

    // Base anchor plate resting flush at y = 0
    const basePlate = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.22, 2.2), castIronMat);
    basePlate.position.y = 0.11;
    basePlate.castShadow = true;
    basePlate.receiveShadow = true;
    launcherGroup.add(basePlate);

    // Pivot carriage & barrel assembly
    const pivotAssembly = new THREE.Group();
    const trunnion = new THREE.Mesh(
      new THREE.CylinderGeometry(0.32, 0.32, 1.35, 20),
      brushedSteelMat
    );
    trunnion.rotation.x = Math.PI / 2;
    trunnion.castShadow = true;
    pivotAssembly.add(trunnion);

    const barrelGroup = new THREE.Group();
    const barrelTube = new THREE.Mesh(
      new THREE.CylinderGeometry(0.28, 0.34, 2.4, 24),
      brushedSteelMat
    );
    barrelTube.rotation.z = -Math.PI / 2;
    barrelTube.position.x = 1.05;
    barrelTube.castShadow = true;
    barrelGroup.add(barrelTube);

    const muzzleCollar = new THREE.Mesh(
      new THREE.TorusGeometry(0.31, 0.06, 12, 24),
      accentCollarMat
    );
    muzzleCollar.rotation.y = Math.PI / 2;
    muzzleCollar.position.x = 2.2;
    barrelGroup.add(muzzleCollar);

    const breechCap = new THREE.Mesh(
      new THREE.SphereGeometry(0.36, 16, 16),
      castIronMat
    );
    breechCap.position.x = -0.15;
    barrelGroup.add(breechCap);

    pivotAssembly.add(barrelGroup);
    launcherGroup.add(pivotAssembly);
    scene.add(launcherGroup);

    // Projectile Sphere + Soft Contact Ring
    const projectileMat = new THREE.MeshStandardMaterial({
      color: 0xf59e0b,
      roughness: 0.22,
      metalness: 0.78,
    });
    const projectileMesh = new THREE.Mesh(
      new THREE.SphereGeometry(CONFIG.projectileRadius, 28, 28),
      projectileMat
    );
    projectileMesh.castShadow = true;
    scene.add(projectileMesh);

    const landingRing = new THREE.Mesh(
      new THREE.RingGeometry(0.45, 0.75, 32),
      new THREE.MeshBasicMaterial({
        color: 0xf59e0b,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.85,
      })
    );
    landingRing.rotation.x = -Math.PI / 2;
    landingRing.position.y = 0.03;
    landingRing.visible = false;
    scene.add(landingRing);

    // Apex height marker
    const apexMarker = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.35, 0),
      new THREE.MeshBasicMaterial({ color: 0x38bdf8 })
    );
    scene.add(apexMarker);

    // Live Trajectory Trail Line
    const trailGeometry = new THREE.BufferGeometry();
    const trailMaterial = new THREE.LineBasicMaterial({ color: 0xfbbf24 });
    const trailLine = new THREE.Line(trailGeometry, trailMaterial);
    trailLine.frustumCulled = false;
    scene.add(trailLine);

    // Predicted Analytical Parabolic Arc (Dashed)
    const predictedGeometry = new THREE.BufferGeometry();
    const predictedMaterial = new THREE.LineDashedMaterial({
      color: 0x38bdf8,
      dashSize: 0.8,
      gapSize: 0.5,
      transparent: true,
      opacity: 0.75,
    });
    const predictedLine = new THREE.Line(predictedGeometry, predictedMaterial);
    predictedLine.frustumCulled = false;
    scene.add(predictedLine);

    // Physics Vectors: Velocity & Gravity
    const velocityArrow = new THREE.ArrowHelper(
      new THREE.Vector3(1, 0, 0),
      new THREE.Vector3(0, 0, 0),
      1,
      0x22c55e,
      0.85,
      0.42
    );
    scene.add(velocityArrow);

    const gravityArrow = new THREE.ArrowHelper(
      new THREE.Vector3(0, -1, 0),
      new THREE.Vector3(0, 0, 0),
      1,
      0xef4444,
      0.75,
      0.38
    );
    scene.add(gravityArrow);

    // =========================================================================
    // 6. SIMULATION STATE
    // =========================================================================
    const simState = {
      t: 0,
      running: true,
      landed: false,
      lastTrailSampleTime: -1,
      position: { x: params.x0, y: params.y0, z: 0 },
      velocity: { vx: 0, vy: 0, speed: 0 },
      metrics: calculateAnalyticalMetrics(
        params.x0,
        params.y0,
        params.v0,
        params.angleDeg,
        params.g
      ),
      trailPoints: [],
    };

    // Pre-allocated math helpers for zero-GC render loop
    const _velDir = new THREE.Vector3();
    const _gravDir = new THREE.Vector3(0, -1, 0);

    // =========================================================================
    // 7. ANIMATION AND PHYSICS UPDATE
    // =========================================================================
    function updatePredictedTrajectoryVisuals() {
      const metrics = calculateAnalyticalMetrics(
        params.x0,
        params.y0,
        params.v0,
        params.angleDeg,
        params.g
      );
      simState.metrics = metrics;

      const samples = 72;
      const pts = [];
      for (let i = 0; i <= samples; i++) {
        const tau = (i / samples) * metrics.timeOfFlight;
        const p = calculatePosition(
          params.x0,
          params.y0,
          params.v0,
          params.angleDeg,
          params.g,
          tau
        );
        pts.push(new THREE.Vector3(p.x, Math.max(0.02, p.y), 0));
      }
      predictedGeometry.setFromPoints(pts);
      predictedLine.computeLineDistances();
      predictedLine.visible = params.showPredictedArc;

      const apexPos = calculatePosition(
        params.x0,
        params.y0,
        params.v0,
        params.angleDeg,
        params.g,
        metrics.apexTime
      );
      apexMarker.position.set(apexPos.x, apexPos.y, 0);
      apexMarker.visible = params.showPredictedArc;
    }

    function updateVisualization() {
      // Launcher posture & height
      const pedestalHeight = Math.max(0.25, params.y0);
      pedestalTower.scale.set(1, pedestalHeight, 1);
      pedestalTower.position.y = pedestalHeight * 0.5;
      pivotAssembly.position.set(params.x0, params.y0, 0);
      barrelGroup.rotation.z = THREE.MathUtils.degToRad(params.angleDeg);

      // Projectile position (clamp visual sphere radius above ground plane on impact)
      const visualY = Math.max(CONFIG.projectileRadius, simState.position.y);
      projectileMesh.position.set(simState.position.x, simState.landed ? CONFIG.projectileRadius : Math.max(0, simState.position.y), 0);
      if (simState.position.y < CONFIG.projectileRadius && !simState.landed) {
        projectileMesh.position.y = visualY;
      }

      // Landing marker
      if (simState.landed) {
        landingRing.visible = true;
        landingRing.position.set(simState.position.x, 0.04, 0);
      } else {
        landingRing.visible = false;
      }

      // Trail geometry
      if (simState.trailPoints.length >= 2) {
        trailGeometry.setFromPoints(simState.trailPoints);
        trailLine.visible = true;
      } else {
        trailLine.visible = false;
      }

      // Vector arrows
      const showVec = params.showVectors;
      velocityArrow.visible = showVec && simState.velocity.speed > 0.05;
      if (velocityArrow.visible) {
        velocityArrow.position.copy(projectileMesh.position);
        _velDir.set(simState.velocity.vx, simState.velocity.vy, 0).normalize();
        const vLen = Math.max(0.9, simState.velocity.speed * CONFIG.visualVectorScale);
        velocityArrow.setDirection(_velDir);
        velocityArrow.setLength(vLen, Math.min(0.85, vLen * 0.28), 0.36);
      }

      gravityArrow.visible = showVec && params.g > 0.05;
      if (gravityArrow.visible) {
        gravityArrow.position.copy(projectileMesh.position);
        const gLen = Math.max(1.1, params.g * CONFIG.visualGravityArrowScale);
        gravityArrow.setDirection(_gravDir);
        gravityArrow.setLength(gLen, Math.min(0.75, gLen * 0.28), 0.32);
      }

      // Telemetry DOM readouts
      document.getElementById('val-t').textContent = simState.t.toFixed(2) + ' s';
      document.getElementById('val-speed').textContent = simState.velocity.speed.toFixed(2) + ' m/s';
      document.getElementById('val-x').textContent = simState.position.x.toFixed(2) + ' m';
      document.getElementById('val-y').textContent = simState.position.y.toFixed(2) + ' m';
      document.getElementById('val-vx').textContent = simState.velocity.vx.toFixed(2) + ' m/s';
      document.getElementById('val-vy').textContent = simState.velocity.vy.toFixed(2) + ' m/s';
      document.getElementById('val-range').textContent = simState.metrics.range.toFixed(2) + ' m';
      document.getElementById('val-hmax').textContent = simState.metrics.maxHeight.toFixed(2) + ' m';

      const playPauseBtn = document.getElementById('btn-play-pause');
      if (simState.landed) {
        playPauseBtn.textContent = 'Replay';
      } else {
        playPauseBtn.textContent = simState.running ? 'Pause' : 'Play';
      }
    }

    let lastFrameTime = performance.now();
    let frameId = 0;

    function afterDraw(cb) {
      const gl = renderer.getContext();
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (state === gl.UNSIGNALED) {
          frameId = window.setTimeout(poll, 5);
        } else {
          gl.deleteSync(sync);
          frameId = window.setTimeout(cb, 80);
        }
      };
      frameId = window.setTimeout(poll, 5);
    }

    function animate(now = performance.now()) {
      const rawDt = Math.min(0.05, Math.max(0.001, (now - lastFrameTime) / 1000));
      lastFrameTime = now;

      let remaining = rawDt;
      while (remaining > 0) {
        const step = Math.min(remaining, CONFIG.fixedPhysicsDt);
        updatePhysics(step);
        remaining -= step;
      }

      controls.update();
      updateVisualization();
      renderer.render(scene, camera);

      if (isSoftwareGl) {
        afterDraw(() => animate(performance.now()));
      } else {
        frameId = requestAnimationFrame(animate);
      }
    }

    // =========================================================================
    // 8. USER INTERACTION
    // =========================================================================
    function onWindowResize() {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
      renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    }
    window.addEventListener('resize', onWindowResize);

    // =========================================================================
    // 9. UI CONTROLS
    // =========================================================================
    function setSimulationParameters(updates, shouldReset = false) {
      Object.assign(params, updates);
      document.getElementById('lbl-v0').textContent = params.v0.toFixed(1) + ' m/s';
      document.getElementById('lbl-angle').textContent = Math.round(params.angleDeg) + '°';
      document.getElementById('lbl-g').textContent = params.g.toFixed(2) + ' m/s²';
      document.getElementById('lbl-y0').textContent = params.y0.toFixed(1) + ' m';
      document.getElementById('lbl-speed').textContent = params.timeScale.toFixed(2) + '×';

      updatePredictedTrajectoryVisuals();
      if (shouldReset) {
        resetSimulation(true);
      } else {
        updateVisualization();
      }
    }

    document.getElementById('slider-v0').addEventListener('input', (e) => {
      setSimulationParameters({ v0: parseFloat(e.target.value) }, true);
    });

    document.getElementById('slider-angle').addEventListener('input', (e) => {
      setSimulationParameters({ angleDeg: parseFloat(e.target.value) }, true);
    });

    document.getElementById('slider-g').addEventListener('input', (e) => {
      setSimulationParameters({ g: parseFloat(e.target.value) }, true);
    });

    document.getElementById('slider-y0').addEventListener('input', (e) => {
      setSimulationParameters({ y0: parseFloat(e.target.value) }, true);
    });

    document.getElementById('slider-speed').addEventListener('input', (e) => {
      setSimulationParameters({ timeScale: parseFloat(e.target.value) }, false);
    });

    document.getElementById('select-gravity-preset').addEventListener('change', (e) => {
      const val = parseFloat(e.target.value);
      document.getElementById('slider-g').value = String(val);
      setSimulationParameters({ g: val }, true);
    });

    document.getElementById('chk-vectors').addEventListener('change', (e) => {
      setSimulationParameters({ showVectors: e.target.checked }, false);
    });

    document.getElementById('chk-predicted').addEventListener('change', (e) => {
      setSimulationParameters({ showPredictedArc: e.target.checked }, false);
    });

    document.getElementById('btn-play-pause').addEventListener('click', () => {
      if (simState.landed) {
        resetSimulation(true);
      } else {
        simState.running = !simState.running;
        updateVisualization();
      }
    });

    document.getElementById('btn-launch').addEventListener('click', () => {
      resetSimulation(true);
    });

    document.getElementById('btn-reset').addEventListener('click', () => {
      resetSimulation(false);
    });

    document.getElementById('btn-toggle-eq').addEventListener('click', () => {
      const body = document.getElementById('eq-body');
      const btn = document.getElementById('btn-toggle-eq');
      const hidden = body.style.display === 'none';
      body.style.display = hidden ? 'block' : 'none';
      btn.textContent = hidden ? 'Hide' : 'Show';
    });

    document.getElementById('btn-hide-dock').addEventListener('click', () => {
      document.getElementById('control-dock').classList.add('collapsed');
      document.getElementById('dock-restore-btn').style.display = 'block';
    });

    document.getElementById('dock-restore-btn').addEventListener('click', () => {
      document.getElementById('control-dock').classList.remove('collapsed');
      document.getElementById('dock-restore-btn').style.display = 'none';
    });

    // =========================================================================
    // 10. CLEANUP AND RESET
    // =========================================================================
    function resetSimulation(autoStart = true) {
      simState.t = 0;
      simState.landed = false;
      simState.running = autoStart;
      simState.lastTrailSampleTime = -1;
      simState.position = { x: params.x0, y: params.y0, z: 0 };
      const initialVel = calculateVelocity(params.v0, params.angleDeg, params.g, 0);
      simState.velocity = {
        vx: initialVel.vx,
        vy: initialVel.vy,
        speed: initialVel.speed,
      };
      simState.trailPoints = [new THREE.Vector3(params.x0, params.y0, 0)];
      trailGeometry.setFromPoints(simState.trailPoints);
      updatePredictedTrajectoryVisuals();
      updateVisualization();
    }

    window.addEventListener('beforeunload', () => {
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      window.removeEventListener('resize', onWindowResize);
      controls.dispose();
      renderer.dispose();
    });

    // Initialize simulation state and launch animation loop
    resetSimulation(true);
    animate();
  </script>
</body>
</html>
`;
