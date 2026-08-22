import { SceneFeedback, Suggestion, FeedbackType } from '../types';

export interface FeedbackPattern {
  reason: FeedbackType;
  frequency: number;
  contextKeys: string[];
}

const feedbackHistory: SceneFeedback[] = [];

export function recordFeedback(feedback: SceneFeedback): void {
  feedbackHistory.push(feedback);
}

export function analyzeFeedbackPatterns(): FeedbackPattern[] {
  const reasonCount: Record<string, number> = {};
  
  feedbackHistory.forEach(f => {
    f.reasons.forEach(r => {
      reasonCount[r] = (reasonCount[r] || 0) + 1;
    });
  });

  const patterns: FeedbackPattern[] = [];
  for (const reason in reasonCount) {
    if (reasonCount[reason] >= 2) {
      patterns.push({
        reason: reason as FeedbackType,
        frequency: reasonCount[reason],
        contextKeys: []
      });
    }
  }

  return patterns;
}

export function getAutoSuggestions(): Suggestion[] {
  const patterns = analyzeFeedbackPatterns();
  const suggestions: Suggestion[] = [];

  patterns.forEach((p, idx) => {
    if (p.reason === 'salto' || p.reason === 'progresso_excessivo') {
      suggestions.push({
        id: `sug_auto_${idx}`,
        type: 'split',
        message: 'Dividir operação para reduzir salto temporal.',
        autoApplicable: true,
        affectedSceneIds: []
      });
    } else if (p.reason === 'camera_mudou') {
      suggestions.push({
        id: `sug_auto_cam_${idx}`,
        type: 'camera',
        message: 'Fixar câmera para evitar quebra de continuidade.',
        autoApplicable: true,
        affectedSceneIds: []
      });
    }
  });

  return suggestions;
}
