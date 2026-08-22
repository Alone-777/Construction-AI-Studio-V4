import { describe, expect, it } from 'vitest';
import { parseProjectArchive } from '../../db/project-archive';
import { createProjectFromDescription } from '../blueprints/description-blueprint';

function idSequence(prefix: string): () => string {
  let index = 0;
  return () => `${prefix}-${index += 1}`;
}

describe('Arquivo V4 e importação sem duplicação', () => {
  const project = createProjectFromDescription({
    description: 'Abrigo de madeira e pedra em uma clareira.',
    name: 'Arquivo de Teste',
  });

  it('atribui nova identidade sem alterar o arquivo original', () => {
    const originalId = project.id;
    const parsed = parseProjectArchive(JSON.stringify({ version: '4.0.0', project }), idSequence('import'));
    expect(parsed.project.id).toBe('import-1');
    expect(project.id).toBe(originalId);
  });

  it('deduplica snapshots pelo mesmo par cena/estágio', () => {
    const snapshot = { sceneIndex: 0, stageIndex: 0, worldStateJson: '{}' };
    const parsed = parseProjectArchive(JSON.stringify({
      version: '4.0.0', project, snapshots: [snapshot, snapshot],
    }), idSequence('import'));
    expect(parsed.snapshots).toHaveLength(1);
    expect(parsed.snapshots[0].id).toBe('import-1:0:0');
    expect(parsed.snapshots[0].projectId).toBe(parsed.project.id);
  });

  it('reidentifica feedbacks e rejeita formatos fora da V4', () => {
    const feedback = { feedback: { sceneId: 'scene_1', approved: true, reasons: [], comment: '', timestamp: 1 } };
    const parsed = parseProjectArchive(JSON.stringify({
      version: '4.1.0', project, feedbacks: [feedback, feedback],
    }), idSequence('import'));
    expect(new Set(parsed.feedbacks.map(item => item.id)).size).toBe(2);
    expect(parsed.feedbacks.every(item => item.projectId === parsed.project.id)).toBe(true);
    expect(() => parseProjectArchive(JSON.stringify({ version: '3.0.0', project }), idSequence('bad'))).toThrow(/Formato/);
  });
});
