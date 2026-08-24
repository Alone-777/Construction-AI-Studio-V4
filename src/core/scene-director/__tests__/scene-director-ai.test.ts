import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SceneDirectorAI, createSceneDirectorAI } from '../SceneDirectorAI';
import {
  ShotType,
  CinematicCameraMovement,
  HookType,
  VisualProgressionPhase,
  SatisfyingMomentType,
  CinematicScene,
  SceneDirectorConfig,
} from '../../types/scene-director';
import { ConstructionEpisode } from '../../types/construction-series';
import { EpisodeObjective, EpisodeAction, EpisodeEnvironment, EpisodeMetadata } from '../../types/construction-series';
import { VisualPromptResult } from '../../visual/VisualPromptCompiler';

// Mock VisualPromptResult
const mockVisualPromptResult: VisualPromptResult = {
  prompt: 'Test visual prompt',
  sections: {
    scene: 'SCENE: Test',
    environment: 'ENV: test',
    construction: 'CONSTRUCTION: test',
    materials: 'MATERIALS: test',
    elements: 'ELEMENTS: test',
    camera: 'CAMERA: test',
    lens: 'LENS: test',
    lighting: 'LIGHTING: test',
    action: 'ACTION: test',
    visualDNA: 'VISUAL_DNA: test',
    constructionState: 'STATE: test',
  },
  metadata: {
    timestamp: Date.now(),
    elementCount: 1,
    hasCameraMovement: false,
    hasDepthOfField: false,
    hasCustomLighting: false,
  },
};

function createMockEpisode(overrides: Partial<ConstructionEpisode> = {}): ConstructionEpisode {
  return {
    id: 'episode-1',
    sequence: 1,
    title: 'Episódio 1: Fundação',
    objective: {
      type: 'foundation',
      description: 'Estabelecer fundação e base da construção',
      elements: ['foundation', 'footings'],
      priority: 10,
    } as EpisodeObjective,
    action: {
      type: 'build',
      description: 'Construir fundação',
      tools: ['excavator', 'concrete_mixer'],
      materials: ['concrete', 'rebar'],
      estimatedDuration: 15,
      zone: 'zone-1',
    } as EpisodeAction,
    environment: {
      terrain: 'flat',
      slope: 'none',
      vegetation: 'grass',
      soil: 'dirt',
      climate: 'flat',
      lighting: 'day',
      timeOfDay: 'day',
      weather: 'clear',
      activeZone: 'zone-1',
    } as EpisodeEnvironment,
    visualPrompt: mockVisualPromptResult,
    estimatedDuration: 25,
    metadata: {
      frameId: 'frame-1',
      progress: 10,
      completedElements: [],
      activeElements: ['foundation'],
      pendingElements: ['walls', 'roof'],
      createdAt: Date.now(),
    } as EpisodeMetadata,
    ...overrides,
  };
}

describe('SceneDirectorAI', () => {
  let director: SceneDirectorAI;

  beforeEach(() => {
    director = createSceneDirectorAI();
  });

  describe('constructor and config', () => {
    it('should create director with default config', () => {
      expect(director).toBeInstanceOf(SceneDirectorAI);
      const config = director.getConfig();
      expect(config.targetDuration).toBe(60);
      expect(config.aspectRatio).toBe('9:16');
      expect(config.hookDuration).toBe(3);
      expect(config.shotsPerEpisode).toBe(3);
    });

    it('should create director with custom config', () => {
      const customDirector = createSceneDirectorAI({
        targetDuration: 30,
        shotsPerEpisode: 5,
        cameraMovementIntensity: 10,
      });
      const config = customDirector.getConfig();
      expect(config.targetDuration).toBe(30);
      expect(config.shotsPerEpisode).toBe(5);
      expect(config.cameraMovementIntensity).toBe(10);
    });

    it('should update config', () => {
      director.updateConfig({ targetDuration: 45, hookDuration: 2 });
      const config = director.getConfig();
      expect(config.targetDuration).toBe(45);
      expect(config.hookDuration).toBe(2);
    });
  });

  describe('direct() - single episode', () => {
    it('should generate cinematic scenes for an episode', () => {
      const episode = createMockEpisode();
      const scenes = director.direct(episode);

      expect(scenes).toBeInstanceOf(Array);
      expect(scenes.length).toBe(3); // default shotsPerEpisode
    });

    it('should generate scenes with correct structure', () => {
      const episode = createMockEpisode();
      const scenes = director.direct(episode);

      for (const scene of scenes) {
        expect(scene.id).toBeDefined();
        expect(scene.episodeId).toBe(episode.id);
        expect(scene.sequence).toBeGreaterThan(0);
        expect(scene.shotType).toBeDefined();
        expect(scene.cameraMovement).toBeDefined();
        expect(scene.duration).toBeGreaterThan(0);
        expect(scene.visualProgression).toBeDefined();
        expect(scene.satisfyingMoments).toBeInstanceOf(Array);
        expect(scene.prompt).toBeDefined();
        expect(typeof scene.prompt).toBe('string');
        expect(scene.metadata).toBeDefined();
        expect(scene.metadata.objectiveType).toBe(episode.objective.type);
        expect(scene.metadata.actionType).toBe(episode.action.type);
      }
    });

    it('should include hook only on first scene', () => {
      const episode = createMockEpisode();
      const scenes = director.direct(episode);

      expect(scenes[0].hook).toBeDefined();
      expect(scenes[1].hook).toBeUndefined();
      expect(scenes[2].hook).toBeUndefined();
    });

    it('should include verticalStructure only on first scene', () => {
      const episode = createMockEpisode();
      const scenes = director.direct(episode);

      expect(scenes[0].verticalStructure).toBeDefined();
      expect(scenes[1].verticalStructure).toBeUndefined();
      expect(scenes[2].verticalStructure).toBeUndefined();
    });

    it('should have valid verticalStructure with all phases', () => {
      const episode = createMockEpisode();
      const scenes = director.direct(episode);
      const structure = scenes[0].verticalStructure!;

      expect(structure.hook).toBeDefined();
      expect(structure.development).toBeDefined();
      expect(structure.climax).toBeDefined();
      expect(structure.satisfaction).toBeDefined();
      expect(structure.cta).toBeDefined();

      expect(structure.hook.startTime).toBe(0);
      expect(structure.hook.endTime).toBe(3);
      expect(structure.cta.endTime).toBe(60);
    });

    it('should have correct visual progression phases', () => {
      const episode = createMockEpisode();
      const scenes = director.direct(episode);

      expect(scenes[0].visualProgression).toBe('setup');
      expect(scenes[1].visualProgression).toBe('build_up');
      expect(scenes[2].visualProgression).toBe('climax');
    });

    it('should generate satisfying moments', () => {
      const episode = createMockEpisode();
      const scenes = director.direct(episode);

      const allMoments = scenes.flatMap(s => s.satisfyingMoments);
      expect(allMoments.length).toBeGreaterThan(0);

      for (const moment of allMoments) {
        expect(moment.type).toBeDefined();
        expect(moment.timestamp).toBeGreaterThanOrEqual(0);
        expect(moment.duration).toBeGreaterThan(0);
        expect(moment.description).toBeDefined();
        expect(moment.shotType).toBeDefined();
        expect(moment.cameraMovement).toBeDefined();
      }
    });

    it('should adjust shotsPerEpisode from config', () => {
      const customDirector = createSceneDirectorAI({ shotsPerEpisode: 5 });
      const episode = createMockEpisode();
      const scenes = customDirector.direct(episode);

      expect(scenes.length).toBe(5);
    });

    it('should calculate shot duration correctly', () => {
      const customDirector = createSceneDirectorAI({ targetDuration: 30, shotsPerEpisode: 3 });
      const episode = createMockEpisode();
      const scenes = customDirector.direct(episode);

      for (const scene of scenes) {
        expect(scene.duration).toBe(10); // 30 / 3
      }
    });

    it('should include episode metadata in scene metadata', () => {
      const episode = createMockEpisode({ sequence: 2 });
      const scenes = director.direct(episode);

      expect(scenes[0].metadata.objectiveType).toBe('foundation');
      expect(scenes[0].metadata.actionType).toBe('build');
      expect(scenes[0].metadata.element).toBe('foundation');
      expect(scenes[0].metadata.zone).toBe('zone-1');
      expect(scenes[0].metadata.progress).toBe(10);
    });
  });

  describe('generateHook()', () => {
    it('should return visual_reveal for first episode at progress 0', () => {
      const episode = createMockEpisode({ sequence: 1, metadata: { ...createMockEpisode().metadata, progress: 0 } });
      const hook = director.generateHook(episode);
      expect(hook).toBe('visual_reveal');
    });

    it('should return before_after for first episode with progress', () => {
      const episode = createMockEpisode({ sequence: 1, metadata: { ...createMockEpisode().metadata, progress: 20 } });
      const hook = director.generateHook(episode);
      expect(hook).toBe('before_after');
    });

    it('should return action_start for foundation objective', () => {
      const episode = createMockEpisode({ sequence: 2, objective: { ...createMockEpisode().objective, type: 'foundation' } });
      const hook = director.generateHook(episode);
      expect(hook).toBe('action_start');
    });

    it('should return curiosity_gap for inspect action', () => {
      const episode = createMockEpisode({ sequence: 2, objective: { ...createMockEpisode().objective, type: 'structure' }, action: { ...createMockEpisode().action, type: 'inspect' } });
      const hook = director.generateHook(episode);
      expect(hook).toBe('curiosity_gap');
    });

    it('should return satisfying_completion for finishing objective', () => {
      const episode = createMockEpisode({ sequence: 2, objective: { ...createMockEpisode().objective, type: 'finishing' } });
      const hook = director.generateHook(episode);
      expect(hook).toBe('satisfying_completion');
    });

    it('should return transformation when more completed than active', () => {
      const episode = createMockEpisode({
        sequence: 2,
        objective: { ...createMockEpisode().objective, type: 'structure' },
        metadata: { ...createMockEpisode().metadata, completedElements: ['foundation', 'walls'], activeElements: ['roof'] }
      });
      const hook = director.generateHook(episode);
      expect(hook).toBe('transformation');
    });

    it('should return problem_solution as default', () => {
      const episode = createMockEpisode({ sequence: 2, objective: { ...createMockEpisode().objective, type: 'structure' } });
      const hook = director.generateHook(episode);
      expect(hook).toBe('problem_solution');
    });
  });

  describe('planVisualProgression()', () => {
    it('should return correct progression for 3 shots', () => {
      const episode = createMockEpisode();
      const progression = director.planVisualProgression(episode, 3);

      expect(progression).toEqual(['setup', 'build_up', 'climax']);
    });

    it('should return correct progression for 5 shots', () => {
      const episode = createMockEpisode();
      const progression = director.planVisualProgression(episode, 5);

      expect(progression).toEqual(['setup', 'build_up', 'climax', 'resolution', 'satisfaction']);
    });

    it('should cap at 5 phases for more shots', () => {
      const episode = createMockEpisode();
      const progression = director.planVisualProgression(episode, 7);

      expect(progression).toEqual(['setup', 'build_up', 'climax', 'resolution', 'satisfaction', 'satisfaction', 'satisfaction']);
    });
  });

  describe('identifySatisfyingMoments()', () => {
    it('should identify perfect_fit for build action with completed elements', () => {
      const episode = createMockEpisode({
        metadata: { ...createMockEpisode().metadata, completedElements: ['foundation'] }
      });
      const moments = director.identifySatisfyingMoments(episode);

      const perfectFit = moments.find(m => m.type === 'perfect_fit');
      expect(perfectFit).toBeDefined();
      expect(perfectFit!.shotType).toBe('closeup');
      expect(perfectFit!.cameraMovement).toBe('push_in');
    });

    it('should identify smooth_operation for build action', () => {
      const episode = createMockEpisode({ action: { ...createMockEpisode().action, type: 'build' } });
      const moments = director.identifySatisfyingMoments(episode);

      const smoothOp = moments.find(m => m.type === 'smooth_operation');
      expect(smoothOp).toBeDefined();
      expect(smoothOp!.shotType).toBe('medium');
      expect(smoothOp!.cameraMovement).toBe('smooth');
    });

    it('should identify transformation_reveal when both completed and active exist', () => {
      const episode = createMockEpisode({
        metadata: { ...createMockEpisode().metadata, completedElements: ['foundation'], activeElements: ['walls'] }
      });
      const moments = director.identifySatisfyingMoments(episode);

      const transform = moments.find(m => m.type === 'transformation_reveal');
      expect(transform).toBeDefined();
      expect(transform!.shotType).toBe('wide');
      expect(transform!.cameraMovement).toBe('crane_up');
    });

    it('should identify completion_click when completed elements exist', () => {
      const episode = createMockEpisode({
        metadata: { ...createMockEpisode().metadata, completedElements: ['foundation'] }
      });
      const moments = director.identifySatisfyingMoments(episode);

      const click = moments.find(m => m.type === 'completion_click');
      expect(click).toBeDefined();
      expect(click!.shotType).toBe('extreme_closeup');
      expect(click!.cameraMovement).toBe('static');
    });

    it('should identify rhythmic_action for build action', () => {
      const episode = createMockEpisode({ action: { ...createMockEpisode().action, type: 'build' } });
      const moments = director.identifySatisfyingMoments(episode);

      const rhythmic = moments.find(m => m.type === 'rhythmic_action');
      expect(rhythmic).toBeDefined();
    });

    it('should identify clean_result for finishing objective', () => {
      const episode = createMockEpisode({ objective: { ...createMockEpisode().objective, type: 'finishing' } });
      const moments = director.identifySatisfyingMoments(episode);

      const clean = moments.find(m => m.type === 'clean_result');
      expect(clean).toBeDefined();
      expect(clean!.shotType).toBe('detail');
    });

    it('should identify precision_moment for inspect action', () => {
      const episode = createMockEpisode({ action: { ...createMockEpisode().action, type: 'inspect' } });
      const moments = director.identifySatisfyingMoments(episode);

      const precision = moments.find(m => m.type === 'precision_moment');
      expect(precision).toBeDefined();
      expect(precision!.shotType).toBe('extreme_closeup');
    });

    it('should identify organic_growth for structure/enclosure with timelapse enabled', () => {
      const episode = createMockEpisode({ objective: { ...createMockEpisode().objective, type: 'structure' } });
      const moments = director.identifySatisfyingMoments(episode);

      const growth = moments.find(m => m.type === 'organic_growth');
      expect(growth).toBeDefined();
      expect(growth!.shotType).toBe('timelapse');
    });

    it('should not identify organic_growth when timelapse disabled', () => {
      const noTimelapseDirector = createSceneDirectorAI({ includeTimelapse: false });
      const episode = createMockEpisode({ objective: { ...createMockEpisode().objective, type: 'structure' } });
      const moments = noTimelapseDirector.identifySatisfyingMoments(episode);

      const growth = moments.find(m => m.type === 'organic_growth');
      expect(growth).toBeUndefined();
    });
  });

  describe('createVerticalStructure()', () => {
    it('should create structure with correct timing', () => {
      const episode = createMockEpisode();
      const hook = director.generateHook(episode);
      const moments = director.identifySatisfyingMoments(episode);
      const structure = director.createVerticalStructure(60, hook, moments);

      expect(structure.hook.startTime).toBe(0);
      expect(structure.hook.endTime).toBe(3);
      expect(structure.development.startTime).toBe(3);
      expect(structure.development.endTime).toBe(15);
      expect(structure.climax.startTime).toBe(15);
      expect(structure.climax.endTime).toBe(45);
      expect(structure.satisfaction.startTime).toBe(45);
      expect(structure.satisfaction.endTime).toBe(55);
      expect(structure.cta.startTime).toBe(55);
      expect(structure.cta.endTime).toBe(60);
    });

    it('should include satisfaction moments in structure', () => {
      const episode = createMockEpisode();
      const hook = director.generateHook(episode);
      const moments = director.identifySatisfyingMoments(episode);
      const structure = director.createVerticalStructure(60, hook, moments);

      expect(structure.satisfaction.moments.length).toBeGreaterThan(0);
    });
  });

  describe('directSeries()', () => {
    it('should direct multiple episodes in sequence', () => {
      const episodes = [
        createMockEpisode({ id: 'ep-1', sequence: 1 }),
        createMockEpisode({ id: 'ep-2', sequence: 2 }),
        createMockEpisode({ id: 'ep-3', sequence: 3 }),
      ];

      const allScenes = director.directSeries(episodes);

      expect(allScenes.length).toBe(9); // 3 episodes * 3 shots
      expect(allScenes[0].episodeId).toBe('ep-1');
      expect(allScenes[3].episodeId).toBe('ep-2');
      expect(allScenes[6].episodeId).toBe('ep-3');
    });

    it('should have globally sequential numbering', () => {
      const episodes = [
        createMockEpisode({ id: 'ep-1', sequence: 1 }),
        createMockEpisode({ id: 'ep-2', sequence: 2 }),
      ];

      const allScenes = director.directSeries(episodes);

      for (let i = 0; i < allScenes.length; i++) {
        expect(allScenes[i].sequence).toBe(i + 1);
      }
    });
  });

  describe('shot type selection', () => {
    it('should select wide for early progress establishing shot', () => {
      const episode = createMockEpisode({ metadata: { ...createMockEpisode().metadata, progress: 5 } });
      const scenes = director.direct(episode);
      expect(scenes[0].shotType).toBe('wide');
    });

    it('should select aerial for mid progress establishing shot', () => {
      const episode = createMockEpisode({ metadata: { ...createMockEpisode().metadata, progress: 30 } });
      const scenes = director.direct(episode);
      expect(scenes[0].shotType).toBe('aerial');
    });

    it('should select closeup for build action shot', () => {
      const episode = createMockEpisode({ action: { ...createMockEpisode().action, type: 'build' } });
      const scenes = director.direct(episode);
      expect(scenes[1].shotType).toBe('closeup');
    });

    it('should select extreme_closeup for inspect action shot', () => {
      const episode = createMockEpisode({ action: { ...createMockEpisode().action, type: 'inspect' } });
      const scenes = director.direct(episode);
      expect(scenes[1].shotType).toBe('extreme_closeup');
    });

    it('should select detail for finishing objective climax', () => {
      const episode = createMockEpisode({ objective: { ...createMockEpisode().objective, type: 'finishing' } });
      const scenes = director.direct(episode);
      expect(scenes[2].shotType).toBe('detail');
    });
  });

  describe('prompt generation', () => {
    it('should generate prompt with all required components', () => {
      const episode = createMockEpisode();
      const scenes = director.direct(episode);

      for (const scene of scenes) {
        const prompt = scene.prompt;
        expect(prompt).toContain('shot');
        expect(prompt).toContain('camera movement');
        expect(prompt).toContain('construction:');
        expect(prompt).toContain('action:');
        expect(prompt).toContain('zone:');
        expect(prompt).toContain('progress:');
        expect(prompt).toContain('aspect ratio: 9:16');
        expect(prompt).toContain('cinematic');
        expect(prompt).toContain('TikTok vertical video style');
      }
    });

    it('should include hook description in first scene prompt', () => {
      const episode = createMockEpisode();
      const scenes = director.direct(episode);

      expect(scenes[0].prompt).toContain('hook:');
    });

    it('should include elements in prompt when present', () => {
      const episode = createMockEpisode({ objective: { ...createMockEpisode().objective, elements: ['foundation', 'footings'] } });
      const scenes = director.direct(episode);

      expect(scenes[0].prompt).toContain('focus on: foundation, footings');
    });

    it('should include tools in prompt when present', () => {
      const episode = createMockEpisode({ action: { ...createMockEpisode().action, tools: ['excavator', 'concrete_mixer'] } });
      const scenes = director.direct(episode);

      expect(scenes[0].prompt).toContain('tools: excavator, concrete_mixer');
    });
  });
});

describe('SceneDirectorStage integration', () => {
  it('should be importable', async () => {
    // This test ensures the module can be imported without errors
    const { SceneDirectorStage, createSceneDirectorStage } = await import('../../engines/pipeline/scene-director/SceneDirectorStage');
    expect(SceneDirectorStage).toBeDefined();
    expect(createSceneDirectorStage).toBeDefined();
  });
});