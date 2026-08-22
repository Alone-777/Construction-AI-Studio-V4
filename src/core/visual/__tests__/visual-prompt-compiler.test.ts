import { describe, expect, it } from 'vitest';
import { createCabanaDoRiachoProject } from '../../demo/cabana-do-riacho';
import { worldStateToVisualSceneState } from '../../visual/VisualSceneState';
import { compileVisualScene, compileVisualSceneShort, compileVisualSceneCompositionOnly, type VisualPromptResult } from '../../visual/VisualPromptCompiler';

describe('VisualPromptCompiler - Cabana do Riacho', () => {
  const project = createCabanaDoRiachoProject();
  const worldState = project.worldState;
  const visualSceneState = worldStateToVisualSceneState(worldState);

  it('compila prompt completo a partir do estado visual', () => {
    const result = compileVisualScene(visualSceneState);

    expect(result).toBeDefined();
    expect(result.prompt).toBeTypeOf('string');
    expect(result.prompt.length).toBeGreaterThan(0);
    expect(result.sections).toBeDefined();
    expect(result.metadata).toBeDefined();
  });

  it('prompt contém referência à cabana', () => {
    const result = compileVisualScene(visualSceneState);

    expect(result.prompt.toLowerCase()).toContain('cabana');
  });

  it('prompt contém referência a madeira (material principal)', () => {
    const result = compileVisualScene(visualSceneState);

    expect(result.prompt.toLowerCase()).toContain('madeira');
  });

  it('prompt contém configuração de câmera', () => {
    const result = compileVisualScene(visualSceneState);

    expect(result.prompt.toLowerCase()).toContain('camera');
    expect(result.prompt.toLowerCase()).toContain('position');
  });

  it('prompt contém configuração de lente', () => {
    const result = compileVisualScene(visualSceneState);

    expect(result.prompt.toLowerCase()).toContain('focal');
    expect(result.prompt.toLowerCase()).toContain('aperture');
  });

  it('prompt contém configuração de iluminação', () => {
    const result = compileVisualScene(visualSceneState);

    expect(result.prompt.toLowerCase()).toContain('type: natural');
    expect(result.prompt.toLowerCase()).toContain('key:');
  });

  it('prompt contém ação na cena', () => {
    const result = compileVisualScene(visualSceneState);

    expect(result.prompt.toLowerCase()).toContain('action');
  });

  it('prompt contém ambiente (riacho)', () => {
    const result = compileVisualScene(visualSceneState);

    expect(result.prompt.toLowerCase()).toContain('riacho');
  });

  it('metadados de compilação estão corretos', () => {
    const result = compileVisualScene(visualSceneState);

    expect(result.metadata.timestamp).toBeGreaterThan(0);
    expect(result.metadata.elementCount).toBe(visualSceneState.elements.length);
    expect(result.metadata.hasCameraMovement).toBe(false); // Câmera FIXA por padrão
    expect(result.metadata.hasDepthOfField).toBe(false); // Depth of field desabilitado por padrão
  });

  it('todas as seções estão presentes no resultado', () => {
    const result = compileVisualScene(visualSceneState);

    expect(result.sections.scene).toBeTypeOf('string');
    expect(result.sections.environment).toBeTypeOf('string');
    expect(result.sections.construction).toBeTypeOf('string');
    expect(result.sections.materials).toBeTypeOf('string');
    expect(result.sections.elements).toBeTypeOf('string');
    expect(result.sections.camera).toBeTypeOf('string');
    expect(result.sections.lens).toBeTypeOf('string');
    expect(result.sections.lighting).toBeTypeOf('string');
    expect(result.sections.action).toBeTypeOf('string');
  });

  it('seção de cena contém título e localização', () => {
    const result = compileVisualScene(visualSceneState);

    expect(result.sections.scene).toContain('SCENE');
    expect(result.sections.scene).toContain('LOCATION');
    expect(result.sections.scene).toContain('TIME');
    expect(result.sections.scene).toContain('WEATHER');
  });

  it('seção de construção contém progresso e componentes', () => {
    const result = compileVisualScene(visualSceneState);

    expect(result.sections.construction).toContain('CONSTRUCTION');
    expect(result.sections.construction).toContain('PROGRESS');
    expect(result.sections.construction).toContain('EXISTING');
  });

  it('seção de materiais lista madeiras, pedra e palha', () => {
    const result = compileVisualScene(visualSceneState);

    expect(result.sections.materials.toLowerCase()).toContain('madeira');
    expect(result.sections.materials.toLowerCase()).toContain('pedra');
    expect(result.sections.materials.toLowerCase()).toContain('palha');
  });
});

describe('VisualPromptCompiler - Variações de saída', () => {
  const project = createCabanaDoRiachoProject();
  const worldState = project.worldState;
  const visualSceneState = worldStateToVisualSceneState(worldState);

  it('compileVisualSceneShort gera versão resumida', () => {
    const fullPrompt = compileVisualScene(visualSceneState).prompt;
    const shortPrompt = compileVisualSceneShort(visualSceneState);

    expect(shortPrompt).toBeTypeOf('string');
    expect(shortPrompt.length).toBeLessThan(fullPrompt.length);
    expect(shortPrompt).toContain('SCENE');
    expect(shortPrompt).toContain('POSITION');
  });

  it('compileVisualSceneCompositionOnly exclui seção de ação', () => {
    const compositionPrompt = compileVisualSceneCompositionOnly(visualSceneState);

    expect(compositionPrompt).toBeTypeOf('string');
    expect(compositionPrompt).not.toContain('ACTION:');
    expect(compositionPrompt).toContain('SCENE');
    expect(compositionPrompt).toContain('POSITION');
    expect(compositionPrompt).toContain('FOCAL');
    expect(compositionPrompt).toContain('TYPE: NATURAL');
  });
});

describe('VisualPromptCompiler - Mapeamentos cinematográficos', () => {
  const project = createCabanaDoRiachoProject();
  const worldState = project.worldState;
  const visualSceneState = worldStateToVisualSceneState(worldState);

  it('mapeia movimento FIXA corretamente', () => {
    const result = compileVisualScene(visualSceneState);

    expect(result.sections.camera).toContain('static camera');
    expect(result.sections.camera).toContain('locked off');
  });

  it('mapeia horário "day" para "bright daylight"', () => {
    const result = compileVisualScene(visualSceneState);

    expect(result.sections.scene).toContain('bright daylight');
  });

  it('mapeia clima "clear" para "clear sky"', () => {
    const result = compileVisualScene(visualSceneState);

    expect(result.sections.scene).toContain('clear sky');
  });

  it('inclui coordenadas da câmera no formato (x, y)', () => {
    const result = compileVisualScene(visualSceneState);

    expect(result.sections.camera).toMatch(/POSITION: \([\d.-]+, [\d.-]+\)/);
    expect(result.sections.camera).toMatch(/TARGET: \([\d.-]+, [\d.-]+\)/);
  });

  it('inclui detalhes da lente (focal length, aperture)', () => {
    const result = compileVisualScene(visualSceneState);

    expect(result.sections.lens).toContain('FOCAL: 35mm');
    expect(result.sections.lens).toContain('APERTURE: f/2.8');
  });

  it('inclui temperatura de cor da key light em Kelvin', () => {
    const result = compileVisualScene(visualSceneState);

    expect(result.sections.lighting).toContain('5600K');
  });
});

describe('VisualPromptCompiler - Elementos visuais', () => {
  it('formata elementos visuais por tipo com posição e layer', () => {
    const project = createCabanaDoRiachoProject();
    const worldState = project.worldState;
    const visualSceneState = worldStateToVisualSceneState(worldState);

    // Adiciona alguns elementos de teste
    visualSceneState.elements = [
      {
        id: 'test-1',
        type: 'character',
        name: 'Trabalhador',
        position: { x: 10, y: 20 },
        rotation: 0,
        scale: 1,
        visible: true,
        layer: 10,
      },
      {
        id: 'test-2',
        type: 'construction',
        name: 'Parede Norte',
        position: { x: 50, y: 50 },
        rotation: 90,
        scale: 1.2,
        visible: true,
        layer: 5,
      },
    ];

    const result = compileVisualScene(visualSceneState);

    expect(result.sections.elements).toContain('CHARACTER');
    expect(result.sections.elements).toContain('CONSTRUCTION');
    expect(result.sections.elements).toContain('Trabalhador');
    expect(result.sections.elements).toContain('Parede Norte');
    expect(result.sections.elements).toContain('(10.0, 20.0)');
    expect(result.sections.elements).toContain('L10');
    expect(result.sections.elements).toContain('L5');
    expect(result.sections.elements).toContain('rot 90°');
    expect(result.sections.elements).toContain('scale 1.2');
  });

  it('exclui elementos invisíveis da seção de elementos', () => {
    const project = createCabanaDoRiachoProject();
    const worldState = project.worldState;
    const visualSceneState = worldStateToVisualSceneState(worldState);

    visualSceneState.elements = [
      {
        id: 'vis-1',
        type: 'prop',
        name: 'Visível',
        position: { x: 0, y: 0 },
        rotation: 0,
        scale: 1,
        visible: true,
        layer: 1,
      },
      {
        id: 'inv-1',
        type: 'prop',
        name: 'Invisível',
        position: { x: 100, y: 100 },
        rotation: 0,
        scale: 1,
        visible: false,
        layer: 1,
      },
    ];

    const result = compileVisualScene(visualSceneState);

    expect(result.sections.elements).toContain('Visível');
    expect(result.sections.elements).not.toContain('Invisível');
  });

  it('retorna "NO VISUAL ELEMENTS" quando array vazio', () => {
    const project = createCabanaDoRiachoProject();
    const worldState = project.worldState;
    const visualSceneState = worldStateToVisualSceneState(worldState);

    visualSceneState.elements = [];

    const result = compileVisualScene(visualSceneState);

    expect(result.sections.elements).toBe('NO VISUAL ELEMENTS');
  });

  it('retorna "ALL ELEMENTS HIDDEN" quando todos invisíveis', () => {
    const project = createCabanaDoRiachoProject();
    const worldState = project.worldState;
    const visualSceneState = worldStateToVisualSceneState(worldState);

    visualSceneState.elements = [
      {
        id: 'inv-1',
        type: 'prop',
        name: 'Invisível',
        position: { x: 0, y: 0 },
        rotation: 0,
        scale: 1,
        visible: false,
        layer: 1,
      },
    ];

    const result = compileVisualScene(visualSceneState);

    expect(result.sections.elements).toBe('ALL ELEMENTS HIDDEN');
  });
});

describe('VisualPromptCompiler - Edge cases', () => {
  it('lida com configurações opcionais ausentes (fillLight, ambientLight)', () => {
    const project = createCabanaDoRiachoProject();
    const worldState = project.worldState;
    const visualSceneState = worldStateToVisualSceneState(worldState);

    // Remove fillLight e ambientLight
    visualSceneState.lighting = {
      ...visualSceneState.lighting,
      fillLight: undefined,
      ambientLight: undefined,
    };

    const result = compileVisualScene(visualSceneState);

    expect(result.sections.lighting).toContain('KEY:');
    expect(result.sections.lighting).not.toContain('FILL:');
    expect(result.sections.lighting).not.toContain('AMBIENT:');
  });

  it('lida com path de câmera opcional', () => {
    const project = createCabanaDoRiachoProject();
    const worldState = project.worldState;
    const visualSceneState = worldStateToVisualSceneState(worldState);

    visualSceneState.cameraConfig = {
      ...visualSceneState.cameraConfig,
      movement: 'DOLLY',
      path: [
        { x: 0, y: 0 },
        { x: 10, y: 10 },
        { x: 20, y: 5 },
      ],
      duration: 5,
    };

    const result = compileVisualScene(visualSceneState);

    expect(result.sections.camera).toContain('dolly shot');
    expect(result.sections.camera).toContain('PATH:');
    expect(result.sections.camera).toContain('DURATION: 5s');
    expect(result.metadata.hasCameraMovement).toBe(true);
  });

  it('lida com depth of field habilitado', () => {
    const project = createCabanaDoRiachoProject();
    const worldState = project.worldState;
    const visualSceneState = worldStateToVisualSceneState(worldState);

    visualSceneState.lens = {
      ...visualSceneState.lens,
      depthOfField: true,
    };

    const result = compileVisualScene(visualSceneState);

    expect(result.sections.lens).toContain('DEPTH OF FIELD: enabled');
    expect(result.metadata.hasDepthOfField).toBe(true);
  });

  it('lida com iluminação customizada (mixed/artificial)', () => {
    const project = createCabanaDoRiachoProject();
    const worldState = project.worldState;
    const visualSceneState = worldStateToVisualSceneState(worldState);

    visualSceneState.lighting = {
      ...visualSceneState.lighting,
      type: 'mixed',
      fillLight: {
        direction: { x: -1, y: -0.5 },
        intensity: 0.5,
        color: '#ffffee',
      },
      ambientLight: {
        intensity: 0.3,
        color: '#ffeecc',
      },
    };

    const result = compileVisualScene(visualSceneState);

    expect(result.sections.lighting).toContain('TYPE: MIXED');
    expect(result.sections.lighting).toContain('FILL:');
    expect(result.sections.lighting).toContain('AMBIENT:');
    expect(result.metadata.hasCustomLighting).toBe(true);
  });

  it('lida com keyframes na ação', () => {
    const project = createCabanaDoRiachoProject();
    const worldState = project.worldState;
    const visualSceneState = worldStateToVisualSceneState(worldState);

    visualSceneState.action = {
      type: 'walk',
      description: 'Caminha até a cabana',
      actorId: 'worker-1',
      targetId: 'cabana',
      startTime: 0,
      duration: 10,
      keyframes: [
        { time: 0, position: { x: 0, y: 0 }, rotation: 0 },
        { time: 5, position: { x: 25, y: 25 }, rotation: 45 },
        { time: 10, position: { x: 50, y: 50 }, rotation: 90 },
      ],
    };

    const result = compileVisualScene(visualSceneState);

    expect(result.sections.action).toContain('ACTION: WALK');
    expect(result.sections.action).toContain('ACTOR: worker-1');
    expect(result.sections.action).toContain('TARGET: cabana');
    expect(result.sections.action).toContain('KEYFRAMES:');
    expect(result.sections.action).toContain('t0.0s:');
    expect(result.sections.action).toContain('t5.0s:');
    expect(result.sections.action).toContain('t10.0s:');
  });
});