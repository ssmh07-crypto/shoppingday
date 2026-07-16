import type { EditedOptions, SelectedImage } from "@/lib/db/schema";

export type ProductEditorInitial = {
  product: {
    id: string;
    status: string;
    title: string;
    searchTags: string[];
    sellingPrice: number | null;
    currency: string;
    description: string;
    categoryId: string | null;
    selectedImages: SelectedImage[];
    editedOptions: EditedOptions;
    draftVersion: number;
    updatedAt: string;
  };
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

export type ProductEditorCategory = { id: string; name: string };
