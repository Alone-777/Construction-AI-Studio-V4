export type PromptPlatform = 'manual_image' | 'kling' | 'midjourney' | 'stable_diffusion' | 'runway' | 'custom';

export interface ProviderNeutralImagePrompt {
  previousReference?: string;
  dna: string;
  environment: string;
  character: string;
  camera: string;
  activeZone: string;
  currentState: string;
  action: string;
  allowedChange: string;
  preservedRegions: string[];
  prohibitedRegions: string[];
  futureElements: string[];
  result: string;
  fullText: string;
}

export interface KlingPrompt {
  start: string;
  displacement?: string;
  action: string;
  transformation: string;
  newDisplacement?: string;
  newAction?: string;
  final: string;
  prohibitions: string[];
  fullText: string;
}

export interface PromptConfig {
  platform: PromptPlatform;
  maxCharacters: number; // default 1400
  autoOptimize: boolean;
}

export interface GeneratedPrompt {
  platform: PromptPlatform;
  text: string;
  characterCount: number;
  withinLimit: boolean;
  optimized: boolean;
}
