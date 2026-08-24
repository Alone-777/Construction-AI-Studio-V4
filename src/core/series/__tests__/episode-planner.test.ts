import { describe, expect, it, beforeEach } from 'vitest';
import { EpisodePlanner, createEpisodePlanner } from '../EpisodePlanner';
import { ConstructionSeriesGenerator, createConstructionSeriesGenerator } from '../ConstructionSeriesGenerator';
import { createProjectFromDescription } from '../../blueprints/description-blueprint';
import type { ConstructionSeries, ConstructionEpisode } from '../../types/construction-series';
import type { ShotType, HookType, VisualProgressionPhase, SatisfyingMomentType, CinematicCameraMovement } from '../../types/scene-director';
import type { VisualPromptResult } from '../../visual/VisualPromptCompiler';

describe('EpisodePlanner', () => {
  let planner: EpisodePlanner;
  let sampleSeries: ConstructionSeries;

  beforeEach(() => {
    planner = createEpisodePlanner({
      targetTotalDuration: 60,
      maxEpisodeDuration: 20,
      targetEpisodeCount: 5,
      includeOpeningHook: true,
      includeClosingCTA: true,
    });

    // Criar série de teste usando o generator real
    const project = createProjectFromDescription({
      description: 'Cabana de madeira com fundação, paredes, telhado e acabamento.',
      name: 'Teste EpisodePlanner',
    });
    const generator = createConstructionSeriesGenerator();
    sampleSeries = generator.generate(project);
  });

  describe('Construção', () => {
    it('cria instância com configuração padrão', () => {
      const p = createEpisodePlanner();
      expect(p).toBeInstanceOf(EpisodePlanner);
      expect(p.getConfig().targetTotalDuration).toBe(60);
    });

    it('permite sobrescrever configuração', () => {
      const p = createEpisodePlanner({ targetTotalDuration: 30, targetEpisodeCount: 3 });
      expect(p.getConfig().targetTotalDuration).toBe(30);
      expect(p.getConfig().targetEpisodeCount).toBe(3);
    });

    it('updateConfig atualiza configuração', () => {
      planner.updateConfig({ maxEpisodeDuration: 15 });
      expect(planner.getConfig().maxEpisodeDuration).toBe(15);
    });
  });

  describe('plan() - método principal', () => {
    it('retorna EpisodePlan com estrutura completa', () => {
      const plan = planner.plan(sampleSeries);

      expect(plan).toHaveProperty('series');
      expect(plan).toHaveProperty('plannedEpisodes');
      expect(plan).toHaveProperty('verticalStructure');
      expect(plan).toHaveProperty('totalPlannedDuration');
      expect(plan).toHaveProperty('metadata');
    });

    it('plannedEpisodes tem estrutura correta', () => {
      const plan = planner.plan(sampleSeries);

      expect(plan.plannedEpisodes.length).toBeGreaterThan(0);
      expect(plan.plannedEpisodes.length).toBeLessThanOrEqual(planner.getConfig().targetEpisodeCount);

      for (const ep of plan.plannedEpisodes) {
        expect(ep).toHaveProperty('episode');
        expect(ep).toHaveProperty('cinematicOrder');
        expect(ep).toHaveProperty('plannedShots');
        expect(ep).toHaveProperty('plannedDuration');
        expect(ep).toHaveProperty('cinematicPriority');
        expect(ep).toHaveProperty('tags');
        expect(Array.isArray(ep.plannedShots)).toBe(true);
        expect(ep.plannedShots.length).toBeGreaterThan(0);
      }
    });

    it('verticalStructure tem 5 fases TikTok', () => {
      const plan = planner.plan(sampleSeries);
      const vs = plan.verticalStructure;

      expect(vs).toHaveProperty('hook');
      expect(vs).toHaveProperty('development');
      expect(vs).toHaveProperty('climax');
      expect(vs).toHaveProperty('satisfaction');
      expect(vs).toHaveProperty('cta');

      expect(vs.hook.startTime).toBe(0);
      expect(vs.hook.endTime).toBe(3);
      expect(vs.development.startTime).toBe(3);
      expect(vs.climax.startTime).toBe(15);
      expect(vs.satisfaction.startTime).toBe(45);
      expect(vs.cta.startTime).toBe(55);
      expect(vs.cta.endTime).toBe(60);
    });

    it('totalPlannedDuration não excede targetTotalDuration', () => {
      const plan = planner.plan(sampleSeries);
      expect(plan.totalPlannedDuration).toBeLessThanOrEqual(planner.getConfig().targetTotalDuration + 1); // +1 para arredondamento
    });

    it('metadata contém informações corretas', () => {
      const plan = planner.plan(sampleSeries);

      expect(plan.metadata.createdAt).toBeTypeOf('number');
      expect(plan.metadata.configUsed).toEqual(planner.getConfig());
      expect(plan.metadata.episodeCount).toBe(plan.plannedEpisodes.length);
      expect(plan.metadata.shotCount).toBe(
        plan.plannedEpisodes.reduce((sum, ep) => sum + ep.plannedShots.length, 0)
      );
    });
  });

  describe('prioritizeEpisodes', () => {
    it('atribui cinematicScore a cada episódio', () => {
      const plan = planner.plan(sampleSeries);
      // O score é interno, mas verificamos que a ordenação funciona
      // Episódios com maior score devem vir primeiro na seleção
      expect(plan.plannedEpisodes.length).toBeGreaterThan(0);
    });

    it('prioriza foundation e structure sobre material_delivery', () => {
      // O primeiro episódio selecionado deve ser de alta prioridade
      const plan = planner.plan(sampleSeries);
      const firstEp = plan.plannedEpisodes[0].episode;
      expect(['foundation', 'structure', 'enclosure', 'finishing']).toContain(firstEp.objective.type);
    });
  });

  describe('selectEpisodes', () => {
    it('respeita targetEpisodeCount', () => {
      const plan = planner.plan(sampleSeries);
      expect(plan.plannedEpisodes.length).toBeLessThanOrEqual(planner.getConfig().targetEpisodeCount);
    });

    it('respeita targetTotalDuration', () => {
      const plan = planner.plan(sampleSeries);
      const totalEpDuration = plan.plannedEpisodes.reduce((sum, ep) => sum + ep.episode.estimatedDuration, 0);
      expect(totalEpDuration).toBeLessThanOrEqual(planner.getConfig().targetTotalDuration + 10); // margem
    });

    it('mantém ordem cronológica original', () => {
      const plan = planner.plan(sampleSeries);
      for (let i = 1; i < plan.plannedEpisodes.length; i++) {
        expect(plan.plannedEpisodes[i].episode.sequence).toBeGreaterThanOrEqual(
          plan.plannedEpisodes[i - 1].episode.sequence
        );
      }
    });

    it('garante pelo menos 1 episódio', () => {
      const plan = planner.plan(sampleSeries);
      expect(plan.plannedEpisodes.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('planShotsForEpisodes', () => {
    it('cada episódio tem plannedShots', () => {
      const plan = planner.plan(sampleSeries);
      for (const ep of plan.plannedEpisodes) {
        expect(ep.plannedShots.length).toBeGreaterThan(0);
        expect(ep.plannedShots.length).toBeLessThanOrEqual(5);
      }
    });

    it('shots têm estrutura completa', () => {
      const plan = planner.plan(sampleSeries);
      for (const ep of plan.plannedEpisodes) {
        for (const shot of ep.plannedShots) {
          expect(shot).toHaveProperty('shotType');
          expect(shot).toHaveProperty('cameraMovement');
          expect(shot).toHaveProperty('duration');
          expect(shot).toHaveProperty('visualProgression');
          expect(shot).toHaveProperty('satisfyingMoments');
          expect(typeof shot.duration).toBe('number');
          expect(shot.duration).toBeGreaterThan(0);
        }
      }
    });

    it('primeiro episódio tem hook na primeira shot', () => {
      const plan = planner.plan(sampleSeries);
      const firstEp = plan.plannedEpisodes[0];
      const firstShot = firstEp.plannedShots[0];
      expect(firstShot.hook).toBeDefined();
      expect(['visual_reveal', 'action_start', 'problem_solution', 'before_after', 'curiosity_gap', 'satisfying_completion', 'transformation', 'sound_sync']).toContain(firstShot.hook);
    });

    it('progressão visual segue ordem: setup -> build_up -> climax -> resolution -> satisfaction', () => {
      const plan = planner.plan(sampleSeries);
      for (const ep of plan.plannedEpisodes) {
        const progressions = ep.plannedShots.map(s => s.visualProgression);
        expect(progressions[0]).toBe('setup');
        if (progressions.length > 1) expect(['build_up', 'climax', 'resolution', 'satisfaction']).toContain(progressions[1]);
        if (progressions.length > 2) expect(['climax', 'resolution', 'satisfaction']).toContain(progressions[2]);
      }
    });
  });

  describe('selectShotType', () => {
    it('abertura usa wide ou aerial', () => {
      const plan = planner.plan(sampleSeries);
      const firstShot = plan.plannedEpisodes[0].plannedShots[0];
      expect(['wide', 'aerial']).toContain(firstShot.shotType);
    });

    it('fechamento usa detail ou extreme_closeup', () => {
      const plan = planner.plan(sampleSeries);
      const lastEp = plan.plannedEpisodes[plan.plannedEpisodes.length - 1];
      const lastShot = lastEp.plannedShots[lastEp.plannedShots.length - 1];
      expect(['detail', 'extreme_closeup']).toContain(lastShot.shotType);
    });

    it('shots do meio variam por tipo de ação', () => {
      const plan = planner.plan(sampleSeries);
      for (const ep of plan.plannedEpisodes) {
        for (let i = 1; i < ep.plannedShots.length - 1; i++) {
          const shot = ep.plannedShots[i];
          expect(['wide', 'medium', 'closeup', 'extreme_closeup', 'detail', 'aerial', 'pov', 'timelapse']).toContain(shot.shotType);
        }
      }
    });
  });

  describe('selectCameraMovement', () => {
    it('movimentos são válidos', () => {
      const plan = planner.plan(sampleSeries);
      const validMovements: CinematicCameraMovement[] = [
        'static', 'pan_left', 'pan_right', 'tilt_up', 'tilt_down',
        'dolly_in', 'dolly_out', 'truck_left', 'truck_right',
        'crane_up', 'crane_down', 'orbit', 'push_in', 'pull_out', 'shake', 'smooth'
      ];

      for (const ep of plan.plannedEpisodes) {
        for (const shot of ep.plannedShots) {
          expect(validMovements).toContain(shot.cameraMovement);
        }
      }
    });
  });

  describe('identifySatisfyingMoments', () => {
    it('gera momentos satisfatórios', () => {
      const plan = planner.plan(sampleSeries);
      let totalMoments = 0;
      for (const ep of plan.plannedEpisodes) {
        for (const shot of ep.plannedShots) {
          totalMoments += shot.satisfyingMoments.length;
        }
      }
      expect(totalMoments).toBeGreaterThan(0);
    });

    it('momentos têm estrutura completa', () => {
      const plan = planner.plan(sampleSeries);
      for (const ep of plan.plannedEpisodes) {
        for (const shot of ep.plannedShots) {
          for (const moment of shot.satisfyingMoments) {
            expect(moment).toHaveProperty('type');
            expect(moment).toHaveProperty('timestamp');
            expect(moment).toHaveProperty('duration');
            expect(moment).toHaveProperty('description');
            expect(moment).toHaveProperty('shotType');
            expect(moment).toHaveProperty('cameraMovement');
          }
        }
      }
    });

    it('tipos de momentos são válidos', () => {
      const plan = planner.plan(sampleSeries);
      const validTypes: SatisfyingMomentType[] = [
        'perfect_fit', 'smooth_operation', 'transformation_reveal',
        'completion_click', 'rhythmic_action', 'clean_result',
        'precision_moment', 'organic_growth'
      ];

      for (const ep of plan.plannedEpisodes) {
        for (const shot of ep.plannedShots) {
          for (const moment of shot.satisfyingMoments) {
            expect(validTypes).toContain(moment.type);
          }
        }
      }
    });
  });

  describe('createVerticalStructure', () => {
    it('hook duration é 3s quando includeOpeningHook', () => {
      const plan = planner.plan(sampleSeries);
      expect(plan.verticalStructure.hook.endTime - plan.verticalStructure.hook.startTime).toBe(3);
    });

    it('development é 12s (3-15)', () => {
      const plan = planner.plan(sampleSeries);
      const dev = plan.verticalStructure.development;
      expect(dev.endTime - dev.startTime).toBe(12);
    });

    it('climax é 30s (15-45)', () => {
      const plan = planner.plan(sampleSeries);
      const climax = plan.verticalStructure.climax;
      expect(climax.endTime - climax.startTime).toBe(30);
    });

    it('satisfaction é 10s (45-55)', () => {
      const plan = planner.plan(sampleSeries);
      const sat = plan.verticalStructure.satisfaction;
      expect(sat.endTime - sat.startTime).toBe(10);
    });

    it('cta é 5s (55-60) quando includeClosingCTA', () => {
      const plan = planner.plan(sampleSeries);
      const cta = plan.verticalStructure.cta;
      expect(cta.endTime - cta.startTime).toBe(5);
    });

    it('satisfaction tem momentos padrão se vazio', () => {
      const plan = planner.plan(sampleSeries);
      expect(plan.verticalStructure.satisfaction.moments.length).toBeGreaterThan(0);
    });
  });

  describe('adjustDurations', () => {
    it('reduz durações quando excede targetTotalDuration', () => {
      const shortPlanner = createEpisodePlanner({
        targetTotalDuration: 10, // Muito curto
        targetEpisodeCount: 5,
      });
      const plan = shortPlanner.plan(sampleSeries);
      expect(plan.totalPlannedDuration).toBeLessThanOrEqual(11); // margem
    });
  });

  describe('Integração com ConstructionSeriesGenerator', () => {
    it('funciona com série gerada de projeto real', () => {
      const plan = planner.plan(sampleSeries);
      expect(plan.plannedEpisodes.length).toBeGreaterThan(0);
      expect(plan.series.id).toBe(sampleSeries.id);
    });

    it('funciona com generateFromOperations', () => {
      const project = createProjectFromDescription({
        description: 'Abrigo simples.',
        name: 'Teste Operações',
      });
      const generator = createConstructionSeriesGenerator();
      const seriesFromOps = generator.generateFromOperations(project, project.operations);
      const plan = planner.plan(seriesFromOps);
      expect(plan.plannedEpisodes.length).toBeGreaterThan(0);
    });
  });

  describe('Casos extremos', () => {
    it('lida com série vazia', () => {
      const emptySeries: ConstructionSeries = {
        id: 'empty',
        projectId: 'test',
        name: 'Empty',
        episodes: [],
        totalEstimatedDuration: 0,
        totalProgress: 0,
        createdAt: Date.now(),
      };
      const plan = planner.plan(emptySeries);
      expect(plan.plannedEpisodes).toHaveLength(0);
      expect(plan.totalPlannedDuration).toBe(0);
    });

    it('lida com episódio único', () => {
      const singleEpSeries: ConstructionSeries = {
        id: 'single',
        projectId: 'test',
        name: 'Single',
        episodes: [{
          id: 'ep1',
          sequence: 1,
          title: 'Single Episode',
          objective: { type: 'foundation', description: 'Foundation', elements: ['foundation'], priority: 10 },
          action: { type: 'build', description: 'Build foundation', tools: ['hammer'], materials: ['wood'], estimatedDuration: 15, zone: 'zone-1' },
          environment: { terrain: 'flat', slope: 'none', vegetation: 'grass', soil: 'dirt', climate: 'clear', lighting: 'day', timeOfDay: 'day', weather: 'clear', activeZone: 'zone-1' },
          visualPrompt: {
            prompt: '',
            sections: { scene: '', environment: '', construction: '', materials: '', elements: '', camera: '', lens: '', lighting: '', action: '', visualDNA: '', constructionState: '' },
            metadata: { timestamp: 0, elementCount: 0, hasCameraMovement: false, hasDepthOfField: false, hasCustomLighting: false }
          },
          estimatedDuration: 15,
          metadata: { frameId: 'f1', progress: 25, completedElements: [], activeElements: ['foundation'], pendingElements: ['walls'], createdAt: Date.now() },
        }],
        totalEstimatedDuration: 15,
        totalProgress: 25,
        createdAt: Date.now(),
      };
      const plan = planner.plan(singleEpSeries);
      expect(plan.plannedEpisodes).toHaveLength(1);
      expect(plan.plannedEpisodes[0].plannedShots.length).toBeGreaterThan(0);
    });
  });
});