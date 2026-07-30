type RegistrationDisplayInput = {
  expectedSellingPrice: number | null;
  productSellingPrice: number | null;
  registrationProductId: string | null;
  productStatus: string | null;
  smartstorePublished: boolean;
};

export function registrationDisplay(input: RegistrationDisplayInput) {
  if (input.smartstorePublished) {
    return {
      sellingPrice: input.productSellingPrice,
      statusClassName: "published",
      statusLabel: "스마트스토어 등록완료",
    };
  }

  if (!input.registrationProductId) {
    return {
      sellingPrice: input.expectedSellingPrice,
      statusClassName: "waiting",
      statusLabel: "초안 생성 전",
    };
  }

  const status = input.productStatus ?? "draft";
  const labels: Record<string, string> = {
    draft: "입력 대기",
    editing: "편집 중",
    ready: "등록 준비 완료",
    archived: "보관",
  };
  return {
    sellingPrice: input.expectedSellingPrice,
    statusClassName: status,
    statusLabel: labels[status] ?? status,
  };
}
