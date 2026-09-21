export const ADOBE_FIREFLY_PROMPT_MAX_CHARS = 1800;
// Backward-compatible alias for animation prompts entered through Adobe Firefly.
export const ANIMATION_PROMPT_MAX_CHARS = ADOBE_FIREFLY_PROMPT_MAX_CHARS;

export function countAnimationPromptCharacters(value: string): number {
  return Array.from(String(value ?? '')).length;
}

export function compactAnimationPromptField(
  value: unknown,
  maxChars: number,
): string {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  const chars = Array.from(text);
  if (chars.length <= maxChars) return text;

  const sliced = chars.slice(0, Math.max(1, maxChars - 1)).join('');
  const clean = sliced.replace(/\s+\S*$/, '').trimEnd();
  return (clean || sliced.trimEnd()) + '…';
}

export function compactAnimationPromptList(
  values: readonly string[],
  {
    maxItems = 6,
    itemChars = 48,
  }: {
    readonly maxItems?: number;
    readonly itemChars?: number;
  } = {},
): string {
  const unique = [...new Set(values.filter(Boolean))]
    .map(value => compactAnimationPromptField(value, itemChars))
    .filter(Boolean);
  if (!unique.length) return 'none';

  const shown = unique.slice(0, maxItems);
  const extra = unique.length - shown.length;
  return shown.join(', ') + (extra > 0 ? ' +' + extra + ' more' : '');
}

export function assertAnimationPromptWithinLimit(
  prompt: string,
  maxChars = ANIMATION_PROMPT_MAX_CHARS,
): string {
  const count = countAnimationPromptCharacters(prompt);
  if (count > maxChars) {
    throw new Error(
      `Animation prompt exceeds hard limit: ${count}/${maxChars} characters.`,
    );
  }
  return prompt;
}
