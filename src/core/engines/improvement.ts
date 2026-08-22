import { Suggestion, Scene } from '../types';

export function analyzeSuggestions(suggestions: Suggestion[]): Suggestion[] {
  return suggestions.filter(s => s.autoApplicable);
}

export function applyImprovement(scenes: Scene[], suggestion: Suggestion): Scene[] {
  const updatedScenes = [...scenes];

  suggestion.affectedSceneIds.forEach(id => {
    const idx = updatedScenes.findIndex(s => s.id === id);
    if (idx !== -1) {
      const scene = updatedScenes[idx];
      
      if (scene.status === 'locked') return; 
      
      if (suggestion.type === 'duration') {
        updatedScenes[idx] = { ...scene, duration: scene.duration * 1.1 };
      } else if (suggestion.type === 'camera') {
        updatedScenes[idx] = { ...scene, camera: scene.camera === 'A' ? 'B' : 'A' };
      }
      
      updatedScenes[idx].status = 'draft';
    }
  });

  return updatedScenes;
}
