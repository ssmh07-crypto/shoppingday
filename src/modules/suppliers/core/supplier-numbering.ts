import "server-only";

import { and, asc, eq, ne } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "@/lib/db";
import { suppliers } from "@/lib/db/schema";

export const supplierProductNumberPrefixInputSchema = z.object({
  supplierCode: z.string().trim().min(1).max(50),
  prefix: z
    .string()
    .trim()
    .toUpperCase()
    .max(8)
    .regex(/^[A-Z0-9]*$/, "접두사는 영문 대문자와 숫자만 사용할 수 있습니다."),
});

export class SupplierNumberingRepository {
  constructor(private readonly database: Database) {}

  list() {
    return this.database
      .select({
        code: suppliers.code,
        name: suppliers.name,
        productNumberPrefix: suppliers.productNumberPrefix,
      })
      .from(suppliers)
      .where(ne(suppliers.code, "sourcing"))
      .orderBy(asc(suppliers.name));
  }

  async save(supplierCode: string, prefix: string) {
    const [supplier] = await this.database
      .update(suppliers)
      .set({
        productNumberPrefix: prefix || null,
        updatedAt: new Date(),
      })
      .where(
        and(eq(suppliers.code, supplierCode), ne(suppliers.code, "sourcing")),
      )
      .returning({
        code: suppliers.code,
        name: suppliers.name,
        productNumberPrefix: suppliers.productNumberPrefix,
      });
    return supplier ?? null;
  }
}

