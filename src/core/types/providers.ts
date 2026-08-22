export interface VisionProvider {
  analyze(imageData: string): Promise<{ description: string; elements: string[]; confidence: number }>;
}

export interface ArchitectProvider {
  suggest(context: any): Promise<{ suggestions: string[] }>;
}

export interface ReviewProvider {
  review(scene: any): Promise<{ issues: string[]; score: number }>;
}

export interface PromptEnhancer {
  enhance(prompt: string): Promise<string>;
}

export interface AIProviders {
  vision?: VisionProvider;
  architect?: ArchitectProvider;
  review?: ReviewProvider;
  promptEnhancer?: PromptEnhancer;
}
