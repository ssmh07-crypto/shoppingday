import postgres from "postgres";

const connection = process.env.DATABASE_URL;
if (!connection) throw new Error("DATABASE_URL is required");
const database = postgres(connection, { max: 1 });
async function main() {
try {
  console.info(await database.unsafe("select count(*)::int as applied_migrations from drizzle.__drizzle_migrations"));
  console.info(await database.unsafe("select column_name from information_schema.columns where table_name = 'keyword_managed_products' and column_name in ('research_draft', 'research_version') order by column_name"));
  console.info(await database.unsafe("select relrowsecurity as price_queue_rls from pg_class where relname = 'supplier_price_applications'"));
  console.info(await database.unsafe("select count(*)::int as price_tasks from supplier_price_applications"));
  console.info(await database.unsafe("select count(*)::int as running_publications from product_publications where status in ('publishing','deleting')"));
  console.info(await database.unsafe("select count(*)::int as active_bulk_jobs from naver_bulk_jobs where status in ('queued','running')"));
  console.info(await database.unsafe("select count(*)::int as active_schedules, count(*) filter (where apply_prices)::int as automatic_price_schedules from supplier_sync_schedules where enabled"));
  console.info(await database.unsafe("select enumlabel from pg_enum join pg_type on pg_type.oid = enumtypid where typname = 'supplier_availability' order by enumsortorder"));
} finally { await database.end(); }
}
void main().catch(() => { console.error("Supplier operation DB verification failed"); process.exitCode = 1; });
