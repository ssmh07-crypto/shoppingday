import type { KeywordMetrics } from "./types";

export interface KeywordMetricsClient {
  fetchKeywordMetrics(keywords: string[]): Promise<KeywordMetrics[]>;
  discoverKeywordMetrics?(
    hintKeywords: string[],
    limit: number,
  ): Promise<KeywordMetrics[]>;
}
