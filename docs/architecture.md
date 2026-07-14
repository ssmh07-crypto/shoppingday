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

## Security boundary

- Supabase 세션과 `user_profiles.role=admin`을 서버에서 확인합니다.
- 친구도매 인증정보와 DB 연결값은 server-only 환경변수입니다.
- 클라이언트는 내부 import API만 호출합니다.
- redirect 차단, timeout, body byte limit, Content-Type allowlist를 적용합니다.
- XML의 DTD/ENTITY를 선제 거부하고 entity processing을 비활성화합니다.
- 원본 XML과 인증 파라미터는 로그에 저장하지 않습니다.
- 외부 HTML 설명은 DOM에 직접 주입하지 않고 sandbox iframe에서 표시합니다.
