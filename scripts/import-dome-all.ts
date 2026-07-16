import { asc, eq } from "drizzle-orm";
import { closeDb, getDb } from "@/lib/db";
import { userProfiles } from "@/lib/db/schema";
import { createDomeImportService } from "@/modules/suppliers/dome/dome-service";

async function main() {
  if (!process.argv.includes("--confirm")) {
    throw new Error(
      "실제 친구도매 API와 Supabase DB를 사용하려면 --confirm을 붙여 주세요.",
    );
  }

  // The production Worker keeps a smaller default for interactive requests.
  // This dedicated Node process has enough memory for the measured 7.85 MiB
  // catalog response and always performs the real initial import.
  process.env.DOME_API_MOCK_MODE = "false";
  process.env.DOME_API_MAX_RESPONSE_BYTES = String(20 * 1024 * 1024);

  const [admin] = await getDb()
    .select({ userId: userProfiles.userId })
    .from(userProfiles)
    .where(eq(userProfiles.role, "admin"))
    .orderBy(asc(userProfiles.createdAt))
    .limit(1);

  if (!admin) throw new Error("user_profiles에 admin 사용자가 없습니다.");

  console.info("친구도매 전체 상품 가져오기를 시작합니다.");
  const result = await createDomeImportService().importAll(
    admin.userId,
    (progress) => {
      console.info(
        `진행 ${progress.processed}/${progress.total} ` +
          `(신규 ${progress.created}, 변경 ${progress.updated}, 동일 ${progress.unchanged})`,
      );
    },
  );
  console.info(
    `완료: 총 ${result.total}개, 신규 ${result.created}개, ` +
      `변경 ${result.updated}개, 동일 ${result.unchanged}개`,
  );
}

void main()
  .catch((error) => {
    console.error(
      error instanceof Error
        ? error.message
        : "전체 상품 가져오기에 실패했습니다.",
    );
    process.exitCode = 1;
  })
  .finally(closeDb);
