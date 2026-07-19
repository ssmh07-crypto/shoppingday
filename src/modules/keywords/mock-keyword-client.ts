import { createMockAnalysis, createMockTitle } from "./mock-fixtures";
import type {
  GenerateTitleInput,
  KeywordGenerationClient,
} from "./keyword-generation-client";
import type { ManagedProductInput } from "./types";

export class MockKeywordGenerationClient implements KeywordGenerationClient {
  async analyze(input: ManagedProductInput, candidateCount: number) {
    return createMockAnalysis(input, candidateCount);
  }

  async generateTitle(input: GenerateTitleInput) {
    return {
      title: createMockTitle(
        input.productInput.supplierTitle,
        input.selectedKeywords,
        input.maximumLength,
      ),
      model: "mock-title-generator-v1",
      source: "mock" as const,
    };
  }
}
