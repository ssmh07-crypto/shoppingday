import { requireAdminPage } from "@/lib/auth/admin";
import { withDbReadRecovery, type Database } from "@/lib/db";
import { createSourcingResearchService } from "@/modules/sourcing/sourcing-factory";
import { redirect } from "next/navigation";

export default async function EditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return withDbReadRecovery((database) => redirectToEditor(database, id));
}

async function redirectToEditor(database: Database, productId: string) {
  const user = await requireAdminPage(database);
  const researchId = await createSourcingResearchService(
    database,
  ).findRegistrationIdByProduct(user.id, productId);
  if (researchId) {
    redirect(`/admin/registration/${researchId}/edit`);
  }
  redirect(`/admin/products?edit=${encodeURIComponent(productId)}`);
}
