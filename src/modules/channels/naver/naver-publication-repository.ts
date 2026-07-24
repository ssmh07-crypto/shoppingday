import "server-only";
import { randomUUID } from "node:crypto";
import { and, eq, isNull, or, sql } from "drizzle-orm";
import type { Database } from "@/lib/db";
import {
  productAuditLogs,
  productPublications,
  products,
  type ProductPublicationRow,
} from "@/lib/db/schema";
import { ProductNotFoundError } from "@/modules/products/product-errors";

export class NaverPublicationRepository {
  constructor(private readonly database: Database) {}

  async findForProduct(productId: string, ownerId: string) {
    const [row] = await this.database
      .select({ publication: productPublications })
      .from(productPublications)
      .innerJoin(products, eq(products.id, productPublications.productId))
      .where(
        and(
          eq(productPublications.productId, productId),
          eq(productPublications.channel, "naver"),
          or(eq(products.ownerId, ownerId), isNull(products.ownerId)),
        ),
      )
      .limit(1);
    return row?.publication ?? null;
  }

  async beginPublishing(
    productId: string,
    ownerId: string,
    payloadHash: string,
    operation: "create" | "update",
  ) {
    assertPayloadHash(payloadHash);
    return this.database.transaction(async (tx) => {
      const [owned] = await tx
        .select({ id: products.id })
        .from(products)
        .where(
          and(
            eq(products.id, productId),
            or(eq(products.ownerId, ownerId), isNull(products.ownerId)),
          ),
        )
        .limit(1);
      if (!owned) throw new ProductNotFoundError();
      await tx
        .update(products)
        .set({ ownerId })
        .where(and(eq(products.id, productId), isNull(products.ownerId)));

      const [current] = await tx
        .select()
        .from(productPublications)
        .where(
          and(
            eq(productPublications.productId, productId),
            eq(productPublications.channel, "naver"),
          ),
        )
        .for("update")
        .limit(1);
      if (
        current?.status === "publishing" ||
        current?.status === "deleting"
      ) {
        throw new PublicationInProgressError();
      }
      if (operation === "create" && current?.originProductNo && current.status !== "deleted") {
        throw new PublicationAlreadyExistsError();
      }
      if (operation === "update" && !current?.originProductNo) {
        throw new PublicationNotPublishedError();
      }

      const requestId = randomUUID();
      let publication: ProductPublicationRow | undefined;
      if (current) {
        [publication] = await tx
          .update(productPublications)
          .set({
            status: "publishing",
            attemptedPayloadHash: payloadHash,
            lastRequestId: requestId,
            attemptCount: sql`${productPublications.attemptCount} + 1`,
            lastErrorCode: null,
            lastErrorMessage: null,
            lastErrorHttpStatus: null,
            lastAttemptedAt: new Date(),
            updatedAt: new Date(),
            ...(current.status === "deleted"
              ? { originProductNo: null, channelProductNo: null }
              : {}),
          })
          .where(eq(productPublications.id, current.id))
          .returning();
      } else {
        [publication] = await tx
          .insert(productPublications)
          .values({
            productId,
            channel: "naver",
            status: "publishing",
            attemptedPayloadHash: payloadHash,
            lastRequestId: requestId,
          })
          .onConflictDoNothing()
          .returning();
        if (!publication) throw new PublicationInProgressError();
      }
      await tx.insert(productAuditLogs).values({
        actorId: ownerId,
        entityId: productId,
        action: operation === "create" ? "naver_publication_started" : "naver_publication_update_started",
        changedFields: ["publicationStatus"],
        newValues: { status: "publishing", requestId },
        requestId,
      });
      return publication;
    });
  }

  async markPublished(
    publicationId: string,
    requestId: string,
    result: { originProductNo: string; channelProductNo: string },
  ) {
    return this.database.transaction(async (tx) => {
      const now = new Date();
      const [publication] = await tx
        .update(productPublications)
        .set({
          status: "published",
          originProductNo: result.originProductNo,
          channelProductNo: result.channelProductNo,
          lastPayloadHash: sql`${productPublications.attemptedPayloadHash}`,
          lastErrorCode: null,
          lastErrorMessage: null,
          lastErrorHttpStatus: null,
          publishedAt: now,
          lastSyncedAt: now,
          updatedAt: now,
        })
        .where(
          and(
            eq(productPublications.id, publicationId),
            eq(productPublications.lastRequestId, requestId),
            eq(productPublications.status, "publishing"),
          ),
        )
        .returning();
      if (!publication) throw new PublicationStaleAttemptError();
      await tx.insert(productAuditLogs).values({
        actorId: await publicationOwner(tx, publication.productId),
        entityId: publication.productId,
        action: "naver_publication_succeeded",
        changedFields: ["publicationStatus", "originProductNo", "channelProductNo"],
        newValues: {
          status: "published",
          originProductNo: result.originProductNo,
          channelProductNo: result.channelProductNo,
        },
        requestId,
      });
      return publication;
    });
  }

  async markFailed(
    publicationId: string,
    requestId: string,
    error: { code: string; message: string; httpStatus?: number },
  ) {
    return this.database.transaction(async (tx) => {
      const [publication] = await tx
        .update(productPublications)
        .set({
          status: "failed",
          lastErrorCode: error.code.slice(0, 100),
          lastErrorMessage: error.message.slice(0, 1000),
          lastErrorHttpStatus: error.httpStatus ?? null,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(productPublications.id, publicationId),
            eq(productPublications.lastRequestId, requestId),
            eq(productPublications.status, "publishing"),
          ),
        )
        .returning();
      if (!publication) throw new PublicationStaleAttemptError();
      await tx.insert(productAuditLogs).values({
        actorId: await publicationOwner(tx, publication.productId),
        entityId: publication.productId,
        action: "naver_publication_failed",
        changedFields: ["publicationStatus", "lastError"],
        newValues: { status: "failed", errorCode: error.code.slice(0, 100) },
        requestId,
      });
      return publication;
    });
  }
}

async function publicationOwner(
  database: Pick<Database, "select">,
  productId: string,
) {
  const [product] = await database
    .select({ ownerId: products.ownerId })
    .from(products)
    .where(eq(products.id, productId))
    .limit(1);
  if (!product?.ownerId) throw new ProductNotFoundError();
  return product.ownerId;
}

function assertPayloadHash(value: string) {
  if (!/^[0-9a-f]{64}$/.test(value)) throw new PublicationInvalidHashError();
}

export class PublicationInProgressError extends Error {}
export class PublicationAlreadyExistsError extends Error {}
export class PublicationNotPublishedError extends Error {}
export class PublicationStaleAttemptError extends Error {}
export class PublicationInvalidHashError extends Error {}
