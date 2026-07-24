"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ProductEditor } from "./product-editor";
import type { ProductEditorInitial } from "./product-editor-types";

const PREFETCH_TTL_MS = 15_000;
const editorCache = new Map<
  string,
  { expiresAt: number; promise: Promise<ProductEditorInitial> }
>();

export function ProductEditorDrawer({
  initialProductId,
  productIds = [],
}: {
  initialProductId?: string;
  productIds?: string[];
}) {
  const [productId, setProductId] = useState(initialProductId ?? null);
  const [editor, setEditor] = useState<ProductEditorInitial | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editorDirty, setEditorDirty] = useState(false);
  const requestVersion = useRef(0);
  const openedFromList = useRef(false);

  const load = useCallback(async (id: string, force = false) => {
    const version = ++requestVersion.current;
    setEditor(null);
    setError(null);
    setEditorDirty(false);
    try {
      const data = await loadEditor(id, force);
      if (version === requestVersion.current) setEditor(data);
    } catch (loadError) {
      if (version !== requestVersion.current) return;
      setError(
        loadError instanceof Error
          ? loadError.message
          : "상품 정보를 불러오지 못했습니다.",
      );
    }
  }, []);

  const open = useCallback(
    (id: string, href: string) => {
      if (id === productId) return;
      const current = new URL(window.location.href);
      const alreadyOpen = current.searchParams.has("edit");
      if (alreadyOpen) {
        window.history.replaceState(null, "", href);
      } else {
        openedFromList.current = true;
        window.history.pushState(null, "", href);
      }
      setProductId(id);
      void load(id);
    },
    [load, productId],
  );

  const close = useCallback(() => {
    if (
      editorDirty &&
      !confirm("저장하지 않은 변경사항이 있습니다. 편집을 닫을까요?")
    )
      return;
    requestVersion.current += 1;
    if (
      openedFromList.current &&
      new URL(location.href).searchParams.has("edit")
    ) {
      openedFromList.current = false;
      history.back();
      return;
    }
    const url = withoutEditParameter();
    history.replaceState(null, "", url);
    setProductId(null);
    setEditor(null);
    setError(null);
  }, [editorDirty]);

  const navigate = useCallback(
    (id: string | undefined) => {
      if (!id || id === productId) return;
      if (
        editorDirty &&
        !confirm("저장하지 않은 변경사항이 있습니다. 다른 상품으로 이동할까요?")
      )
        return;
      const url = new URL(location.href);
      url.searchParams.set("edit", id);
      history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
      setProductId(id);
      void load(id);
    },
    [editorDirty, load, productId],
  );

  useEffect(() => {
    if (!initialProductId) return;
    const version = ++requestVersion.current;
    // A direct edit link can be opened immediately after a sourcing draft sync.
    // Always bypass the short hover-prefetch cache so the editor shows the
    // latest title, tags, and price from the database.
    void loadEditor(initialProductId, true).then(
      (data) => {
        if (version === requestVersion.current) setEditor(data);
      },
      (loadError) => {
        if (version !== requestVersion.current) return;
        setError(
          loadError instanceof Error
            ? loadError.message
            : "상품 정보를 불러오지 못했습니다.",
        );
      },
    );
  }, [initialProductId]);

  useEffect(() => {
    function onClick(event: MouseEvent) {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return;
      }
      const link = (event.target as Element | null)?.closest<HTMLAnchorElement>(
        "a[data-product-editor-id]",
      );
      if (!link) return;
      event.preventDefault();
      open(link.dataset.productEditorId!, link.href);
    }

    function onPointerOver(event: PointerEvent) {
      const link = (event.target as Element | null)?.closest<HTMLAnchorElement>(
        "a[data-product-editor-id]",
      );
      const id = link?.dataset.productEditorId;
      if (id) void loadEditor(id).catch(() => undefined);
    }

    function onFocusIn(event: FocusEvent) {
      const link = (event.target as Element | null)?.closest<HTMLAnchorElement>(
        "a[data-product-editor-id]",
      );
      const id = link?.dataset.productEditorId;
      if (id) void loadEditor(id).catch(() => undefined);
    }

    function onPopState() {
      openedFromList.current = false;
      const id = new URL(location.href).searchParams.get("edit");
      setProductId(id);
      setEditor(null);
      setError(null);
      if (id) void load(id);
    }

    // Capture before Next.js <Link> handles the event; otherwise it would
    // start an unnecessary React Server Component navigation for the list.
    document.addEventListener("click", onClick, true);
    document.addEventListener("pointerover", onPointerOver);
    document.addEventListener("focusin", onFocusIn);
    window.addEventListener("popstate", onPopState);
    return () => {
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("pointerover", onPointerOver);
      document.removeEventListener("focusin", onFocusIn);
      window.removeEventListener("popstate", onPopState);
    };
  }, [load, open]);

  useEffect(() => {
    if (!productId) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [close, productId]);

  if (!productId) return null;

  const productIndex = productIds.indexOf(productId);
  const previousProductId =
    productIndex > 0 ? productIds[productIndex - 1] : undefined;
  const nextProductId =
    productIndex >= 0 && productIndex < productIds.length - 1
      ? productIds[productIndex + 1]
      : undefined;

  return (
    <>
      <button
        type="button"
        className="inventory-drawer-backdrop"
        onClick={close}
        aria-label="편집창 닫기"
      />
      <aside className="inventory-drawer" aria-label="상품 편집">
        <header className="inventory-drawer-head">
          <div>
            <span>상품 편집</span>
            <strong>
              {editor
                ? editor.product.title || editor.supplier.originalName
                : "상품 정보를 불러오는 중…"}
            </strong>
          </div>
          <div className="inventory-drawer-navigation">
            <span>
              {productIndex >= 0
                ? `${productIndex + 1} / ${productIds.length}`
                : ""}
            </span>
            <button
              type="button"
              onClick={() => navigate(previousProductId)}
              disabled={!previousProductId}
              aria-label="이전 상품"
              title="이전 상품"
            >
              ←
            </button>
            <button
              type="button"
              onClick={() => navigate(nextProductId)}
              disabled={!nextProductId}
              aria-label="다음 상품"
              title="다음 상품"
            >
              →
            </button>
            <button
              type="button"
              className="inventory-drawer-close"
              onClick={close}
              aria-label="닫기"
              title="닫기"
            >
              ×
            </button>
          </div>
        </header>
        {error ? (
          <div className="drawer-load-state error" role="alert">
            <strong>상품 정보를 불러오지 못했습니다.</strong>
            <p>{error}</p>
            <button type="button" onClick={() => void load(productId, true)}>
              다시 시도
            </button>
          </div>
        ) : editor ? (
          <ProductEditor
            key={editor.product.id}
            initial={editor}
            onMutated={() => editorCache.delete(productId)}
            onDirtyChange={setEditorDirty}
          />
        ) : (
          <DrawerSkeleton />
        )}
      </aside>
    </>
  );
}

function DrawerSkeleton() {
  return (
    <div className="drawer-load-state" aria-live="polite" aria-busy="true">
      <span className="drawer-spinner" />
      <strong>상품 정보를 불러오고 있습니다.</strong>
      <p>목록은 그대로 유지되며 편집 정보만 빠르게 가져옵니다.</p>
      <div className="drawer-skeleton-lines" aria-hidden="true">
        <i />
        <i />
        <i />
      </div>
    </div>
  );
}

function loadEditor(id: string, force = false) {
  const cached = editorCache.get(id);
  if (!force && cached && cached.expiresAt > Date.now()) return cached.promise;

  const promise = fetch(`/api/products/${encodeURIComponent(id)}`, {
    credentials: "same-origin",
    cache: "no-store",
    headers: { accept: "application/json" },
  })
    .then(async (response) => {
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(
          body?.error?.message ?? "상품 정보를 불러오지 못했습니다.",
        );
      }
      return body.data as ProductEditorInitial;
    })
    .catch((error) => {
      editorCache.delete(id);
      throw error;
    });

  editorCache.set(id, { expiresAt: Date.now() + PREFETCH_TTL_MS, promise });
  return promise;
}

function withoutEditParameter() {
  const url = new URL(location.href);
  url.searchParams.delete("edit");
  return `${url.pathname}${url.search}${url.hash}`;
}
