import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { DomeClient, DomeHttpResponse } from "./dome-client";
import type { SupplierProductsQuery } from "../core/types";

export class MockDomeClient implements DomeClient {
  constructor(
    private readonly fixtureDirectory = path.join(
      process.cwd(),
      "tests/fixtures/dome",
    ),
  ) {}

  async fetchProduct(
    goodsno?: string,
    _query?: SupplierProductsQuery,
  ): Promise<DomeHttpResponse> {
    void _query;
    const fixture =
      goodsno === undefined || goodsno === "434379"
        ? "product-normal.xml"
        : "product-empty.xml";
    return {
      xml: await readFile(path.join(this.fixtureDirectory, fixture), "utf8"),
      status: 200,
    };
  }
}
