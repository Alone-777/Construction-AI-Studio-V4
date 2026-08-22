import type { GeneratedPrompt, PromptPlatform } from '../types';

export function countCharacters(text: string): number {
  return text.length;
}

export function suggestReductions(text: string, targetChars: number): string[] {
  const suggestions: string[] = [];
  if (text.length > targetChars) {
    suggestions.push('Remove superfluous adjectives');
    suggestions.push('Simplify environment descriptions');
  }
  return suggestions;
}

export function optimizePrompt(prompt: string, maxChars: number, platform: PromptPlatform): GeneratedPrompt {
  const normalized = prompt.replace(/\s+/g, ' ').trim();
  let optimizedText = normalized;

  if (normalized.length > maxChars) {
    const sections = normalized.split(/(?<=[.!?])\s+/).filter(Boolean);
    const invariantPattern = /start|action|camera|zone|preserv|prohibit|negative|must not|continu|end state|allowed change/i;
    const mandatory = sections.filter(section => invariantPattern.test(section));
    const optional = sections.filter(section => !invariantPattern.test(section));
    const selected = [...mandatory];

    for (const section of optional) {
      const candidate = [...selected, section].join(' ');
      if (candidate.length <= maxChars) selected.push(section);
    }

    // Nunca corta silenciosamente uma regra causal. Se as regras essenciais não
    // couberem, devolve-as completas e sinaliza withinLimit=false para revisão.
    optimizedText = selected.join(' ');
  }

  return {
    platform,
    text: optimizedText,
    characterCount: optimizedText.length,
    withinLimit: optimizedText.length <= maxChars,
    optimized: prompt !== optimizedText
  };
}
