import "server-only";
import { and, asc, eq, inArray } from "drizzle-orm";
import type { Database } from "@/lib/db";
import {
  products,
  productPublications,
  productSupplierLinks,
  supplierProducts,
  suppliers,
  supplierChangeApplications,
  userProfiles,
} from "@/lib/db/schema";
import { createConfiguredNaverClientForUser } from "@/modules/channels/naver/naver-category-service";
import { sanitizeDescription } from "@/modules/products/product-domain";
import type { SupplierChangeKind } from "./change-application-policy";

export async function applyNextSupplierChange(
  database: Database,
  ownerId: string,
  kinds: SupplierChangeKind[],
  supplierCode?: string,
  productIds?: string[],
) {
  if (!kinds.length) return { status: "idle" as const };
  const [candidate] = await database
    .select({
      id: supplierChangeApplications.id,
      productId: products.id,
      storeConnectionId: productPublications.storeConnectionId,
    })
    .from(supplierChangeApplications)
    .innerJoin(products, eq(products.id, supplierChangeApplications.productId))
    .innerJoin(
      productPublications,
      eq(productPublications.id, supplierChangeApplications.publicationId),
    )
    .innerJoin(
      supplierProducts,
      eq(supplierProducts.id, supplierChangeApplications.supplierProductId),
    )
    .innerJoin(suppliers, eq(suppliers.id, supplierProducts.supplierId))
    .where(
      and(
        eq(products.ownerId, ownerId),
        inArray(supplierChangeApplications.status, ["pending", "failed"]),
        inArray(supplierChangeApplications.kind, kinds),
        supplierCode ? eq(suppliers.code, supplierCode) : undefined,
        productIds?.length ? inArray(products.id, productIds) : undefined,
      ),
    )
    .orderBy(
      asc(supplierChangeApplications.createdAt),
      asc(supplierChangeApplications.id),
    )
    .limit(1);
  if (!candidate) return { status: "idle" as const };
  const client = await createConfiguredNaverClientForUser(
    database,
    ownerId,
    undefined,
    candidate.storeConnectionId,
  ).catch(() => null);
  return database.transaction(async (tx) => {
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
      .from(supplierChangeApplications)
      .where(eq(supplierChangeApplications.id, candidate.id))
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
    const [source] = await tx
      .select({
        availability: supplierProducts.availability,
        description: supplierProducts.rawDescription,
      })
      .from(supplierProducts)
      .innerJoin(
        productSupplierLinks,
        eq(productSupplierLinks.supplierProductId, supplierProducts.id),
      )
      .where(
        and(
          eq(supplierProducts.id, task.supplierProductId),
          eq(productSupplierLinks.productId, product.id),
          eq(productSupplierLinks.isPrimary, true),
        ),
      )
      .limit(1);
    const obsolete =
      !source ||
      !publication.originProductNo ||
      publication.status === "deleted" ||
      publication.remoteStatusType === "DELETE" ||
      (task.kind === "description"
        ? sanitizeDescription(source.description ?? "") !== task.targetValue ||
          ![task.previousValue, task.targetValue].includes(product.description)
        : source.availability !== task.targetValue);
    if (obsolete) {
      await tx
        .update(supplierChangeApplications)
        .set({
          status: "superseded",
          completedAt: new Date(),
          errorMessage:
            "공급처 최신값 또는 판매자 편집값이 달라져 반영하지 않았습니다.",
        })
        .where(eq(supplierChangeApplications.id, task.id));
      return { status: "superseded" as const, id: task.id };
    }
    const [profile] = await tx
      .select({ role: userProfiles.role })
      .from(userProfiles)
      .where(eq(userProfiles.userId, ownerId))
      .limit(1);
    if (profile?.role !== "admin") throw new Error("관리자 권한이 필요합니다.");
    try {
      if (
        !client ||
        !publication.channelProductNo ||
        publication.storeConnectionId !== candidate.storeConnectionId
      )
        throw new Error("store_unavailable");
      const originProductNo = publication.originProductNo!;
      const remote = await client.fetchChannelProduct(
        publication.channelProductNo,
      );
      if (
        remote.originProductNo !== originProductNo ||
        remote.originProduct.statusType === "DELETE"
      )
        throw new Error("publication_changed");
      if (task.kind === "description") {
        await client.changeSupplierDescription(originProductNo, {
          channelProductNo: publication.channelProductNo,
          previousValue: task.previousValue,
          targetValue: task.targetValue,
        });
        if (product.description !== task.targetValue)
          await tx
            .update(products)
            .set({
              description: task.targetValue,
              draftVersion: product.draftVersion + 1,
              status: "editing",
              readyAt: null,
              validationErrors: {},
              updatedAt: new Date(),
            })
            .where(eq(products.id, product.id));
      } else {
        const statusType =
          task.kind === "sold_out" ? "OUTOFSTOCK" : "SUSPENSION";
        // Do not weaken an existing seller suspension to out-of-stock.
        if (
          statusType === "OUTOFSTOCK" &&
          remote.originProduct.statusType === "SUSPENSION"
        )
          throw new Error("seller_suspended");
        if (remote.originProduct.statusType !== statusType)
          await client.changeProductStatus(originProductNo, { statusType });
        const verified = await client.fetchChannelProduct(
          publication.channelProductNo,
        );
        if (
          verified.originProductNo !== originProductNo ||
          verified.originProduct.statusType !== statusType
        )
          throw new Error("verification_failed");
        await tx
          .update(productPublications)
          .set({ remoteStatusType: statusType, updatedAt: new Date() })
          .where(eq(productPublications.id, publication.id));
      }
      await tx
        .update(supplierChangeApplications)
        .set({
          status: "succeeded",
          attempts: task.attempts + 1,
          completedAt: new Date(),
          errorMessage: null,
        })
        .where(eq(supplierChangeApplications.id, task.id));
      return { status: "succeeded" as const, id: task.id };
    } catch {
      const message =
        "반영 실패: 스토어·릴레이 연결과 스마트스토어 편집 상태를 확인한 뒤 재시도하세요.";
      await tx
        .update(supplierChangeApplications)
        .set({
          status: "failed",
          attempts: task.attempts + 1,
          errorMessage: message,
        })
        .where(eq(supplierChangeApplications.id, task.id));
      return { status: "failed" as const, id: task.id, message };
    }
  });
}
