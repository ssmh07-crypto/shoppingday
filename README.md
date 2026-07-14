# Modular PIM

Next.js App Router, Supabase Auth/PostgreSQL, Drizzle ORM 기반의 모듈형 PIM입니다. 현재 구현 범위는 친구도매 원본 상품을 상품번호로 가져와 조회하는 기능입니다. 스마트스토어 및 네이버 커머스 연동은 포함하지 않습니다.

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

흐름은 관리자 인증 → goodsno 검증 → DB 중복 확인 → 공급처 호출 → 크기/Content-Type/XML 검증 → 표준 공급처 상품 매핑 → 트랜잭션 저장 → 민감정보가 제거된 호출 로그 저장 순서입니다.

## 검증 명령

```bash
npm run lint
npm run typecheck
npm test
npm run test:e2e
npm run build
```

## 실제 API 적용 전 주의사항

실제 계정으로 운영하기 전에 오류/인증/호출 제한 응답 XML과 Content-Type을 별도 검증해야 합니다. API 응답 원문, API ID, API Key는 일반 로그나 `supplier_api_call_logs`에 저장하지 않습니다. 제공된 XML 샘플은 상품 필드 매핑 검증에만 사용했으며 개인정보와 인증정보를 포함하지 않습니다.
