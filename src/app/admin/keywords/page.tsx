import { requireAdminPage } from "@/lib/auth/admin";
import { withDbReadRecovery, type Database } from "@/lib/db";
import {
  createKeywordManagementService,
  keywordRuntimeStatus,
} from "@/modules/keywords/keyword-factory";
import { KeywordManager } from "./keyword-manager";

export const dynamic = "force-dynamic";

export default async function KeywordManagementPage() {
  return withDbReadRecovery((database) => renderPage(database));
}

async function renderPage(database: Database) {
  const user = await requireAdminPage(database);
  const service = createKeywordManagementService(database);
  const items = await service.list(user.id);
  const initialDetail = items[0] ? await service.get(user.id, items[0].id) : null;
  return (
    <KeywordManager
      initialItems={items}
      initialDetail={initialDetail}
      initialRuntime={keywordRuntimeStatus()}
    />
  );
}

