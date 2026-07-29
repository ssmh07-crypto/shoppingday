import { createMockMetrics, type MockExternalApiScenario } from "./mock-fixtures";
import type { KeywordMetricsClient } from "./keyword-metrics-client";

export class MockKeywordMetricsClient implements KeywordMetricsClient {
  constructor(private readonly scenario: MockExternalApiScenario = "normal") {}

  async fetchKeywordMetrics(keywords: string[]) {
    return createMockMetrics(keywords, this.scenario);
  }
}

