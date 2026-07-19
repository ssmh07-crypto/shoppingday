import type { AnalysisResult, ManagedProductInput, ProductAnalysis } from "./types";

export interface GenerateTitleInput {
  productInput: ManagedProductInput;
  analysis: ProductAnalysis;
  selectedKeywords: string[];
  maximumLength: number;
  bannedWords: string[];
}

export interface KeywordGenerationClient {
  analyze(input: ManagedProductInput, candidateCount: number): Promise<AnalysisResult>;
  generateTitle(input: GenerateTitleInput): Promise<{
    title: string;
    model: string;
    source: "rules" | "mock";
  }>;
}
