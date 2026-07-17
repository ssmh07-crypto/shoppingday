import sanitizeHtml from "sanitize-html";
import { z } from "zod";
import type {
  EditedOptions,
  ProductRow,
  SelectedImage,
  SupplierProductRow,
} from "@/lib/db/schema";
import type { SupplierProduct } from "@/modules/suppliers/core/types";

export const PRODUCT_LIMITS = {
  title: 200,
  tags: 20,
  tagLength: 30,
  price: 1_000_000_000,
  description: 200_000,
  images: 30,
  groups: 3,
  values: 50,
  combinations: 500,
} as const;
export const titleInputSchema = z.object({
  draftVersion: z.number().int().positive(),
  title: z.string().trim().min(1, "상품명을 입력해 주세요.").max(PRODUCT_LIMITS.title),
});
const safeUrl = z
  .url()
  .refine(
    (value) => ["http:", "https:"].includes(new URL(value).protocol),
    "이미지는 http 또는 https URL만 사용할 수 있습니다.",
  );
export const imageSchema = z.object({
  id: z.string().min(1).max(100),
  source: z.enum(["supplier", "upload"]),
  sourceUrl: safeUrl,
  storedUrl: safeUrl.nullable(),
  altText: z.string().max(200),
  sortOrder: z.number().int().min(0),
  isPrimary: z.boolean(),
  enabled: z.boolean(),
});
const optionValueSchema = z.object({
  id: z.string().min(1).max(100),
  name: z.string().trim().min(1, "옵션값을 입력해 주세요.").max(100),
  enabled: z.boolean(),
});
const optionGroupSchema = z
  .object({
    id: z.string().min(1).max(100),
    name: z.string().trim().min(1, "옵션 그룹명을 입력해 주세요.").max(100),
    values: z.array(optionValueSchema).max(PRODUCT_LIMITS.values),
  })
  .superRefine((group, ctx) => {
    const names = new Set<string>();
    group.values.forEach((value, index) => {
      const key = value.name.toLocaleLowerCase();
      if (names.has(key))
        ctx.addIssue({
          code: "custom",
          path: ["values", index, "name"],
          message: "동일 그룹에 중복 옵션값이 있습니다.",
        });
      names.add(key);
    });
  });
const combinationSchema = z.object({
  id: z.string().min(1).max(100),
  valueIds: z.array(z.string().min(1)).max(10),
  additionalPrice: z.number().int("추가금은 정수여야 합니다."),
  stock: z
    .number()
    .int("재고는 정수여야 합니다.")
    .min(0, "재고는 0 이상이어야 합니다."),
  enabled: z.boolean(),
  supplierOptionReference: z.string().max(200).nullable(),
});
export const editedOptionsSchema = z
  .object({
    groups: z.array(optionGroupSchema).max(PRODUCT_LIMITS.groups),
    combinations: z.array(combinationSchema).max(PRODUCT_LIMITS.combinations),
  })
  .superRefine((options, ctx) => {
    const knownValueIds = new Set(
      options.groups.flatMap((group) => group.values.map((value) => value.id)),
    );
    const combinations = new Set<string>();
    options.combinations.forEach((item, index) => {
      const uniqueValueIds = new Set(item.valueIds);
      if (uniqueValueIds.size !== item.valueIds.length)
        ctx.addIssue({
          code: "custom",
          path: ["combinations", index, "valueIds"],
          message: "하나의 조합에 동일한 옵션값을 중복해 사용할 수 없습니다.",
        });
      item.valueIds.forEach((valueId, valueIndex) => {
        if (!knownValueIds.has(valueId))
          ctx.addIssue({
            code: "custom",
            path: ["combinations", index, "valueIds", valueIndex],
            message: "존재하지 않는 옵션값입니다.",
          });
      });
      const key = [...item.valueIds].sort().join("|");
      if (combinations.has(key))
        ctx.addIssue({
          code: "custom",
          path: ["combinations", index],
          message: "중복된 옵션 조합이 있습니다.",
        });
      combinations.add(key);
    });
  });
export const draftInputSchema = z.object({
  draftVersion: z.number().int().positive(),
  title: z.string().trim().max(PRODUCT_LIMITS.title),
  searchTags: z
    .array(z.string())
    .transform(normalizeTags)
    .pipe(
      z
        .array(z.string().min(1).max(PRODUCT_LIMITS.tagLength))
        .max(PRODUCT_LIMITS.tags),
    ),
  sellingPrice: z
    .number()
    .int()
    .positive()
    .max(PRODUCT_LIMITS.price)
    .nullable(),
  currency: z.literal("KRW").default("KRW"),
  description: z
    .string()
    .max(PRODUCT_LIMITS.description)
    .transform(sanitizeDescription),
  categoryId: z.uuid().nullable(),
  naverCategoryId: z.string().trim().regex(/^\d+$/).max(20).nullable(),
  selectedImages: z
    .array(imageSchema)
    .max(PRODUCT_LIMITS.images)
    .transform(normalizeImages),
  editedOptions: editedOptionsSchema,
});
export type DraftInput = z.infer<typeof draftInputSchema>;

export function normalizeTags(tags: string[]) {
  const seen = new Set<string>();
  return tags
    .map((tag) => tag.trim())
    .filter((tag) => {
      const key = tag.toLocaleLowerCase();
      if (!tag || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}
export function normalizeImages(images: SelectedImage[]) {
  return images.map((image, sortOrder) => ({ ...image, sortOrder }));
}
export function sanitizeDescription(html: string) {
  return sanitizeHtml(html, {
    allowedTags: [
      "p",
      "br",
      "strong",
      "em",
      "u",
      "s",
      "ul",
      "ol",
      "li",
      "h1",
      "h2",
      "h3",
      "blockquote",
      "a",
      "img",
      "table",
      "thead",
      "tbody",
      "tr",
      "th",
      "td",
    ],
    allowedAttributes: {
      a: ["href", "target", "rel"],
      img: ["src", "alt"],
      "*": [],
    },
    allowedSchemes: ["http", "https"],
    transformTags: {
      a: sanitizeHtml.simpleTransform("a", {
        rel: "noopener noreferrer",
        target: "_blank",
      }),
    },
  });
}
export function readyErrors(
  input: Omit<DraftInput, "draftVersion">,
): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!input.title) errors.title = "상품명을 입력해 주세요.";
  if (!input.sellingPrice)
    errors.sellingPrice = "판매가는 0보다 큰 정수여야 합니다.";
  if (!input.naverCategoryId)
    errors.naverCategoryId = "네이버 최종 카테고리를 선택해 주세요.";
  const enabled = input.selectedImages.filter((i) => i.enabled);
  if (enabled.filter((i) => i.isPrimary).length !== 1)
    errors.selectedImages = "활성화된 대표 이미지를 하나 지정해 주세요.";
  if (!input.description.trim())
    errors.description = "상세설명을 입력해 주세요.";
  if (
    input.editedOptions.groups.length &&
    !input.editedOptions.combinations.some((c) => c.enabled)
  )
    errors.editedOptions = "활성 옵션 조합을 하나 이상 설정해 주세요.";
  return errors;
}
export function statusAfterSave(
  current: ProductRow["status"],
  changed: string[],
) {
  if (
    current === "ready" &&
    changed.some((field) =>
      [
        "title",
        "sellingPrice",
        "description",
        "naverCategoryId",
        "selectedImages",
        "editedOptions",
      ].includes(field),
    )
  )
    return "editing" as const;
  return current === "draft" ? ("editing" as const) : current;
}
export function optionsFromSupplier(
  options: Array<{ name: string; price: number | null }>,
): EditedOptions {
  if (!options.length) return { groups: [], combinations: [] };
  const values = options.map((o, i) => ({
    id: `supplier-${i}`,
    name: o.name,
    enabled: true,
  }));
  return {
    groups: [{ id: "supplier-options", name: "옵션", values }],
    combinations: values.map((v, i) => ({
      id: `supplier-combination-${i}`,
      valueIds: [v.id],
      additionalPrice: options[i]?.price ?? 0,
      stock: 999,
      enabled: true,
      supplierOptionReference: String(i),
    })),
  };
}
export function imagesFromSupplier(urls: string[]): SelectedImage[] {
  return urls
    .filter((url) => safeUrl.safeParse(url).success)
    .slice(0, PRODUCT_LIMITS.images)
    .map((sourceUrl, index) => ({
      id: `supplier-${index}`,
      source: "supplier",
      sourceUrl,
      storedUrl: null,
      altText: "",
      sortOrder: index,
      isPrimary: index === 0,
      enabled: true,
    }));
}

export function supplierProductChanged(
  current: SupplierProductRow,
  incoming: SupplierProduct,
) {
  return (
    current.originalName !== incoming.originalName ||
    normalizePrice(current.supplierPrice) !==
      normalizePrice(incoming.supplierPrice) ||
    current.currency !== incoming.currency ||
    current.availability !== incoming.availability ||
    JSON.stringify(current.originalImages) !==
      JSON.stringify(incoming.images) ||
    JSON.stringify(current.originalOptions) !==
      JSON.stringify(incoming.options) ||
    current.rawDescription !== incoming.rawDescription ||
    current.supplierCreatedAt?.getTime() !==
      incoming.supplierCreatedAt?.getTime() ||
    current.supplierUpdatedAt?.getTime() !==
      incoming.supplierUpdatedAt?.getTime()
  );
}

function normalizePrice(value: string | number | null) {
  if (value === null) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
