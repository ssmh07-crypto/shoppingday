# Modular PIM

Next.js App Router, Supabase Auth/PostgreSQL, Drizzle ORM 기반의 모듈형 PIM입니다. 친구도매 상품 동기화와 판매용 상품 편집, 네이버 커머스API 연동, 판매 반응이 확인된 스마트스토어 상품의 키워드 관리를 제공합니다.

세션이 초기화된 뒤 작업을 재개할 때는 먼저 [`docs/NEXT_SESSION.md`](docs/NEXT_SESSION.md)와 [`docs/ARCHITECTURE_DECISIONS.md`](docs/ARCHITECTURE_DECISIONS.md)를 확인합니다.

스마트스토어 및 네이버 커머스API 연동 참고 링크는 [`docs/naver-commerce-api.md`](docs/naver-commerce-api.md)에 기록합니다.

## 환경 변수

`.env.example`을 `.env.local`로 복사해 설정합니다. 실제 인증값은 저장소에 커밋하지 않습니다.

- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`: Supabase 브라우저/SSR 인증
- `DATABASE_URL`: 서버 전용 PostgreSQL 연결 문자열
- `SUPABASE_SERVICE_ROLE_KEY`: 향후 서버 관리 작업용이며 클라이언트에서 사용하지 않음
- `DOME_API_URL`: 기본값 `https://79dome.com/Api/ProductSelect_Api_UTF8.php`
- `DOME_API_ID`, `DOME_API_KEY`: mock이 아닐 때 필수인 서버 전용 인증값
- `DOME_API_MOCK_MODE`: `true`이면 실제 친구도매 API를 호출하지 않음
- `DOME_API_TIMEOUT_MS`: HTTP 제한 시간(기본 10초)
- `DOME_API_MAX_RESPONSE_BYTES`: 응답 본문 최대 크기(기본 5 MiB)
- `R2_*`: 승인된 Cloudflare R2 저장소 설정. 이번 단계에서는 원본 이미지 URL만 보존하므로 아직 import 흐름에서 사용하지 않음
- `NAVER_COMMERCE_CLIENT_ID`, `NAVER_COMMERCE_CLIENT_SECRET`: 서버 전용 네이버 커머스API 애플리케이션 인증정보
- `NAVER_COMMERCE_TOKEN_TYPE`: 본인 스토어는 `SELF`(기본값), 판매자 계정 연동 방식은 `SELLER`
- `NAVER_COMMERCE_ACCOUNT_ID`: `SELLER` 방식에서만 필요한 판매자 계정 ID
- `USE_MOCK_EXTERNAL_APIS`: `true`이면 성장 상품 분석과 검색량 조회에 고정 fixture 사용. 운영 환경에서는 활성화할 수 없음
- `NAVER_SEARCH_AD_API_KEY`, `NAVER_SEARCH_AD_SECRET_KEY`, `NAVER_SEARCH_AD_CUSTOMER_ID`: 검색광고 키워드 도구용 서버 전용 인증정보
- `NAVER_SEARCH_AD_API_URL`, `NAVER_SEARCH_AD_TIMEOUT_MS`: 검색광고 API 주소와 응답 제한 시간
- `NAVER_API_HUB_CLIENT_ID`, `NAVER_API_HUB_CLIENT_SECRET`: 향후 쇼핑 인사이트 추세 보조 데이터용 선택 설정. 이번 MVP 화면에서는 사용하지 않음
- `KEYWORD_METRICS_CACHE_HOURS`: 검색량 캐시 유효시간(기본 24시간)
- `KEYWORD_CANDIDATE_COUNT`: 규칙 후보와 네이버 연관 후보를 합친 최대 수(기본 30개)
- `GENERATED_TITLE_MAX_LENGTH`: 상품명 초안 최대 길이(기본 60자)

## 실행

```bash
npm install
npm run db:migrate
npm run dev
```

Supabase 사용자 UUID와 같은 `user_profiles.user_id` 레코드의 `role`을 `admin`으로 설정해야 `/admin` 및 import API를 사용할 수 있습니다.

## Mock 모드

```dotenv
DOME_API_MOCK_MODE=true
```

mock 모드에서 `goodsno=434379`는 `tests/fixtures/dome/product-normal.xml`을 반환하고, 다른 번호는 상품 없음 fixture를 반환합니다. 실제 API ID와 Key는 필요하지 않습니다. `/admin/products/import`에서 버튼을 눌렀을 때만 import가 실행됩니다.

성장 상품 관리도 외부 API 키 없이 전체 흐름을 확인할 수 있습니다.

```dotenv
USE_MOCK_EXTERNAL_APIS=true
```

`/admin/keywords`에서 스마트스토어 상품 링크를 연결하고 상품 분석, 고정 검색량 조회, 소형·중형·대형 필터, 키워드 선택, 상품명 초안 생성과 저장을 확인합니다. 모든 Mock 값은 화면에 `Mock`으로 표시되며 무작위로 바뀌지 않습니다. `NODE_ENV=production`에서는 Mock 모드가 켜져 있으면 서버 환경변수 검증이 실패합니다.

최초 전체 상품 가져오기는 Cloudflare Workers의 CPU 제한을 피하기 위해 Node.js 관리 명령으로 실행합니다. 실제 친구도매 API를 1회 호출하고 100개마다 진행 상황을 출력합니다. 기존 상품은 `supplier_products` 원본만 갱신하고 판매용 편집값은 유지합니다.

```bash
npm run import:all -- --confirm
```

이 명령은 `.env.local`의 친구도매 인증정보와 `DATABASE_URL`을 사용하며, DB에서 가장 먼저 생성된 admin 사용자를 신규 상품의 소유자로 지정합니다. 운영 화면에서는 상품번호별 가져오기와 명시적 갱신만 실행합니다.

흐름은 관리자 인증 → goodsno 검증 → DB 중복 확인 → 공급처 호출 → 크기/Content-Type/XML 검증 → 표준 공급처 상품 매핑 → 트랜잭션 저장 → 민감정보가 제거된 호출 로그 저장 순서입니다.

## 판매 상품 편집

`/admin/products`에서 DB에 저장된 상품을 검색·필터·정렬하고 `/admin/products/:id/edit`에서 공급처 원본과 분리된 판매 정보를 편집합니다. 상품명, 태그, 판매가, 내부 카테고리, 설명 HTML, 이미지 URL의 선택/대표/순서 메타데이터, 옵션 JSON을 수동 임시저장할 수 있습니다. 이미지 파일 자체는 DB·Supabase Storage·R2 어느 곳에도 저장하지 않습니다.

저장에는 `draft_version` 낙관적 잠금을 적용하며 변경 여부, 저장 중, 저장 완료 시각을 표시합니다. 등록 준비 완료는 필수값을 검토해 내부 `ready` 상태로 바꾸는 기능일 뿐 스마트스토어 게시가 아닙니다. 편집 화면과 목록은 외부 API를 호출하지 않습니다. 이미지 파일도 저장하지 않고 공급사 URL 메타데이터만 사용합니다.

판매가 계산기는 공급가, 예상 전체 수수료율, 판매자 부담 배송비, 포장·고정비, 구매자 배송비와 목표 실마진율을 역산해 권장 판매가를 제시합니다. 수수료는 주문 조건에 따라 달라지는 예상값이므로 실제 주문 후 정산 데이터와 대조해야 합니다.

## 네이버 카테고리 동기화

`/admin/channels/naver`에서 관리자가 명시적으로 동기화 버튼을 누를 때만 네이버 전체 카테고리를 한 번 조회해 PostgreSQL에 교체 저장합니다. 화면 조회와 카테고리 검색은 저장된 DB만 사용하며 네이버 API를 호출하지 않습니다. Client Secret과 Access Token은 브라우저 응답이나 로그에 포함하지 않습니다.

DB 변경 적용:

```bash
npm run db:migrate
```

## 성장 상품 키워드 관리

`/admin/keywords`는 1,000개 상품 슬롯 전체를 비싸게 분석하는 화면이 아니라, 판매가 발생했거나 가능성이 보이는 상품만 골라 관리하는 업무 화면입니다. 스마트스토어/브랜드스토어 상품 링크와 최소 상품명을 입력한 뒤 다음 흐름을 사용합니다.

```text
상품 저장 → 규칙 기반 상품 분석 → 사용자 검토·수정 → 키워드 후보 생성
→ 네이버 연관 키워드 필터·검색량 조회
→ 검색량 기반 소형·중형·대형 분류 → 사용자 필터·선택
→ 선택 키워드 기반 상품명 초안 → 사용자 수정·저장
```

- 공식 기능명은 `규칙 기반 기본 모드`이며 생성형 AI API를 사용하지 않습니다.
- 공급사 원본 상품명, 현재 상품명, 생성 초안과 최종 상품명을 분리해 보존합니다.
- 네이버 검색광고 키워드 도구가 반환한 연관 키워드를 남은 후보 슬롯에 추가합니다.
- 연관 키워드는 상품 유형과 확인된 속성의 충돌을 검사하고, 제외 사유와 복원 기능을 제공합니다.
- 검색량·경쟁도는 네이버 검색광고 API의 참고 데이터이며 노출 순위나 판매를 보장하지 않습니다.
- `< 10` 같은 범위형 응답은 원문을 표시하고 내부 필터용 값만 별도로 정규화합니다.
- 필터를 바꿔도 선택 상태는 유지됩니다.
- 키워드 선택과 최종 상품명은 사용자 결정이며 네이버 상품에 자동 반영하지 않습니다.
- 동일 키워드 검색량은 기본 24시간 캐시합니다.
- 순위 추적, 판매자센터 크롤링, 자동 상품명 변경은 이번 MVP에 포함하지 않습니다.

구조와 외부 API 범위는 [`docs/architecture.md`](docs/architecture.md), [`docs/external-apis.md`](docs/external-apis.md)를 참고합니다. 제품의 상시 판단 기준은 [`docs/product-strategy.md`](docs/product-strategy.md)에 기록되어 있습니다.

## 검증 명령

```bash
npm run lint
npm run typecheck
npm test
npm run test:e2e
npm run build
npm run cf:build
```

## Cloudflare Workers 배포

Next.js 풀스택 기능을 Cloudflare `workerd`에서 실행하기 위해 `@opennextjs/cloudflare`를 사용합니다. OpenNext는 Next.js 빌드 결과를 `.open-next/worker.js`와 정적 assets로 변환하며, Supabase는 계속 Auth와 PostgreSQL을 담당합니다. 이미지 R2 저장은 설정하지 않습니다.

```bash
npm run cf:build   # OpenNext 번들 검증
npm run preview    # 로컬 Workers 런타임 미리보기
npm run deploy     # Cloudflare 배포
```

Cloudflare Workers Builds의 Build Variables and secrets에 `.env.local`의 필수 값을 동일하게 등록합니다. `DATABASE_URL`, `DOME_API_ID`, `DOME_API_KEY`는 secret으로 관리하고 코드나 빌드 로그에 노출하지 않습니다. 운영 DB 연결은 Postgres.js와 Drizzle을 유지하되, 전역 연결 풀링을 위해 Cloudflare Hyperdrive 연결을 권장합니다.

## 실제 API 적용 전 주의사항

실제 계정으로 운영하기 전에 오류/인증/호출 제한 응답 XML과 Content-Type을 별도 검증해야 합니다. API 응답 원문, API ID, API Key는 일반 로그나 `supplier_api_call_logs`에 저장하지 않습니다. 제공된 XML 샘플은 상품 필드 매핑 검증에만 사용했으며 개인정보와 인증정보를 포함하지 않습니다.
