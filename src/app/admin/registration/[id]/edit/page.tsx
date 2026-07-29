import Link from "next/link";
import { redirect } from "next/navigation";
import { requireAdminPage } from "@/lib/auth/admin";
import { withDbReadRecovery, type Database } from "@/lib/db";
import { createSourcingResearchService } from "@/modules/sourcing/sourcing-factory";
import { RegistrationProductEditor } from "./registration-product-editor";

export const dynamic = "force-dynamic";

export default async function RegistrationEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return withDbReadRecovery((database) => renderPage(database, id));
}

async function renderPage(database: Database, researchId: string) {
  const user = await requireAdminPage(database);
  const research = await createSourcingResearchService(database).get(
    user.id,
    researchId,
  );
  if (!research.registrationProductId) {
    redirect("/admin/registration");
  }

  return (
    <>
      <header className="inventory-topbar registration-topbar">
        <div>
          <strong>상품 등록 편집</strong>
          <span>소싱 조사 결과를 스마트스토어 등록 정보로 완성합니다.</span>
        </div>
        <Link href="/admin/registration">등록관리로 돌아가기</Link>
      </header>
      <main className="registration-editor-page">
        <section className="registration-editor-heading">
          <div>
            <span>소싱 등록 전용 편집</span>
            <h1>{research.sourcingKeyword || "새 소싱 상품"}</h1>
            <p>
              이 초안은 일반 상품관리에 표시되지 않습니다. 상품명과 태그를
              확정하고 카테고리·속성·이미지·판매 정책을 확인하세요.
            </p>
          </div>
          <Link href="/admin/sourcing">소싱 조사 확인</Link>
        </section>
        <RegistrationProductEditor
          productId={research.registrationProductId}
          registrationContext={{
            researchId: research.id,
            sourcingKeyword: research.sourcingKeyword,
            relatedKeywords: research.relatedKeywords,
          }}
        />
      </main>
    </>
  );
}
