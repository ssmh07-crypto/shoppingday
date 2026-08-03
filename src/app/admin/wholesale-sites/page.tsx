import { requireAdminPage } from "@/lib/auth/admin";
import { withDbReadRecovery, type Database } from "@/lib/db";
import { WholesaleSiteRepository } from "@/modules/wholesale-sites/wholesale-site-repository";
import { WholesaleSiteMemo } from "./wholesale-site-memo";
import "./wholesale-sites.css";

export const dynamic = "force-dynamic";

export default async function WholesaleSitesPage() {
  return withDbReadRecovery((database) => renderPage(database));
}

async function renderPage(database: Database) {
  const user = await requireAdminPage(database);
  const sites = await new WholesaleSiteRepository(database).list(user.id);

  return (
    <main className="wholesale-site-page">
      <header className="wholesale-site-heading">
        <div>
          <span className="inventory-eyebrow">SOURCING LINKS</span>
          <h1>도매사이트 메모장</h1>
          <p>자주 확인하는 도매사이트 주소와 이용 메모를 간단히 저장합니다.</p>
        </div>
        <strong>{sites.length}개 저장됨</strong>
      </header>
      <WholesaleSiteMemo
        initial={sites.map((site) => ({
          id: site.id,
          name: site.name,
          url: site.url,
          description: site.description,
          updatedAt: site.updatedAt.toISOString(),
        }))}
      />
    </main>
  );
}
