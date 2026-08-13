"use client";

import { useMemo, useState, type ChangeEvent } from "react";
import type { ProductKeywordDraft } from "@/lib/db/schema";
import {
  mergeImportedKeywords,
  parseItemScoutWorkbook,
} from "@/modules/sourcing/itemscout-import";

export function ProductKeywordImport({
  value,
  onChange,
  onGenerateTitle,
}: {
  value: ProductKeywordDraft[];
  onChange: (value: ProductKeywordDraft[]) => void;
  onGenerateTitle: () => void;
}) {
  const [importing, setImporting] = useState(false);
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState("");
  const visible = useMemo(() => {
    const normalized = query.normalize("NFKC").replace(/\s+/g, "").toLocaleLowerCase("ko-KR");
    return value.filter((item) => !normalized || item.normalizedKeyword.includes(normalized));
  }, [query, value]);
  const titleCount = value.filter((item) => item.placement === "product_name").length;
  const tagCount = value.filter((item) => item.placement === "tag").length;

  async function importWorkbook(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file) return;
    setImporting(true);
    setMessage("");
    try {
      const imported = await parseItemScoutWorkbook(file);
      const merged = mergeImportedKeywords(value, imported.keywords).map(
        (item): ProductKeywordDraft => ({
          id: item.id,
          keyword: item.keyword,
          normalizedKeyword: item.normalizedKeyword,
          monthlySearchVolume: item.monthlySearchVolume,
          placement:
            item.placement === "product_name" || item.placement === "tag"
              ? item.placement
              : "unclassified",
          source: "itemscout-xlsx",
          importedAt: item.importedAt,
        }),
      );
      onChange(merged);
      setMessage(
        `${imported.sourceRowCount}행에서 ${imported.keywords.length}개를 가져왔습니다. 중복 ${imported.duplicateCount}개는 합쳤습니다.`,
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "엑셀을 읽지 못했습니다.");
    } finally {
      input.value = "";
      setImporting(false);
    }
  }

  function setPlacement(id: string, placement: ProductKeywordDraft["placement"]) {
    onChange(
      value.map((item) =>
        item.id === id
          ? { ...item, placement: item.placement === placement ? "unclassified" : placement }
          : item,
      ),
    );
  }

  return (
    <section className="product-keyword-import">
      <div className="product-keyword-import-heading">
        <div>
          <strong>아이템스카우트 연관키워드</strong>
          <p>
            엑셀의 키워드와 총 검색수만 가져옵니다. 상품명 또는 태그로 분류한
            결과는 이 상품 초안에 저장됩니다.
          </p>
        </div>
        <label className="product-keyword-file-button">
          <input
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={importWorkbook}
            disabled={importing}
          />
          {importing ? "엑셀 읽는 중…" : "엑셀 추가"}
        </label>
      </div>
      {message && <small role="status">{message}</small>}
      {value.length > 0 && (
        <>
          <div className="product-keyword-import-summary">
            <span>전체 {value.length}</span>
            <span>상품명 {titleCount}</span>
            <span>태그 {tagCount}</span>
            <button
              type="button"
              onClick={onGenerateTitle}
              disabled={!titleCount}
            >
              분류 키워드로 상품명 만들기
            </button>
            <button
              type="button"
              onClick={() => {
                if (window.confirm(`가져온 키워드 ${value.length}개를 모두 삭제할까요?`)) {
                  onChange([]);
                  setMessage("가져온 연관키워드를 모두 삭제했습니다.");
                }
              }}
            >
              전체 삭제
            </button>
          </div>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="가져온 키워드 검색"
            aria-label="위탁상품 연관키워드 검색"
          />
          <div className="product-keyword-import-list">
            {visible.map((item) => (
              <article key={item.id}>
                <div>
                  <strong>{item.keyword}</strong>
                  <small>
                    {item.monthlySearchVolume == null
                      ? "검색수 없음"
                      : `월 검색수 ${item.monthlySearchVolume.toLocaleString("ko-KR")}`}
                  </small>
                </div>
                <div role="group" aria-label={`${item.keyword} 키워드 분류`}>
                  <button
                    type="button"
                    className={item.placement === "product_name" ? "active" : undefined}
                    aria-pressed={item.placement === "product_name"}
                    onClick={() => setPlacement(item.id, "product_name")}
                  >
                    상품명
                  </button>
                  <button
                    type="button"
                    className={item.placement === "tag" ? "active" : undefined}
                    aria-pressed={item.placement === "tag"}
                    onClick={() => setPlacement(item.id, "tag")}
                  >
                    태그
                  </button>
                </div>
                <button
                  type="button"
                  className="delete"
                  aria-label={`${item.keyword} 키워드 삭제`}
                  onClick={() => onChange(value.filter((candidate) => candidate.id !== item.id))}
                >
                  삭제
                </button>
              </article>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
