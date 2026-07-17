"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function ProductTitleInlineEditor({
  id,
  initialTitle,
  initialDraftVersion,
}: {
  id: string;
  initialTitle: string;
  initialDraftVersion: number;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(initialTitle);
  const [value, setValue] = useState(initialTitle);
  const [draftVersion, setDraftVersion] = useState(initialDraftVersion);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    const nextTitle = value.trim();
    if (!nextTitle) {
      setError("상품명을 입력해 주세요.");
      return;
    }
    if (nextTitle === title) {
      setEditing(false);
      return;
    }
    setSaving(true);
    setError("");
    try {
      const response = await fetch(`/api/products/${id}/title`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: nextTitle, draftVersion }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok)
        throw new Error(body?.error?.message ?? "상품명을 저장하지 못했습니다.");
      setTitle(body.data.product.title);
      setValue(body.data.product.title);
      setDraftVersion(body.data.product.draftVersion);
      setEditing(false);
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "상품명을 저장하지 못했습니다.",
      );
    } finally {
      setSaving(false);
    }
  }

  function cancel() {
    setValue(title);
    setError("");
    setEditing(false);
  }

  if (!editing) {
    return (
      <button
        type="button"
        className="inventory-inline-title-trigger"
        title="상품명 바로 수정"
        onClick={() => setEditing(true)}
      >
        {title || "상품명 미입력"}
      </button>
    );
  }

  return (
    <div className="inventory-inline-title-editor">
      <input
        autoFocus
        value={value}
        maxLength={200}
        aria-label="상품명"
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") void save();
          if (event.key === "Escape") cancel();
        }}
      />
      <div>
        <button type="button" onClick={() => void save()} disabled={saving}>
          {saving ? "저장 중" : "저장"}
        </button>
        <button type="button" onClick={cancel} disabled={saving}>
          취소
        </button>
      </div>
      {error && <small className="field-error">{error}</small>}
    </div>
  );
}
