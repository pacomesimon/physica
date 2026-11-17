import type {
  SimulationProject,
  SimulationVersion,
  StudioSettings,
} from '../types/simulation';
import { PROJECTILE_MOTION_HTML } from './demos/projectileMotion';
import { parseSimulationMetadata } from './metadataParser';

export interface ProjectRepository {
  loadProjects(): SimulationProject[];
  saveProjects(projects: SimulationProject[]): void;
  loadSettings(): StudioSettings;
  saveSettings(settings: StudioSettings): void;
}

const PROJECTS_STORAGE_KEY = 'physica_studio_projects_v1';
const SETTINGS_STORAGE_KEY = 'physica_studio_settings_v1';

export const DEFAULT_SETTINGS: StudioSettings = {
  providerId: 'gemini',
  model: 'gemini-4-hydrogen',
  theme: 'light',
  autoSnapshot: true,
};

export function createSeededProjectileProject(): SimulationProject {
  const now = Date.now();
  const metadata = parseSimulationMetadata(PROJECTILE_MOTION_HTML);
  const initialVersion: SimulationVersion = {
    id: 'ver-initial-projectile',
    versionNumber: 1,
    description: 'Initial reference simulation: 3D Projectile Motion with vectors & equations',
    html: PROJECTILE_MOTION_HTML,
    createdAt: now,
    source: 'initial',
    metadata,
  };

  return {
    id: 'proj-projectile-motion',
    title: 'Projectile Motion',
    subject: 'Classical Mechanics',
    description:
      'Interactive 3D kinematics simulation demonstrating parabolic trajectories, velocity/acceleration vectors, and analytical range equations.',
    currentHtml: PROJECTILE_MOTION_HTML,
    versions: [initialVersion],
    messages: [
      {
        id: 'msg-welcome',
        role: 'assistant',
        content:
          'Loaded the reference Projectile Motion simulation. You can inspect the 3D trajectory, adjust launch angle, initial speed, or gravity in the preview, or ask me to modify the simulation (e.g., add air resistance, show velocity component vectors, or compare two simultaneous launches).',
        createdAt: now,
        responseType: 'explanation',
        physicsAssumptions: metadata.physicalModel,
        versionId: initialVersion.id,
      },
    ],
    createdAt: now,
    updatedAt: now,
  };
}

export function createBlankProject(title = 'Untitled Simulation'): SimulationProject {
  const now = Date.now();
  const starterHtml = `<!--
SIMULATION_METADATA
Title: ${title}
Subject: Physics
Topic: New Interactive Simulation
Difficulty: High School
Simulation Type: Interactive 3D Visualization

LEARNING_OBJECTIVES:
- Define the educational goal of this simulation via natural-language prompts.

PHYSICAL_MODEL:
- Awaiting prompt specification.

GOVERNING_EQUATIONS:
- Pending simulation generation.

INTERACTIVE_PARAMETERS:
- Pending simulation generation.

VISUAL_ELEMENTS:
- Empty Three.js studio stage

SIMULATION_CONTROLS:
- Orbit camera

AGENT_GUIDANCE:
- Replace this starter stage with the requested 3D physics simulation while maintaining all 10 numbered JavaScript sections.
-->
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
  <script type="importmap">
    {
      "imports": {
        "three": "https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js",
        "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/"
      }
    }
  </script>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body { width: 100%; height: 100%; overflow: hidden; background: #0b1120; color: #f8fafc; font-family: system-ui, sans-serif; }
    #stage-hint { position: fixed; top: 16px; left: 16px; padding: 10px 14px; background: rgba(15, 23, 42, 0.85); border: 1px solid rgba(148, 163, 184, 0.25); border-radius: 8px; font-size: 12px; color: #cbd5e1; }
  </style>
</head>
<body>
  <div id="stage-hint">${title} · Ready for AI simulation prompt</div>
  <script type="module">
    import * as THREE from 'three';
    import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

    // 1. SIMULATION CONFIGURATION
    const CONFIG = { background: 0x0b1120 };
    // 2. PHYSICAL CONSTANTS AND PARAMETERS
    const params = {};
    // 3. PHYSICS MODEL
    function updatePhysics() {}
    // 4. SCENE INITIALIZATION
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(CONFIG.background);
    const camera = new THREE.PerspectiveCamera(48, window.innerWidth / window.innerHeight, 0.1, 200);
    camera.position.set(8, 6, 12);
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(renderer.domElement);
    const controls = new OrbitControls(camera, renderer.domElement);
    // 5. VISUAL OBJECT CREATION
    scene.add(new THREE.GridHelper(20, 20, 0x38bdf8, 0x1e293b));
    // 6. SIMULATION STATE
    const simState = { running: false };
    // 7. ANIMATION AND PHYSICS UPDATE
    function updateVisualization() {}
    function animate() {
      requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    }
    // 8. USER INTERACTION
    window.addEventListener('resize', () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    });
    // 9. UI CONTROLS
    function setSimulationParameters() {}
    // 10. CLEANUP AND RESET
    function resetSimulation() {}
    animate();
  </script>
</body>
</html>`;

  const metadata = parseSimulationMetadata(starterHtml);
  const v1: SimulationVersion = {
    id: `ver-${now}`,
    versionNumber: 1,
    description: 'Empty 3D studio stage',
    html: starterHtml,
    createdAt: now,
    source: 'initial',
    metadata,
  };

  return {
    id: `proj-${now}`,
    title,
    subject: 'Physics',
    description: 'New physics simulation workspace.',
    currentHtml: starterHtml,
    versions: [v1],
    messages: [
      {
        id: `msg-${now}`,
        role: 'assistant',
        content:
          'New simulation workspace initialized. Describe the physics phenomenon, parameters, and visual elements you want students to explore.',
        createdAt: now,
        responseType: 'explanation',
        versionId: v1.id,
      },
    ],
    createdAt: now,
    updatedAt: now,
  };
}

export class LocalStorageRepository implements ProjectRepository {
  loadProjects(): SimulationProject[] {
    try {
      const raw = window.localStorage.getItem(PROJECTS_STORAGE_KEY);
      if (!raw) {
        const seeded = [createSeededProjectileProject()];
        this.saveProjects(seeded);
        return seeded;
      }
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
      const seeded = [createSeededProjectileProject()];
      this.saveProjects(seeded);
      return seeded;
    } catch {
      return [createSeededProjectileProject()];
    }
  }

  saveProjects(projects: SimulationProject[]): void {
    try {
      window.localStorage.setItem(PROJECTS_STORAGE_KEY, JSON.stringify(projects));
    } catch {
      // Ignore storage quota errors in restricted frames
    }
  }

  loadSettings(): StudioSettings {
    try {
      const raw = window.localStorage.getItem(SETTINGS_STORAGE_KEY);
      if (!raw) return DEFAULT_SETTINGS;
      return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
    } catch {
      return DEFAULT_SETTINGS;
    }
  }

  saveSettings(settings: StudioSettings): void {
    try {
      window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
    } catch {
      // Ignore storage errors
    }
  }
}

export function createNextVersion(
  project: SimulationProject,
  html: string,
  description: string,
  source: SimulationVersion['source']
): SimulationVersion {
  const maxNum = project.versions.reduce((acc, v) => Math.max(acc, v.versionNumber), 0);
  return {
    id: `ver-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    versionNumber: maxNum + 1,
    description,
    html,
    createdAt: Date.now(),
    source,
    metadata: parseSimulationMetadata(html),
  };
}
