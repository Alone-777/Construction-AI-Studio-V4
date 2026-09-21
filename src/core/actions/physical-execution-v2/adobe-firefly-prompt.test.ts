import { describe, expect, it } from 'vitest';
import {
  ADOBE_FIREFLY_PROMPT_MAX_CHARS,
} from '../../video-generation/animation-prompt-budget';
import {
  compileAdobeFireflyVideoPromptV2,
  type ProviderNeutralPromptArtifactV2,
} from './index';

function artifact(
  retryCorrections: ProviderNeutralPromptArtifactV2['retryCorrections'] = [],
): ProviderNeutralPromptArtifactV2 {
  return {
    schemaVersion: 'construction-provider-neutral-prompt/2',
    sourcePlanId: 'plan:test:0-25',
    officialBeforeRevision: 'world:1:test',
    authorizedWorkZoneId: 'Z1',
    executionBeats: [
      { id: 'acquire', instruction: 'Pick up the visible shovel and keep it under visible control.', toolId: 'shovel', zoneId: 'Z1' },
      { id: 'contact', instruction: 'Drive the shovel blade into shallow topsoil in the bounded current patch.', toolId: 'shovel', zoneId: 'Z1' },
      { id: 'scrape', instruction: 'Scrape grass and roots, lift loosened soil and deposit it beside the same bounded patch.', toolId: 'shovel', zoneId: 'Z1' },
      { id: 'inspect', instruction: 'Show one contiguous exposed-soil patch and the clearly unfinished remainder.', toolId: 'shovel', zoneId: 'Z1' },
      { id: 'stop', instruction: 'Stop construction exactly at the canonical 25% target.', zoneId: 'Z1' },
    ],
    transformationEffects: [{
      type: 'CANONICAL_PROGRESS_ADVANCED',
      targetId: 'site-prep',
      fromPercentage: 0,
      toPercentage: 25,
    }],
    evidence: [{
      id: 'terminal',
      entityIds: ['site-prep'],
      relation: 'BOUNDED_SURFACE_CLEARING_PERSISTS',
      metric: 'canonical-stage',
      expected: { targetPercentage: 25, remainingWorkVisible: true },
      visibleIn: 'TERMINAL_FRAME',
      mustPersist: true,
    }],
    canonicalProgress: {
      beforePercentage: 0,
      targetPercentage: 25,
      tolerancePercentage: 0,
    },
    physicalProgress: {
      metric: 'AREA',
      unit: 'm2',
      from: 0,
      target: 12.5,
      tolerance: 0.5,
      total: 50,
      zoneId: 'Z1',
      sectors: ['sector-a'],
    },
    forbiddenFutureComponentIds: ['foundation', 'floor', 'walls', 'roof'],
    retryCorrections,
  };
}

describe('Adobe Firefly V2 animation prompt compiler', () => {
  it('uses the Adobe Firefly 1800 character platform budget', () => {
    expect(ADOBE_FIREFLY_PROMPT_MAX_CHARS).toBe(1800);
    const compiled = compileAdobeFireflyVideoPromptV2({
      artifact: artifact(),
      model: 'KLING_3_0',
      durationSeconds: 15,
    });

    expect(compiled.platform).toBe('ADOBE_FIREFLY');
    expect(compiled.maxChars).toBe(1800);
    expect(compiled.characterCount).toBeLessThanOrEqual(1800);
    expect(compiled.prompt).toContain('0%→25%');
    expect(compiled.prompt).toContain('12.5 m2');
  });

  it('preserves structured retry codes while compacting a long prompt', () => {
    const compiled = compileAdobeFireflyVideoPromptV2({
      artifact: artifact([
        {
          code: 'TOOL_ACTION_NOT_EXECUTED',
          correction: 'Show repeated shovel-to-ground contact, scraping, lifting and depositing loosened material beside the bounded patch. '.repeat(6),
        },
        {
          code: 'INSUFFICIENT_PHYSICAL_PROGRESS',
          correction: 'Each stroke must enlarge one contiguous exposed-soil patch until the target is visibly reached while the rest remains untouched. '.repeat(6),
        },
      ]),
      model: 'KLING_3_0',
      durationSeconds: 15,
    });

    expect(compiled.characterCount).toBeLessThanOrEqual(1800);
    expect(compiled.prompt).toContain('TOOL_ACTION_NOT_EXECUTED');
    expect(compiled.prompt).toContain('INSUFFICIENT_PHYSICAL_PROGRESS');
  });

  it('fails rather than silently dropping retry corrections when the budget is impossibly small', () => {
    expect(() => compileAdobeFireflyVideoPromptV2({
      artifact: artifact([{
        code: 'REQUIRED_RETRY',
        correction: 'Required physical correction that must survive prompt compilation.',
      }]),
      model: 'KLING_3_0',
      maxChars: 120,
    })).toThrow(/exceeds hard limit|lost required retry correction/);
  });
});
