# Architecture

## Supplier boundary

`modules/suppliers/core`는 공급처 독립적인 `SupplierAdapter`, 표준 `SupplierProduct`, 오류 코드를 정의합니다. `modules/suppliers/dome`만 친구도매 요청 및 XML 구조를 이해합니다. products 모듈, Route Handler, UI는 XML 태그를 참조하지 않습니다.

```text
Admin UI → import Route → ProductImportService → SupplierAdapter
                                      ├──────→ ProductRepository → PostgreSQL
                                      └──────→ ApiCallLogRepository

DomeAdapter → DomeClient → size/content-type/timeout checks
            → safe XML parser → validated Dome DTO → SupplierProduct mapper
```

`LiveDomeClient`와 `MockDomeClient`는 같은 인터페이스를 사용합니다. 향후 기간/품절 조회는 supplier request 타입과 adapter 기능을 확장하되 products 모듈로 친구도매 필드를 유출하지 않습니다.

## Storage flow

import 트랜잭션은 `supplier_products` 원본 저장, `products` draft 생성, `product_supplier_links` 연결을 모두 성공시키거나 모두 rollback합니다. `(supplier_id, external_product_id)` unique 제약이 동시 요청의 최종 중복 방어선입니다. API 호출 로그는 외부 호출 결과를 보존하기 위해 업무 트랜잭션과 분리되며, 로그 저장 실패가 상품 import를 되돌리지는 않습니다.

원본 이미지 URL은 JSONB에 저장됩니다. 승인된 Cloudflare R2 adapter는 별도 storage 모듈에 격리돼 있고 이번 import 단계에서는 다운로드나 업로드를 수행하지 않습니다.

## Product editing boundary

`supplier_products`는 공급처 원본의 읽기 전용 스냅샷이고 `products`는 사용자가 관리하는 판매 마스터입니다. 가져오기 시 현재 관리자를 `owner_id`로 즉시 저장하고, 원본 상품명·이미지·옵션을 판매 초깃값으로 단 한 번 복사합니다. 이후 원본 갱신은 판매 필드를 덮어쓰지 않습니다.

```text
Admin UI → ProductEditService → ProductEditRepository → products
                               └→ product_audit_logs
supplier_products ── read only ─┘
products → (next phase) product_publications → marketplace adapters
```

판매 이미지에는 공급사 `http/https` URL과 선택·대표·순서 메타데이터만 저장합니다. 이미지 파일 저장이나 R2 업로드는 하지 않습니다. 판매 옵션은 원본 옵션과 별개의 그룹/값/조합 JSONB 모델입니다.

상태는 `draft → editing → ready`이며 `archived`는 내부 보관용입니다. ready 상품의 상품명·판매가·설명·이미지·옵션을 수정하면 `editing`으로 돌아갑니다. 마켓 게시 상태는 향후 `product_publications`에서 별도로 관리합니다.

저장은 클라이언트가 읽은 `draft_version`과 DB 값을 비교합니다. 일치하는 조건부 UPDATE만 성공하며 버전을 1 증가시키고 같은 트랜잭션에서 요약 감사 로그를 기록합니다.

## Security boundary

- Supabase 세션과 `user_profiles.role=admin`을 서버에서 확인합니다.
- 친구도매 인증정보와 DB 연결값은 server-only 환경변수입니다.
- 클라이언트는 내부 import API만 호출합니다.
- redirect 차단, timeout, body byte limit, Content-Type allowlist를 적용합니다.
- XML의 DTD/ENTITY를 선제 거부하고 entity processing을 비활성화합니다.
- 원본 XML과 인증 파라미터는 로그에 저장하지 않습니다.
- 외부 HTML 설명은 DOM에 직접 주입하지 않고 sandbox iframe에서 표시합니다.

## Cloudflare runtime

OpenNext는 Next.js App Router·Server Components·Route Handlers의 산출물을 Cloudflare Workers 모듈과 정적 assets로 변환하는 배포 adapter입니다. `wrangler.jsonc`는 `nodejs_compat`을 활성화해 Postgres.js와 기존 서버 모듈을 실행합니다. Supabase는 인증과 PostgreSQL system of record로 유지되며, Cloudflare에는 이미지 저장소를 추가하지 않습니다.

Next.js 16 `proxy.ts`는 Node middleware로 빌드되어 현재 OpenNext에서 지원되지 않으므로, 세션 쿠키 갱신만 Edge `middleware.ts`가 담당합니다. 실제 관리자 인증·인가는 기존처럼 Route Handler와 서버 페이지에서 다시 검증합니다.
