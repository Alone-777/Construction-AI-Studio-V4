import { describe, expect, it } from 'vitest';
import { createCabanaDoRiachoProject } from '../demo/cabana-do-riacho';
import {
  DEFAULT_VISUAL_ASPECT_RATIO,
  upgradeLegacyDefaultVisualAspectRatio,
} from './project';

function legacyDefaultProject() {
  const project = structuredClone(createCabanaDoRiachoProject());
  const legacyAspectRatio = 16 / 9;
  project.visualDNA.camera.defaultConfig.aspectRatio = legacyAspectRatio;
  project.visualDNA.camera.cameraA.aspectRatio = legacyAspectRatio;
  project.visualDNA.camera.cameraB.aspectRatio = legacyAspectRatio;
  project.visualDNA.consistencyRules.aspectRatio = legacyAspectRatio;
  return project;
}

describe('legacy default visual aspect ratio upgrade', () => {
  it('upgrades the generated legacy fingerprint without rebuilding the project', () => {
    const legacy = legacyDefaultProject();
    const migrated = upgradeLegacyDefaultVisualAspectRatio(legacy, 123_456);

    expect(migrated).not.toBe(legacy);
    expect(migrated.id).toBe(legacy.id);
    expect(migrated.scenes).toBe(legacy.scenes);
    expect(migrated.worldState).toBe(legacy.worldState);
    expect(migrated.visualDNA.camera.defaultConfig.aspectRatio).toBe(DEFAULT_VISUAL_ASPECT_RATIO);
    expect(migrated.visualDNA.camera.cameraA.aspectRatio).toBe(DEFAULT_VISUAL_ASPECT_RATIO);
    expect(migrated.visualDNA.camera.cameraB.aspectRatio).toBe(DEFAULT_VISUAL_ASPECT_RATIO);
    expect(migrated.visualDNA.consistencyRules.aspectRatio).toBe(DEFAULT_VISUAL_ASPECT_RATIO);
    expect(migrated.updatedAt).toBe(123_456);
  });

  it('does not rewrite an explicit 16:9 VisualDNA', () => {
    const explicit = legacyDefaultProject();
    explicit.visualDNA.id = 'explicit-landscape-visual-dna';

    expect(upgradeLegacyDefaultVisualAspectRatio(explicit, 123_456)).toBe(explicit);
    expect(explicit.visualDNA.consistencyRules.aspectRatio).toBe(16 / 9);
  });
});
