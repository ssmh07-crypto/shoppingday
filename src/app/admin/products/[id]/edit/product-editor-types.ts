import type {
  EditedOptions,
  NaverProductAttribute,
  SelectedImage,
} from "@/lib/db/schema";
import type { ProductProcessingSettings } from "@/modules/products/product-processing-settings";

export type ProductEditorInitial = {
  settings: ProductProcessingSettings;
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
