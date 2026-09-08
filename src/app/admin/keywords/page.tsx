import { requireAdminPage } from "@/lib/auth/admin";
import { withDbReadRecovery, type Database } from "@/lib/db";
import {
  createKeywordManagementService,
  keywordRuntimeStatus,
} from "@/modules/keywords/keyword-factory";
import { KeywordManager } from "./keyword-manager";
import { NaverStoreSettingsRepository } from "@/modules/channels/naver/naver-store-settings-repository";

export const dynamic = "force-dynamic";

export default async function KeywordManagementPage({
  searchParams,
}: {
  searchParams: Promise<{ product?: string }>;
}) {
  const params = await searchParams;
  return withDbReadRecovery((database) => renderPage(database, params.product));
}

async function renderPage(database: Database, productId?: string) {
  const user = await requireAdminPage(database);
  const service = createKeywordManagementService(database);
  const [items, stores] = await Promise.all([
    service.list(user.id),
    new NaverStoreSettingsRepository(database).list(user.id),
  ]);
  const selected = items.find((item) => item.id === productId) ?? items[0];
  const initialDetail = selected
    ? await service.get(user.id, selected.id)
    : null;
  return (
    <KeywordManager
      key={selected?.id ?? "empty"}
      initialItems={items}
      initialDetail={initialDetail}
      initialRuntime={keywordRuntimeStatus()}
      stores={stores.map((store) => ({
        id: store.id,
        name: store.storeName,
        url: store.storeUrl,
        isDefault: store.isDefault,
      }))}
    />
  );
}
