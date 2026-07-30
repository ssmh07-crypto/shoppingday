import { requireAdminPage } from "@/lib/auth/admin";
import { withDbReadRecovery, type Database } from "@/lib/db";
import {
  createKeywordManagementService,
  keywordRuntimeStatus,
} from "@/modules/keywords/keyword-factory";
import { KeywordManager } from "./keyword-manager";
import { NaverStoreSettingsRepository } from "@/modules/channels/naver/naver-store-settings-repository";
import "../admin-operations.css";

export const dynamic = "force-dynamic";

export default async function KeywordManagementPage() {
  return withDbReadRecovery((database) => renderPage(database));
}

async function renderPage(database: Database) {
  const user = await requireAdminPage(database);
  const service = createKeywordManagementService(database);
  const [items, stores] = await Promise.all([
    service.list(user.id),
    new NaverStoreSettingsRepository(database).list(user.id),
  ]);
  const initialDetail = items[0]
    ? await service.get(user.id, items[0].id)
    : null;
  return (
    <KeywordManager
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
