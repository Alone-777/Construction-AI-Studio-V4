import { describe, expect, it } from 'vitest';
import type { WorldState } from '../types/world-state';
import {
  beginStageTransaction,
  commitStageTransaction,
  rejectStageTransaction,
} from './stage-transaction';

function state(progress: number): WorldState {
  return { construction: { progress } } as WorldState;
}

function begin() {
  return beginStageTransaction({
    id: 'transaction-scene-1-stage-25',
    sceneId: 'scene-1',
    stageId: '25',
    operationId: 'operation-1',
    officialStateBefore: state(0),
    candidateState: state(25),
  });
}

describe('StageTransaction', () => {
  it('preserves officialStateBefore when begun', () => {
    const officialStateBefore = state(0);
    const transaction = beginStageTransaction({
      id: 'transaction-1',
      sceneId: 'scene-1',
      stageId: '25',
      operationId: 'operation-1',
      officialStateBefore,
      candidateState: state(25),
    });

    expect(transaction.officialStateBefore).toBe(officialStateBefore);
  });

  it('keeps candidate state separate from official state', () => {
    const transaction = begin();

    expect(transaction.candidateState).not.toBe(transaction.officialStateBefore);
    expect(transaction.officialStateBefore.construction.progress).toBe(0);
    expect(transaction.candidateState.construction.progress).toBe(25);
  });

  it('commits candidate state as officialStateAfter', () => {
    const transaction = begin();
    const committed = commitStageTransaction(transaction);

    expect(committed.status).toBe('COMMITTED');
    expect(committed.officialStateAfter).toBe(transaction.candidateState);
  });

  it('rejects candidate state and preserves before as officialStateAfter', () => {
    const transaction = begin();
    const rejected = rejectStageTransaction(transaction);

    expect(rejected.status).toBe('REJECTED');
    expect(rejected.officialStateAfter).toBe(transaction.officialStateBefore);
  });

  it('retains rejected candidate state as evidence', () => {
    const transaction = begin();
    const rejected = rejectStageTransaction(transaction);

    expect(rejected.candidateState).toBe(transaction.candidateState);
    expect(rejected.candidateState.construction.progress).toBe(25);
  });

  it('blocks a second commit after commit', () => {
    const committed = commitStageTransaction(begin());

    expect(() => commitStageTransaction(committed)).toThrow(/already COMMITTED/);
  });

  it('blocks commit after rejection', () => {
    const rejected = rejectStageTransaction(begin());

    expect(() => commitStageTransaction(rejected)).toThrow(/already REJECTED/);
  });

  it('blocks rejection after commit', () => {
    const committed = commitStageTransaction(begin());

    expect(() => rejectStageTransaction(committed)).toThrow(/already COMMITTED/);
  });

  it('blocks a second rejection after rejection', () => {
    const rejected = rejectStageTransaction(begin());

    expect(() => rejectStageTransaction(rejected)).toThrow(/already REJECTED/);
  });

  it('does not expose officialStateAfter while open', () => {
    const transaction = begin();

    expect(transaction.status).toBe('OPEN');
    expect(transaction).not.toHaveProperty('officialStateAfter');
  });

  it('does not attach a decision to a rejected transaction', () => {
    const rejected = rejectStageTransaction(begin());

    expect(rejected).not.toHaveProperty('decision');
  });
});
