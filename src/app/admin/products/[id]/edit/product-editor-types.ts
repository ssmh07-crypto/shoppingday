import type {
  EditedOptions,
  NaverProductAttribute,
  SelectedImage,
} from "@/lib/db/schema";
import type { SourcingRelatedKeyword } from "@/modules/sourcing/types";
import type { ProductProcessingSettings } from "@/modules/products/product-processing-settings";
import type { NaverPublicationPolicyData, NaverPublicationPolicyOverrides } from "@/lib/db/schema";

export type ProductEditorInitial = {
  settings: ProductProcessingSettings;
  naverPublicationPolicy: {
    defaults: NaverPublicationPolicyData;
    overrides: NaverPublicationPolicyOverrides;
    effective: NaverPublicationPolicyData;
  };
  product: {
    id: string;
    status: string;
    title: string;
    searchTags: string[];
    sellingPrice: number | null;
    currency: string;
    description: string;
    categoryId: string | null;
    naverCategoryId: string | null;
    selectedImages: SelectedImage[];
    editedOptions: EditedOptions;
    naverAttributes: NaverProductAttribute[];
    draftVersion: number;
    updatedAt: string;
  };
  naverCategory: {
    id: string;
    name: string;
    wholeCategoryName: string;
  } | null;
  supplier: {
    name: string;
    externalProductId: string;
    originalName: string | null;
    supplierPrice: string | null;
    currency: string;
    availability: string;
    originalImages: string[];
    originalOptions: Array<{ name: string; price: number | null }>;
    lastSyncedAt: string;
  };
};

export type NaverCategoryOption = {
  id: string;
  name: string;
  wholeCategoryName: string;
  last: boolean;
};

export type SourcingRegistrationContext = {
  researchId: string;
  sourcingKeyword: string;
  relatedKeywords: SourcingRelatedKeyword[];
};
