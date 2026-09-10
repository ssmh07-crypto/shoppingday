import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/admin";
import { withDbSession } from "@/lib/db";
import { DrizzleProductRepository } from "@/modules/products/product-repository";

const providerSchema = z.enum(["zicgam", "ebulsamchon"]);

export async function GET(
  _: Request,
  context: { params: Promise<{ provider: string }> },
) {
  return withDbSession(async (database) => {
    const user = await requireAdmin(database);
    const { provider } = z
      .object({ provider: providerSchema })
      .parse(await context.params);
    const imported = await new DrizzleProductRepository(database).listImported(
      provider,
      { registeredOnly: true, ownerId: user.id },
    );
    const targets = imported.map((record) => ({
      externalProductId: record.supplierProduct.externalProductId,
      url: registeredProductUrl(
        provider,
        record.supplierProduct.externalProductId,
        record.supplierProduct.rawPayload.url,
      ),
    }));
    return NextResponse.json(
      { success: true, provider, targets },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  });
}

function registeredProductUrl(
  provider: z.infer<typeof providerSchema>,
  externalProductId: string,
  savedUrl: unknown,
) {
  const hostname =
    provider === "zicgam" ? "zicgam.com" : "xn--wr3bq2dn2hzng.com";
  if (typeof savedUrl === "string") {
    try {
      const url = new URL(savedUrl);
      if (
        url.protocol === "https:" &&
        url.hostname === hostname &&
        url.pathname === "/product/detail.html" &&
        url.searchParams.get("product_no") === externalProductId
      ) {
        return url.toString();
      }
    } catch {
      // Old imports can have an absent or malformed source URL. Rebuild it
      // from the supplier product number kept in our database.
    }
  }
  return `https://${hostname}/product/detail.html?product_no=${encodeURIComponent(externalProductId)}`;
}
