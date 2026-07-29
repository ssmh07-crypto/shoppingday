import { requireAdminPage } from "@/lib/auth/admin";
import { withDbReadRecovery, type Database } from "@/lib/db";
import { createSourcingResearchService } from "@/modules/sourcing/sourcing-factory";
import { SourcingWorkspace } from "./sourcing-workspace";

export const dynamic = "force-dynamic";

export default async function SourcingPage() {
  return withDbReadRecovery((database) => renderPage(database));
}

async function renderPage(database: Database) {
  const user = await requireAdminPage(database);
  const service = createSourcingResearchService(database);
  const items = await service.list(user.id);
  const initialDetail = items[0] ? await service.get(user.id, items[0].id) : null;
  return <SourcingWorkspace initialItems={items} initialDetail={initialDetail} />;
}
