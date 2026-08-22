import { create } from 'zustand';
import type { SceneFeedback, FeedbackType, ApprovedPattern } from '../core/types';
import { saveFeedback, savePattern, getPatterns, getAllFeedbacks } from '../db/repository';

interface FeedbackState {
  /* ─── Feedbacks ─── */
  feedbacks: SceneFeedback[];
  patterns: ApprovedPattern[];

  /* ─── Preferências aprendidas ─── */
  learnedPreferences: Map<string, number>;

  /* ─── Ações ─── */
  addFeedback: (projectId: string, feedback: SceneFeedback) => void;
  addPattern: (pattern: ApprovedPattern) => void;
  loadFeedbacks: () => Promise<void>;
  loadPatterns: () => Promise<void>;
  getFrequentRejectionReasons: () => { reason: FeedbackType; count: number }[];
}

export const useFeedbackStore = create<FeedbackState>((set, get) => ({
  feedbacks: [],
  patterns: [],
  learnedPreferences: new Map(),

  addFeedback: (projectId, feedback) => {
    saveFeedback(projectId, feedback).catch(console.error);
    set((s) => ({ feedbacks: [...s.feedbacks, feedback] }));
  },

  addPattern: (pattern) => {
    savePattern(pattern).catch(console.error);
    set((s) => ({ patterns: [...s.patterns, pattern] }));
  },

  loadFeedbacks: async () => {
    const records = await getAllFeedbacks();
    set({ feedbacks: records.map((r) => r.feedback) });
  },

  loadPatterns: async () => {
    const records = await getPatterns();
    set({ patterns: records.map((r) => r.pattern) });
  },

  getFrequentRejectionReasons: () => {
    const { feedbacks } = get();
    const rejected = feedbacks.filter((f) => !f.approved);
    const counts = new Map<FeedbackType, number>();
    for (const fb of rejected) {
      for (const reason of fb.reasons) {
        counts.set(reason, (counts.get(reason) || 0) + 1);
      }
    }
    return Array.from(counts.entries())
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count);
  },
}));
