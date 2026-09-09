import "server-only";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import type { Database } from "@/lib/db";
import {
  products,
  productPublications,
  supplierPriceApplications,
  userProfiles,
} from "@/lib/db/schema";
import { createConfiguredNaverClientForUser } from "@/modules/channels/naver/naver-category-service";

export async function applyNextSupplierPrice(
  database: Database,
  ownerId: string,
  supplierCode?: "dome" | "zicgam" | "ebulsamchon",
) {
  const [candidate] = await database
    .select({ id: supplierPriceApplications.id, productId: products.id, storeConnectionId: productPublications.storeConnectionId })
    .from(supplierPriceApplications)
    .innerJoin(products, eq(products.id, supplierPriceApplications.productId))
    .innerJoin(productPublications, eq(productPublications.id, supplierPriceApplications.publicationId))
    .where(
      and(
        eq(products.ownerId, ownerId),
        inArray(supplierPriceApplications.status, ["pending", "failed"]),
        supplierCode ? sql`exists (select 1 from product_supplier_links l join supplier_products sp on sp.id = l.supplier_product_id join suppliers s on s.id = sp.supplier_id where l.product_id = ${products.id} and s.code = ${supplierCode})` : undefined,
      ),
    )
    .orderBy(asc(supplierPriceApplications.createdAt))
    .limit(1);
  if (!candidate) return { status: "idle" as const };
  // Resolve configuration before opening a transaction: local DB pools use one connection.
  const client = await createConfiguredNaverClientForUser(database, ownerId, undefined, candidate.storeConnectionId).catch(() => null);
  return database.transaction(async (tx) => {
    // Same order as supplier import: product first, then application/publication.
    const [product] = await tx
      .select()
      .from(products)
      .where(
        and(
          eq(products.id, candidate.productId),
          eq(products.ownerId, ownerId),
        ),
      )
      .for("update", { skipLocked: true })
      .limit(1);
    if (!product) return { status: "busy" as const };
    const [task] = await tx
      .select()
      .from(supplierPriceApplications)
      .where(eq(supplierPriceApplications.id, candidate.id))
      .for("update")
      .limit(1);
    if (!task || !["pending", "failed"].includes(task.status))
      return { status: "busy" as const };
    const [publication] = await tx
      .select()
      .from(productPublications)
      .where(
        and(
          eq(productPublications.id, task.publicationId),
          eq(productPublications.productId, product.id),
        ),
      )
      .for("update", { skipLocked: true })
      .limit(1);
    if (!publication || ["publishing", "deleting"].includes(publication.status))
      return { status: "busy" as const };
    if (
      product.sellingPrice !== task.targetPrice ||
      !publication.originProductNo ||
      publication.status === "deleted" ||
      publication.remoteStatusType === "DELETE"
    ) {
      await tx
        .update(supplierPriceApplications)
        .set({ status: "superseded", completedAt: new Date() })
        .where(eq(supplierPriceApplications.id, task.id));
      return { status: "superseded" as const, id: task.id };
    }
    const [profile] = await tx
      .select({ role: userProfiles.role })
      .from(userProfiles)
      .where(eq(userProfiles.userId, ownerId))
      .limit(1);
    if (profile?.role !== "admin") throw new Error("관리자 권한이 필요합니다.");
    try {
      if (!publication.channelProductNo)
        throw new Error("등록된 채널 상품번호가 필요합니다.");
      if (!client || publication.storeConnectionId !== candidate.storeConnectionId) throw new Error("스토어 연결을 확인해 주세요.");
      const remote = await client.fetchChannelProduct(
        publication.channelProductNo,
      );
      if (
        remote.originProductNo !==
        publication.originProductNo
      )
        throw new Error("등록 상품 연결이 달라졌습니다.");
      if (remote.originProduct.salePrice !== task.targetPrice) {
        await client.changeSalePrice(
          publication.originProductNo,
          task.targetPrice,
        );
        const verified = await client.fetchChannelProduct(
          publication.channelProductNo,
        );
        if (verified.originProductNo !== publication.originProductNo || verified.originProduct.salePrice !== task.targetPrice)
          throw new Error(
            "네이버 판매가 반영을 확인하지 못했습니다. 다시 확인해 주세요.",
          );
      }
      await tx
        .update(supplierPriceApplications)
        .set({
          status: "succeeded",
          attempts: task.attempts + 1,
          attemptedAt: new Date(),
          completedAt: new Date(),
          errorMessage: null,
        })
        .where(eq(supplierPriceApplications.id, task.id));
      return { status: "succeeded" as const, id: task.id };
    } catch {
      const message =
        "가격 반영 실패: 스토어 연결·네이버 릴레이·상품 상태를 확인한 뒤 재시도하세요.";
      await tx
        .update(supplierPriceApplications)
        .set({
          status: "failed",
          attempts: task.attempts + 1,
          attemptedAt: new Date(),
          errorMessage: message,
        })
        .where(eq(supplierPriceApplications.id, task.id));
      return { status: "failed" as const, id: task.id, message };
    }
  });
}
