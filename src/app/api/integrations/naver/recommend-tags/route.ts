import { NextResponse } from "next/server";
import { z } from "zod";
import { AuthenticationError, requireAdmin } from "@/lib/auth/admin";
import { withDbReadRecovery } from "@/lib/db";
import { NaverCommerceError } from "@/modules/channels/naver/naver-commerce-client";
import { createConfiguredNaverClientForUser } from "@/modules/channels/naver/naver-category-service";

const querySchema = z.object({
  keyword: z.string().trim().min(1).max(100),
});

type CachedTagCheck = {
  expiresAt: number;
  value: {
    keyword: string;
    registered: boolean;
    exactTag: { code: number; text: string } | null;
    candidates: Array<{ code: number; text: string }>;
  };
};

const CACHE_TTL_MS = 6 * 60 * 60_000;
const MAX_CACHE_ENTRIES = 1_000;
const tagCheckCache = new Map<string, CachedTagCheck>();

export async function GET(request: Request) {
  try {
    return await withDbReadRecovery(async (database) => {
      const user = await requireAdmin(database);
      const url = new URL(request.url);
      const { keyword } = querySchema.parse({
        keyword: url.searchParams.get("keyword"),
      });
      const normalizedKeyword = normalizeTag(keyword);
      const cacheKey = `${user.id}:${normalizedKeyword}`;
      const cached = tagCheckCache.get(cacheKey);
      if (cached && cached.expiresAt > Date.now()) {
        touchCache(cacheKey, cached);
        return tagResponse(cached.value, "hit");
      }
      if (cached) tagCheckCache.delete(cacheKey);

      const client = await createConfiguredNaverClientForUser(database, user.id);
      if (!client.fetchRecommendTags) {
        throw new NaverCommerceError(
          "not_configured",
          "네이버 추천 태그 조회 기능이 설정되지 않았습니다.",
        );
      }
      const candidates = await client.fetchRecommendTags(keyword);
      const exactTag =
        candidates.find((candidate) =>
          normalizeTag(candidate.text) === normalizedKeyword
        ) ?? null;
      const value = {
        keyword,
        registered: exactTag !== null,
        exactTag,
        candidates: candidates.slice(0, 10),
      };
      tagCheckCache.set(cacheKey, {
        expiresAt: Date.now() + CACHE_TTL_MS,
        value,
      });
      trimCache();
      return tagResponse(value, "miss");
    });
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return NextResponse.json(
        { success: false, error: { code: error.code, message: error.message } },
        { status: 401 },
      );
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "validation_error",
            message: "태그사전을 확인할 키워드를 입력해 주세요.",
          },
        },
        { status: 400 },
      );
    }
    if (error instanceof NaverCommerceError) {
      return NextResponse.json(
        { success: false, error: { code: error.code, message: error.message } },
        {
          status:
            error.code === "not_configured"
              ? 503
              : error.code === "timeout"
                ? 504
                : 502,
        },
      );
    }
    console.error(JSON.stringify({ event: "naver_recommend_tag_check_failed" }));
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "internal_error",
          message: "네이버 추천 태그사전을 확인하지 못했습니다.",
        },
      },
      { status: 500 },
    );
  }
}

function normalizeTag(value: string) {
  return value
    .normalize("NFKC")
    .replace(/\s+/g, "")
    .toLocaleLowerCase("ko-KR");
}

function tagResponse(value: CachedTagCheck["value"], cache: "hit" | "miss") {
  return NextResponse.json(
    { success: true, data: value },
    {
      headers: {
        "Cache-Control": "private, no-store",
        "X-Shoppingday-Cache": cache,
      },
    },
  );
}

function touchCache(key: string, value: CachedTagCheck) {
  tagCheckCache.delete(key);
  tagCheckCache.set(key, value);
}

function trimCache() {
  while (tagCheckCache.size > MAX_CACHE_ENTRIES) {
    const oldestKey = tagCheckCache.keys().next().value;
    if (oldestKey === undefined) break;
    tagCheckCache.delete(oldestKey);
  }
}
