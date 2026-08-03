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
products → product_publications → Naver Commerce API adapter
```

판매 이미지에는 공급사 `http/https` URL, 네이버 이미지 업로드 반환 URL과 선택·대표·순서 메타데이터를 저장합니다. 대표 1개와 추가 9개까지 선택하며 이미지 파일 자체를 DB나 R2에 저장하지 않습니다. 판매 옵션은 원본 옵션과 별개의 그룹/값/조합 JSONB 모델입니다.

네이버 발행 정책의 배송정보는 판매자 주소록, 묶음배송 그룹, 계약된 반품 택배사를
커머스 API에서 읽어 선택하고 사용자 기본 정책 JSON에 저장합니다. 상품 편집에서는 이
기본값을 상속하며 예외 상품만 덮어씁니다. 외부 조회값은 선택 편의를 위한 것이며
Shoppingday가 네이버 판매자센터의 주소록이나 계약 정보를 변경하지 않습니다.

상태는 `draft → editing → ready`이며 `archived`는 내부 보관용입니다. ready 상품의 상품명·판매가·설명·이미지·옵션을 수정하면 `editing`으로 돌아갑니다. 네이버 발행 상태와 외부 상품번호, payload hash, 실패 정보는 `product_publications`에서 별도로 관리합니다.

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

## Growth product and keyword management

위탁 공급처의 재고 확인은 성장 상품에만 선택적으로 실행한다. 공급처가 API를 제공하지
않는 경우 로그인된 Chrome 확장 프로그램이 사용자가 등록한 상품 상세 페이지를
열고 `available`, `partial_sold_out`, `sold_out`, `discontinued`,
`auth_required`, `unknown` 중 하나와 판별 근거를 반환한다. 이번 MVP의 첫 adapter는
직감(`zicgam.com`)이며 Cafe24 상품·옵션 DOM만 읽는다. 결과는 성장 상품의
`product_input.supplierAvailabilityCheck`에 마지막 관측값으로 저장한다.

### 직감 전체 상품 가져오기

직감은 공식 API나 엑셀 내보내기를 제공하지 않으므로 서버에서 계정 정보를 보관해
크롤링하지 않는다. 사용자가 승인 계정으로 로그인한 Chrome에서 확장 프로그램이
카테고리·목록 페이지를 탐색하고 상품 상세를 한 건씩 읽는다. 각 상품은 로그인된
Shoppingday 탭으로 전달되며 관리자 세션을 사용하는
`/api/suppliers/zicgam/products/import`가 검증·저장한다.

직감 `product_no`를 공급처 외부 상품번호로 사용한다. 신규 상품은 기존
`supplier_products`·`products`·`product_supplier_links` 구조로 가져오고, 재실행 시
기존 판매 편집값을 덮어쓰지 않은 채 공급처 원본 스냅샷만 갱신한다. API가 한 상품을
저장한 뒤 다음 상세 페이지로 이동해 Worker와 DB에 대량 요청을 동시에 보내지 않는다.
중단 후 처음부터 다시 탐색하더라도 외부 상품번호 유일 제약으로 중복 생성되지 않는다.

전체상품 탐색은 홈에서 확인한 `전체상품` 목록 하나만 사용한다. URL의 페이지 번호와
페이지네이션에서 활성화된 번호가 일치하는지 확인하고 동일 목록의 `현재 + 1` 링크만
순차적으로 따른다. 활성 현재 페이지에 다음 번호가 없을 때만 마지막 페이지로
판정한다. 페이지 번호 건너뜀, URL·상품번호 반복, 로그인 리다이렉트, 빈 상품 목록,
탐색 중 표시 총수 변경은 오류로 중단한다. 마지막 페이지 이후에는 모든 페이지의 고유
`product_no` 수가 사이트가 현재 표시한 전체 상품 수와 정확히 일치해야만 상세 상품
저장을 시작한다. 표시 총수를 읽지 못한 경우에도 완전성을 추정하지 않고 중단한다.

전체 카탈로그 저장은 스마트스토어 자동 발행을 의미하지 않는다. 사용자가 위탁상품
목록에서 선별하고 등록 편집을 확인한 상품만 네이버 발행 흐름으로 넘긴다. 직감 DOM은
공식 계약이 아니므로 첫 실사용과 화면 변경 시 파서 선택자를 다시 검증한다.

상품별 확인은 현재 상품 한 건을 전경 탭에서 확인한다. `직감 전체 확인`은 성장상품
목록에서 유효한 직감 URL만 골라 전용 탭 하나를 재사용하며 순차 처리한다. 관리 화면이
각 결과를 전용 owner-scoped API로 저장한 뒤 다음 상품을 요청하므로 중간 중단 시에도
완료된 결과가 남는다. 로그인 필요 상태가 나오면 나머지 대기열을 중단한다.

확장 프로그램은 공급처 로그인 쿠키를 읽거나 서버로 전달하지 않는다. Shoppingday
관리 화면은 기존 관리자 세션으로 검증된 결과만 저장하며, 이 관측만으로 스마트스토어
상품을 자동 품절·단종 처리하지 않는다.

성장 상품 관리는 빠른 대량등록 흐름과 분리한다. 사용자가 판매 가능성을 확인한 스마트스토어 상품만 `keyword_managed_products`에 연결하며, 기존 내부 상품이 있으면 채널 상품번호로 찾은 로컬 발행 데이터만 초깃값으로 재사용한다. 공개되지 않은 판매자센터 API나 화면 크롤링으로 링크 내용을 가져오지 않는다.

성장 상품은 `store_connection_id`로 실제 스마트스토어 연결을 함께 저장한다. 상품명·검색 태그 반영 시 해당 연결로 채널 상품 전체 정보를 다시 조회하고, 사용자가 확인한 두 필드만 교체한 전체 수정 요청을 보낸다. 키워드 순위는 `keyword_rank_observations`에 확인 시각과 함께 실제 관찰값만 저장하며 자동 추정값을 만들지 않는다. 기본 PC 관측 경로는 `chrome-extension`의 Manifest V3 확장 프로그램이다. 로그인된 성장관리 페이지가 브라우저 이벤트로 사용자 요청을 전달하고 확장 프로그램이 실제 Chrome의 네이버쇼핑 가격비교 탭에서 광고를 제외한 최대 100개 상품을 확인한다. 결과 저장은 성장관리 페이지의 기존 관리자 세션으로만 수행하므로 확장 프로그램에 DB나 네이버 Secret을 저장하지 않는다.

```text
Admin /admin/keywords
  → owner-scoped Route Handlers
    → KeywordManagementService
      ├─ KeywordGenerationClient
      │   ├─ RulesKeywordClient
      │   └─ MockKeywordGenerationClient (development only)
      ├─ KeywordMetricsClient
      │   ├─ NaverSearchAdClient
      │   └─ MockKeywordMetricsClient
      └─ KeywordManagementRepository → PostgreSQL
```

`RulesKeywordClient`는 공급사 상품명을 결정적인 사전과 규칙으로 분류한다. 사용자가 핵심 상품 유형과 속성을 확인해 저장한 뒤에만 키워드 후보를 조합하고, 선택 키워드의 중복·동의 표현·금지어를 정리해 상품명 초안을 만든다. 생성형 AI 선택 경로는 없다.

`CommerceApiManagedProductImporter`는 관리 상품 추가 시 링크에서 검증한 채널 상품 번호로
인증된 커머스 API의 채널 상품을 조회한다. 본인 스토어 상품의 현재 상품명, 카테고리,
등록 속성, 판매자 태그만 `product_input` JSONB의 별도 필드에 보존하며 공급사 원본 상품명을
덮어쓰지 않는다. 조회는 기존 서버 직접 호출 또는 HMAC 서명 중계 경계를 그대로 사용한다.
권한이나 네트워크 오류는 상품 추가 전체를 실패시키지 않고 수동 입력 상태로 남긴다.

검색광고 클라이언트는 최대 5개 핵심 힌트로 연관 키워드를 확장하고, 정확한 검색량 보완 조회, HMAC-SHA256 서명, 타임아웃, 429·5xx 제한 재시도와 내부 모델 변환을 맡는다. `keyword_metric_cache`는 정규화 키워드 기준의 공유 외부 지표 캐시이며 기본 TTL은 24시간이다. 원문 `< 10`과 내부 정렬값 `9`를 함께 저장한다.

상품 편집의 판매용 상품명 추천은 `ProductTitleRecommendationService`를 사용한다. 현재
편집 중인 상품명과 선택 카테고리에서 상품 유형·소재·용도·수식어를 결정적인 규칙으로
분리하고, 네이버 검색광고 키워드 도구로 해당 조합의 실제 검색량과 관련 후보를
조회한다. 외부 연관어는 상품 유형 일치와 소재 충돌 검사를 통과해야 근거로 표시하며,
제목 자체에는 검증되지 않은 새 단어를 자동 삽입하지 않는다. API 실패 또는 인증정보
누락 시 규칙 결과와 한계 안내를 반환한다. 추천은 편집 폼에
미리보기로만 나타나며 사용자가 적용하고 기존 임시저장 흐름으로 저장한다.

데이터 소유권 경계:

- `keyword_managed_products`: 링크, 원본 입력, 사용자 편집 상품명, 최종 상품명
- `product_keyword_analyses`: 수정 가능한 분석 스냅샷과 입력 해시
- `keyword_candidates`: 규칙 또는 네이버 추천 근거, 실제 지표, 분류, 사용자 선택
- `generated_titles`: 생성 초안과 사용자 편집 결과 이력
- `keyword_metric_cache`: 비사용자별 공개 키워드 지표 캐시

앞의 네 테이블은 `owner_id` 조건을 모든 저장소 쿼리에 적용하고 Supabase `authenticated` 역할 RLS를 함께 사용한다. 캐시는 비밀값·인증 헤더·외부 원본 응답 전체를 저장하지 않는다.

`NaverApiHubClient`는 쇼핑 인사이트 비율 추세용 선택 adapter로 격리되어 있다. 네이버 카테고리 ID와 DataLab 카테고리 매핑 기준이 확정되지 않았고 비율은 실제 검색량이나 순위가 아니므로 이번 MVP UI와 자동 의사결정에는 연결하지 않는다.

소싱 조사는 `/admin/sourcing`과 `sourcing_researches` 테이블에 사용자별로 저장한다.
키워드 시장 수치, 국내 평균 가격, 위험 체크, 리뷰 메모, 1688 샘플 후보를 한 레코드로
관리한다. 최대 구매단가는 예상 판매가의 70%인 단순 참고값이며 실제 발주 전에는 수수료,
배송비, 관부가세, 포장비와 반품비를 포함해 다시 계산해야 한다. `owner_id` 조건과
Supabase authenticated RLS를 함께 적용한다.
