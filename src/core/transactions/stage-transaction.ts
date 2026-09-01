import type { WorldState } from '../types/world-state';

export type StageTransactionStatus = 'OPEN' | 'COMMITTED' | 'REJECTED';

interface StageTransactionBase {
  readonly id: string;
  readonly sceneId: string;
  readonly stageId: string;
  readonly operationId: string;
  readonly officialStateBefore: WorldState;
  readonly candidateState: WorldState;
}

export interface OpenStageTransaction extends StageTransactionBase {
  readonly status: 'OPEN';
}

export interface CommittedStageTransaction extends StageTransactionBase {
  readonly status: 'COMMITTED';
  readonly officialStateAfter: WorldState;
}

export interface RejectedStageTransaction extends StageTransactionBase {
  readonly status: 'REJECTED';
  readonly officialStateAfter: WorldState;
}

export type StageTransaction =
  | OpenStageTransaction
  | CommittedStageTransaction
  | RejectedStageTransaction;

export interface BeginStageTransactionInput extends StageTransactionBase {}

export function beginStageTransaction(
  input: BeginStageTransactionInput,
): OpenStageTransaction {
  return { ...input, status: 'OPEN' };
}

function assertOpen(
  transaction: StageTransaction,
): asserts transaction is OpenStageTransaction {
  if (transaction.status !== 'OPEN') {
    throw new Error(
      `Stage transaction ${transaction.id} is already ${transaction.status}`,
    );
  }
}

export function commitStageTransaction(
  transaction: StageTransaction,
): CommittedStageTransaction {
  assertOpen(transaction);
  return {
    ...transaction,
    status: 'COMMITTED',
    officialStateAfter: transaction.candidateState,
  };
}

export function rejectStageTransaction(
  transaction: StageTransaction,
): RejectedStageTransaction {
  assertOpen(transaction);
  return {
    ...transaction,
    status: 'REJECTED',
    officialStateAfter: transaction.officialStateBefore,
  };
}
