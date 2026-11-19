import type { SimulationMetadata } from '../types/simulation.ts';

const KEY_VALUE_FIELDS: Array<{ key: string; prop: keyof SimulationMetadata }> = [
  { key: 'Title', prop: 'title' },
  { key: 'Subject', prop: 'subject' },
  { key: 'Topic', prop: 'topic' },
  { key: 'Difficulty', prop: 'difficulty' },
  { key: 'Simulation Type', prop: 'simulationType' },
];

const LIST_SECTIONS: Array<{ header: string; prop: keyof SimulationMetadata }> = [
  { header: 'LEARNING_OBJECTIVES', prop: 'learningObjectives' },
  { header: 'PHYSICAL_MODEL', prop: 'physicalModel' },
  { header: 'GOVERNING_EQUATIONS', prop: 'governingEquations' },
  { header: 'INTERACTIVE_PARAMETERS', prop: 'interactiveParameters' },
  { header: 'VISUAL_ELEMENTS', prop: 'visualElements' },
  { header: 'SIMULATION_CONTROLS', prop: 'simulationControls' },
  { header: 'AGENT_GUIDANCE', prop: 'agentGuidance' },
];

export const EXPECTED_JS_SECTIONS: Array<{ number: number; title: string }> = [
  { number: 1, title: 'SIMULATION CONFIGURATION' },
  { number: 2, title: 'PHYSICAL CONSTANTS AND PARAMETERS' },
  { number: 3, title: 'PHYSICS MODEL' },
  { number: 4, title: 'SCENE INITIALIZATION' },
  { number: 5, title: 'VISUAL OBJECT CREATION' },
  { number: 6, title: 'SIMULATION STATE' },
  { number: 7, title: 'ANIMATION AND PHYSICS UPDATE' },
  { number: 8, title: 'USER INTERACTION' },
  { number: 9, title: 'UI CONTROLS' },
  { number: 10, title: 'CLEANUP AND RESET' },
];

export const EXPECTED_WALKTHROUGH_SECTIONS: string[] = [
  'SIMULATION_METADATA',
  'PHYSICAL_MODEL',
  'SIMULATION_STATE_SCHEMA',
  'SIMULATION_API',
  'WALKTHROUGH_METADATA',
  'WALKTHROUGH_TRANSCRIPT',
  'WALKTHROUGH_SEGMENTS',
  'WALKTHROUGH_HIGHLIGHT_TARGETS',
  'WALKTHROUGH_STATE_CHECKPOINTS',
  'WALKTHROUGH_INTERACTION_HISTORY',
  'WALKTHROUGH_PLAYBACK_ENGINE',
];

export function detectPresentSections(html: string): number[] {
  const present: number[] = [];
  for (const section of EXPECTED_JS_SECTIONS) {
    const pattern = new RegExp(`(?:\\/\\/|\\/\\*|#)\\s*${section.number}\\.\\s*${section.title}`, 'i');
    if (pattern.test(html)) {
      present.push(section.number);
    }
  }
  return present;
}

export function detectWalkthroughDocSections(html: string): string[] {
  return EXPECTED_WALKTHROUGH_SECTIONS.filter((sec) => new RegExp(`\\b${sec}\\b`).test(html));
}

export function countWalkthroughSegments(html: string): number {
  const configMatch = html.match(/WALKTHROUGH_CONFIG\s*=\s*\{[\s\S]*?segments\s*:\s*\[([\s\S]*?)\]\s*,?\s*\}/);
  if (!configMatch?.[1]) return 0;
  const idMatches = configMatch[1].match(/\bid\s*:\s*['"][^'"]+['"]/g);
  return idMatches ? idMatches.length : 0;
}

export function extractWalkthroughTitle(html: string): string | undefined {
  const match = html.match(/WALKTHROUGH_CONFIG\s*=\s*\{[\s\S]*?\btitle\s*:\s*['"]([^'"]+)['"]/);
  return match?.[1]?.trim();
}

export function parseSimulationMetadata(html: string): SimulationMetadata {
  const walkthroughSegmentCount = countWalkthroughSegments(html);
  const walkthroughDocSections = detectWalkthroughDocSections(html);
  const metadata: SimulationMetadata = {
    title: 'Untitled Simulation',
    subject: 'Physics',
    topic: 'General',
    difficulty: 'High School',
    simulationType: 'Interactive 3D Visualization',
    learningObjectives: [],
    physicalModel: [],
    governingEquations: [],
    interactiveParameters: [],
    visualElements: [],
    simulationControls: [],
    agentGuidance: [],
    hasStructuredHeader: false,
    presentSections: detectPresentSections(html),
    hasWalkthrough: /WALKTHROUGH_CONFIG/.test(html),
    walkthroughTitle: extractWalkthroughTitle(html),
    walkthroughSegmentCount,
    hasSimulationApi: /window\.simulationAPI\b/.test(html),
    walkthroughDocSections,
  };

  const commentMatch = html.match(/<!--[\s\S]*?SIMULATION_METADATA([\s\S]*?)-->/);
  if (!commentMatch) {
    const titleTagMatch = html.match(/<title>([^<]+)<\/title>/i);
    if (titleTagMatch?.[1]) {
      metadata.title = titleTagMatch[1].trim();
    }
    return metadata;
  }

  metadata.hasStructuredHeader = true;
  const block = commentMatch[1];
  const lines = block.split(/\r?\n/);

  let currentListProp: keyof SimulationMetadata | null = null;
  let inPreamble = true;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    const matchedSection = LIST_SECTIONS.find((sec) => line.startsWith(`${sec.header}:`));
    if (matchedSection) {
      currentListProp = matchedSection.prop;
      inPreamble = false;
      continue;
    }

    // Any other uppercase metadata section header (e.g. SIMULATION_STATE_SCHEMA:, WALKTHROUGH_METADATA:, WALKTHROUGH_TRANSCRIPT:)
    if (/^[A-Z][A-Z0-9_]+:/.test(line)) {
      currentListProp = null;
      inPreamble = false;
      continue;
    }

    if (line.startsWith('-') && currentListProp) {
      const item = line.replace(/^-\s*/, '').trim();
      if (item) {
        (metadata[currentListProp] as string[]).push(item);
      }
      continue;
    }

    if (inPreamble) {
      const matchedField = KEY_VALUE_FIELDS.find((f) => line.startsWith(`${f.key}:`));
      if (matchedField) {
        currentListProp = null;
        const value = line.slice(matchedField.key.length + 1).trim();
        if (value) {
          (metadata[matchedField.prop] as string) = value;
        }
      }
    }
  }

  return metadata;
}
