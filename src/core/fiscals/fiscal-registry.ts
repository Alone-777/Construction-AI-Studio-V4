import { FiscalInspector } from './types';
import { DependencyFiscal } from './dependency-fiscal';
import { SpatialFiscal } from './spatial-fiscal';
import { ConservationFiscal } from './conservation-fiscal';
import { CharacterFiscal } from './character-fiscal';
import { TemporalFiscal } from './temporal-fiscal';
import { VisualFiscal } from './visual-fiscal';
import { CameraFiscal } from './camera-fiscal';
import { ExecutionFiscal } from './execution-fiscal';
import { ProgressionFiscal } from './progression-fiscal';
import { TopologyFiscal } from './topology-fiscal';
import { StateTransitionFiscal } from './state-transition-fiscal';
import { VisualSourceFiscal } from './visual-source-fiscal';

/**
 * Centralized Fiscal Registry
 *
 * Single source of truth for all available fiscal inspectors.
 * Preserves execution order (relevant for quality score calculation in fiscal-runner).
 * Adding/removing fiscals only requires modifying this file.
 */
export class FiscalRegistry {
  private static _inspectors: FiscalInspector[] | null = null;

  /**
   * Returns all registered fiscal inspectors in execution order.
   * Order is preserved from the original fiscal-runner implementation
   * to maintain quality score category mapping.
   */
  static getInspectors(): FiscalInspector[] {
    if (this._inspectors === null) {
      this._inspectors = [
        new DependencyFiscal(),
        new SpatialFiscal(),
        new ConservationFiscal(),
        new CharacterFiscal(),
        new TemporalFiscal(),
        new VisualFiscal(),
        new CameraFiscal(),
        new ExecutionFiscal(),
        new ProgressionFiscal(),
        new TopologyFiscal(),
        new StateTransitionFiscal(),
        new VisualSourceFiscal(),
      ];
    }
    return this._inspectors;
  }

  /**
   * Returns inspector IDs in execution order for debugging/inspection.
   */
  static getInspectorIds(): string[] {
    return this.getInspectors().map(i => i.id);
  }

  /**
   * Resets the registry (useful for testing).
   */
  static reset(): void {
    this._inspectors = null;
  }
}

/**
 * Pre-computed inspector list for direct consumption.
 * Use FiscalRegistry.getInspectors() for lazy initialization.
 */
export const fiscalInspectors = FiscalRegistry.getInspectors();