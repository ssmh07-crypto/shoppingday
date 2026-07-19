export type ProductTitleTemplate = {
  id: string;
  categoryIncludes: string[];
  order: "attribute-first" | "type-first";
};

export const productTitleTemplates: ProductTitleTemplate[] = [
  {
    id: "parts-and-consumables",
    categoryIncludes: ["부품", "소모품", "교체용", "액세서리"],
    order: "type-first",
  },
  {
    id: "default",
    categoryIncludes: [],
    order: "attribute-first",
  },
];

export function resolveProductTitleTemplate(category: string) {
  return productTitleTemplates.find(
    (template) =>
      template.categoryIncludes.length > 0 &&
      template.categoryIncludes.some((term) => category.includes(term)),
  ) ?? productTitleTemplates.at(-1)!;
}
