# 다음 Codex 세션 인수인계

마지막 갱신: 2026-07-20 22시경 (KST)

이 문서는 대화 세션이 종료되거나 Codespace가 재시작된 뒤 작업을 이어가기 위한 기준 문서다. 인증정보와 Secret 값은 절대 이 문서에 기록하지 않는다.

## 2026-07-20 종료 시점 인수인계

이 절이 현재 상태의 기준이다. 아래 `2026-07-19 종료 시점 인수인계`는 이전 기준과
구현 이력으로만 참고한다.

### Git과 PR 상태

- 현재 브랜치: `agent/growth-sourcing-management`
- Draft PR: [#18 Add growth management and sourcing research](https://github.com/ssmh07-crypto/shoppingday/pull/18)
- 이번 세션의 구현과 이 문서를 같은 커밋으로 현재 원격 브랜치에 푸시한다.
- Cloudflare 운영 배포는 하지 않았다.

### 이번 세션 완료 범위

1. 소싱 조사의 월간 검색수와 쿠팡·네이버 평균단가, 예상 판매가, 1688 가격 입력에
   천 단위 쉼표를 적용했다. 최근 6개월 매출은 억원 대신 만원 단위 입력·표시로 바꿨다.
2. 소싱 아이템을 저장하면 이미 연결된 등록 상품 초안의 상품명·검색 태그·예상 판매가,
   소싱 원본명과 공급가도 같은 트랜잭션에서 갱신한다. 준비 완료 상품이 바뀌면 다시
   편집 상태로 전환하고 감사 로그와 초안 버전을 갱신한다.
3. 등록 상품 편집을 직접 열 때 짧은 사전조회 캐시를 우회해 최신 소싱 값을 표시한다.
   소싱 상품의 제목이 비어 추천 버튼이 비활성화되던 원인도 이 동기화로 해소했다.
4. 리뷰는 한 건당 한 줄 입력란을 `+ 리뷰 추가`와 `-`로 관리한다. 리뷰가 많아지면
   `전체 리뷰 접기/펼치기`로 입력 목록 전체를 한 번에 숨기거나 표시한다.
5. 직접 입력, 여러 줄 붙여넣기, CSV/XLSX에서 가져온 리뷰 원문을 소싱 아이템의
   `review_entries` JSONB에 저장한다. 임시저장·최종저장 후 새로고침하거나 다른 아이템을
   다녀와도 복원한다. 최대 500개, 리뷰당 최대 10,000자로 검증한다.
6. 리뷰 분석은 일반 단어 빈도 집계를 제거하고, 혼합 리뷰 전체에서 장점과 불편을
   항목별로 동시에 찾는다. 2건 이상은 반복, 1건은 개별로 구분하며 원문은 접힌 근거
   영역에서 보존한다.
7. 불편 유형은 내부 축약어 대신 `물이 잘 빠지지 않고 바닥이 오래 젖어 있음`,
   `딱딱하거나 까슬해 오래 신기 불편함`처럼 바로 이해할 수 있는 문제 문장으로 표시하고
   장점·단점 칸에도 원문 복사 대신 유형별 요약만 반영한다.
8. `건조가 오래 걸림`을 배송 지연으로 잘못 분류하지 않도록 배송·도착·출고·택배 문맥이
   있을 때만 배송 지연으로 판정한다. 욕실화 실제 리뷰 4건을 회귀 테스트에 추가해 배수,
   물 유입, 착화감, 안전, 크기, 실용성과 디자인의 혼합 평가를 확인했다.
9. 최종 네이버 카테고리를 선택하고 스마트스토어 탭을 열면 기존
   `/api/integrations/naver/category-requirements` 경로가 전체·필수 속성, 허용값, 단위와
   표준 옵션을 불러오는 것을 코드와 테스트로 확인했다. 실제 조회에는 커머스 API 또는
   로컬 릴레이 연결이 필요하다.

### DB 상태

- `0017_tranquil_iron_monger.sql`: `sourcing_researches.review_entries` JSONB 추가
- migration `0017`은 현재 `.env.local`이 가리키는 실제 DB에 적용 완료했다.
- 기존 소싱 아이템에는 빈 리뷰 배열이 기본값으로 들어가며, 오래 열린 클라이언트가 새
  필드를 보내지 않아도 빈 배열로 처리한다.

### 최종 검증

- `git diff --check` 통과
- ESLint 통과
- TypeScript 통과
- 전체 테스트: 41개 파일, 197개 통과
- DB migration 적용 성공
- 이번 최종 변경 뒤 Next.js/OpenNext/Wrangler 빌드와 운영 배포는 실행하지 않았다.

### 다음 세션 재개 순서

1. `AGENTS.md`, `docs/product-strategy.md`, 이 문서, `docs/external-apis.md`를 읽는다.
2. `git status --short --branch`와 `git log -3 --oneline`을 확인한다. 사용자 변경을
   reset/checkout하지 않는다.
3. 로컬 서버에서 실제 소싱 아이템에 리뷰 여러 건을 입력하고 `임시저장` → 새로고침 →
   전체 리뷰 펼치기로 원문 복원을 육안 확인한다.
4. 같은 리뷰를 분석해 자연어 불편 문장, 반복·개별 구분, 접힌 원문 근거와 아래 장점·단점
   칸 반영 결과를 확인한다. 규칙에 없는 새로운 불편은 실제 사례를 근거로 유형을 추가한다.
5. 소싱 키워드·분류·예상 판매가를 바꾸고 저장한 뒤 `/admin/registration`과 연결된 상품
   편집에서 상품명·태그·판매가가 최신인지 확인한다.
6. 네이버 릴레이를 실행한 상태에서 소싱 상품의 카테고리 추천, 상품명 추천, 최종
   카테고리별 공식 속성 조회를 육안 확인한다.
7. 실제 사용 오류를 먼저 수정한 뒤 대표 이미지·상세 이미지·샘플 정보의 등록 초안 전달,
   등록 준비 체크리스트 누락값 안내 개선 순서로 진행한다.

### 중요한 제한과 판단

- 리뷰 규칙 분석은 생성형 AI를 호출하지 않는다. 규칙으로 분류되지 않은 리뷰가 실제로
  누적될 때만 사용자가 명시적으로 실행하는 AI 재분석 경로를 별도 검토한다.
- 리뷰 원문은 이제 사용자 요청에 따라 DB에 저장된다. 화면 안내도 브라우저 전용 처리
  문구에서 소싱 아이템 저장 문구로 변경했다.
- 리뷰 분류 결과는 소싱 판단 보조 자료이며 사실 데이터나 품질·매출 보장이 아니다.
- 검색량, 매출, 순위와 경쟁도는 추정값을 실제 값처럼 표시하지 않는다.

## 2026-07-19 종료 시점 인수인계

이 절은 2026-07-19 종료 시점의 과거 기준이다. 현재 상태와 충돌하면 위
`2026-07-20 종료 시점 인수인계`를 우선한다.

### Git과 배포 상태

- 현재 브랜치: `agent/growth-sourcing-management`
- 원격 브랜치까지 푸시 완료
- 마지막 커밋: `1d1190e` (`Add sourcing-to-SmartStore registration workflow`)
- Draft PR: [#18 Add growth management and sourcing research](https://github.com/ssmh07-crypto/shoppingday/pull/18)
- 작업 트리는 커밋 직후 깨끗한 상태였다. 이 인수인계 문서 수정만 다음 커밋 대상이다.
- Cloudflare 운영 배포는 하지 않았다.
- OpenNext/Wrangler dry-run 크기: gzip 약 `1,626.85 KiB`로 무료 플랜 3 MiB 제한 이내다.

### 오늘 완료한 제품 흐름

1. `/admin/sourcing`의 소싱 목록과 소싱 아이템 조사 화면을 실제 저장 모델에 연결했다.
2. 아이템스카우트 연관 키워드 XLSX를 불러와 키워드와 총 검색수만 보존한다.
3. 사용자가 각 키워드를 한 번 클릭해 `상품명`, `태그`, `속성`, `카테고리`로 분류한다.
   카테고리 키워드는 상품명 초안에서 항상 제외한다.
4. 분류·검색수 기준 필터와 정렬을 지원하고, 검색수 1,000 이하의 상품명·태그 키워드로
   등록 초안을 만든다. 1,000은 보장 공식이 아니라 사용자가 정한 운영 기준이다.
5. 리뷰 원문을 붙여 넣거나 CSV/XLSX로 불러오면 생성형 AI 없이 반복 장점·단점·고객
   요구를 규칙으로 요약한다. 다른 판매자의 스마트스토어를 자동 크롤링하지 않는다.
6. `/admin/registration` 상품 등록관리 페이지에서 저장한 소싱 아이템을 기존 `products`
   초안으로 전환한다. 별도 상품 모델을 중복 생성하지 않는다.
7. 소싱 상품은 생성 순서대로 `SC000001`부터 상품번호를 발급한다. 화면의
   `친구도매 상품번호` 표기는 `상품번호`로 통일했다.
8. 상품 편집에서 외부 썸네일 이미지 URL을 직접 추가하고 네이버 이미지 업로드를 실행할
   수 있다. 상세페이지는 임의 웹페이지 전체를 수집하지 않고 공개된 http/https 상세
   이미지 URL을 여러 개 받아 안전한 HTML로 추가한다.
9. `/admin/channels/naver`에서 등록 대상 스토어명, 스마트스토어/브랜드스토어 URL,
   선택적인 커머스 API 계정 ID를 저장한다. Client ID와 Secret은 계속 서버 환경변수에서만
   관리하며 화면이나 DB에 저장하지 않는다.
10. 이미지 업로드와 실제 네이버 발행 시 사용자별 등록 대상 스토어 설정 존재 여부를
    확인한다. 판매자 계정 인증 방식에서는 저장한 계정 ID를 토큰 요청에 반영한다.
11. 상품 편집에서 최종 네이버 카테고리를 선택하면 커머스 API로 카테고리별 전체 속성,
    필수 속성, 허용값, 단위와 표준 옵션을 불러와 입력한다. 등록 준비 검증은 필수 속성을
    서버에서 다시 확인한다.
12. 전체 한글 UI의 기본 글꼴은 로컬 Pretendard 패키지를 사용한다.

### DB 상태

- `0014_reflective_dark_phoenix.sql`: 소싱 연관 키워드 저장 필드
- `0015_strong_doctor_octopus.sql`: 소싱 아이템과 등록 상품 연결
- `0016_slow_white_queen.sql`: 사용자별 네이버 스토어 설정과 소싱 상품번호 시퀀스
- 위 세 마이그레이션은 현재 `.env.local`이 가리키는 실제 DB에 적용 완료했다.
- `0016`은 기존 소싱 상품도 생성 순서대로 `SC000001` 형식으로 변환하고, 이후에는
  PostgreSQL sequence로 동시 생성 시에도 번호가 충돌하지 않게 한다.

### 최종 검증

- ESLint 통과
- TypeScript 통과
- 전체 테스트: 41개 파일, 191개 통과
- Next.js 프로덕션 빌드 통과
- OpenNext Cloudflare 빌드 통과
- Wrangler 배포 dry-run 통과, gzip 약 `1,626.85 KiB`
- DB migration 적용 성공
- 로컬 `http://localhost:3000/admin/channels/naver`는 비로그인 요청을 `/login`으로 정상
  리다이렉트했다.
- 이 세션에는 제어 가능한 브라우저가 없어 로그인 후 실제 화면의 육안 검증은 하지 못했다.

### 2026-07-20 재개 순서

1. `AGENTS.md`, `docs/product-strategy.md`, 이 문서, `docs/external-apis.md`를 읽는다.
2. `git status --short --branch`와 `git log -3 --oneline`을 확인한다. 사용자 변경을
   reset/checkout하지 않는다.
3. 이 인수인계 문서 수정이 아직 미커밋이면 현재 작업 브랜치에 문서 커밋으로 푸시한다.
4. 로컬 서버를 실행하고 로그인한 뒤 `/admin/channels/naver`에서 실제 등록 대상 스토어명과
   URL을 저장한다. Secret 값을 대화나 로그에 출력하지 않는다.
5. `/admin/sourcing`에서 실제 소싱 아이템 하나를 열어 아이템스카우트 XLSX 불러오기,
   키워드 4분류, 리뷰 붙여넣기 분석, 임시저장과 최종저장을 육안 점검한다.
6. `/admin/registration`에서 같은 아이템의 `등록 준비 시작`을 눌러 상품번호가
   `SC000001` 형식인지 확인한다.
7. 상품 편집에서 상품명·태그·판매가 초안, 썸네일 URL, 상세 이미지 URL, 네이버 최종
   카테고리와 전체/필수 속성 입력을 점검한다.
8. 실제 네이버 상품 발행은 스토어 계정, 이미지, 배송/A/S/원산지/상품정보제공고시,
   재고와 필수 속성을 사용자가 최종 확인한 뒤에만 실행한다.
9. 다음 구현 우선순위는 실제 사용 점검에서 발견된 오류 수정 → 소싱 아이템에서
   대표 이미지·상세 이미지·샘플 정보를 등록 초안으로 넘기기 → 등록 준비 체크리스트의
   누락값 안내 개선 순서다. 판매 성과와 직접 무관한 대규모 자동화는 뒤로 미룬다.

### 중요한 제한과 판단

- 아이템스카우트 XLSX는 연관 키워드와 총 검색수의 입력 원천이다. 경쟁강도 데이터는
  사용하지 않는다.
- 상품명/태그/속성/카테고리 키워드 구분은 검색 결과를 확인한 사용자가 직접 확정한다.
  외부 검색 결과 크롤링으로 자동 판정하지 않는다.
- 카테고리 키워드는 상품명에 넣지 않는다.
- 스마트스토어 설정의 스토어명·URL은 등록 대상을 명확히 하는 사용자별 설정이다.
  실제 API 권한은 서버 환경변수 또는 릴레이에 저장된 네이버 앱 자격증명과 반드시 같은
  스토어를 가리켜야 한다.
- 외부 상세페이지 전체 수집은 SSRF, 저작권, 상대 URL과 스크립트 위험 때문에 구현하지
  않았다. 현재는 공개 이미지 URL만 상세 HTML에 추가한다.
- 검색량·매출·순위·재고 소진을 추정값이나 보장 표현으로 표시하지 않는다.
- 생성형 AI API는 성장 상품 규칙 분석과 현재 소싱 흐름에서 사용하지 않는다.

## 2026-07-19 진행 이력 (과거 기록)

### 한 줄 상태

성장 상품 키워드 관리는 `규칙 기반 기본 모드`만 제공한다. 생성형 AI 선택 경로와 관련 환경변수는 제거됐다. 상품을 저장하면 규칙 분류까지만 실행하고, 사용자가 핵심 상품 유형과 속성을 확인한 뒤 키워드 후보와 네이버 검색 데이터를 조회한다.

2026-07-19 `/admin/sourcing` 소싱 조사 페이지를 추가했다. 키워드·월간 검색수·6개월
매출, 쿠팡/네이버 평균단가, 예상 판매가와 마진 30% 단순 최대 구매단가, 시장 위험
체크, 장단점 리뷰·고객 니즈·소구 포인트·제원·타겟 메모, 최대 10개 1688 샘플 후보를
사용자별로 저장한다. 검색수 1만과 6개월 매출 1억원은 보장 점수가 아닌 선호 기준으로만
표시한다. 시즌성·부피·인증 위험도 영상의 조사 아이디어를 참고해 추가했다.
사용자별 RLS가 포함된 `0013_vengeful_arclight.sql`을 실제 DB에 적용했고, 전체 36개
테스트 파일의 172개 테스트와 lint, typecheck, Next.js 빌드가 통과했다.

2026-07-19 관리 상품 추가 시 스마트스토어/브랜드스토어 상품 링크의 채널 상품 번호로
네이버 커머스 API를 조회한다. 인증 계정이 접근할 수 있는 본인 스토어 상품이면 현재
상품명, 카테고리, 등록 속성, 판매자 태그를 자동 저장하고 화면에 출처와 함께 표시한다.
명확한 소재·색상·사이즈·대상·계절 속성만 규칙 분석 입력에 보강한다. 다른 판매자 상품,
권한 오류, API 장애일 때는 크롤링하지 않고 수동 입력값으로 계속 진행하며 안내를 남긴다.
추가 DB 컬럼은 없고 기존 `product_input` JSONB의 선택 필드를 확장했으므로 마이그레이션은
필요하지 않다.

2026-07-19 성장 관리 상품 추가 화면을 기본 정보 중심으로 단순화했다. 공급사 원본
상품명과 현재 상품명을 분리하고, 규칙 분석 결과를 핵심 상품 유형·소재·용도·대상·형태·
특징·색상·사이즈·계절·스타일·일반 분류어·미분류 단어 칩으로 검토한다. 칩은 추가·
수정·삭제·분류 이동과 대표 상품 유형 선택을 지원한다. 사용자 확인 전에는 키워드
후보를 만들 수 없다. 네이버 연관 키워드는 상품 유형과 확인 속성 충돌을 검사해 제외
사유를 보존하고 사용자가 복원할 수 있다. 상품 정보 변경 시 분석을 오래된 상태로
표시하며, 유사 상품명 경고와 카테고리별 어순 템플릿을 추가했다. 비파괴 migration
`0012_jittery_shinko_yamashiro.sql`을 실제 DB에 적용했다. 32개 테스트 파일의 158개
테스트와 lint, typecheck, Next.js, OpenNext Cloudflare 빌드를 통과했다.

이후 분석 UI의 핵심 상품 유형에서는 분류 이동 선택란을 제거하고 글자와 입력 요소를
확대했다. `분석 결과 확인 및 저장`은 `키워드 후보 만들기`에 통합했다. 이 버튼은 분석
저장 → 후보 생성 → 네이버 검색량·경쟁도 조회를 한 번에 실행하며, 지표 조회만 실패하면
저장된 후보를 유지하고 수동 재조회 방법을 안내한다. 32개 테스트 파일의 159개 테스트,
lint, typecheck와 Next.js 빌드를 통과했다.

2026-07-19 실제 검색광고 인증과 상품 `철제 바느질 골무 바느질부자재` 검증을 완료했다. 규칙 분석은 상품 유형을 `골무`로 분류했고, 규칙 후보 5개의 실제 PC·모바일 검색량과 경쟁도 조회에 성공했다. 네이버 연관 후보 `고무골무`는 원상품의 `철제` 소재와 충돌해 제외했다. 키워드 선택과 최종 상품명 저장은 사용자 판단을 기다린다.

2026-07-19 네이버 검색어드바이저 공식 가이드의 적용 기준을
`docs/naver-search-quality-guidelines.md`에 저장하고, 키워드·상품명 작업 전에 읽도록
루트 `AGENTS.md`에 연결했다. 검색어드바이저는 웹 검색 SEO 문서이므로 스마트스토어
순위 공식으로 취급하지 않는다. 규칙 기반 상품명은 구체 품목이 있을 때 `부자재`,
`용품` 같은 넓은 분류어를 제외한다. 실제 선택 키워드 조합의 새 초안은
`철제 바느질 골무`가 된다. 편집 화면에는 상품 유형 누락, 단어 반복, 넓은 분류어,
홍보 문구, 40자 초과를 저장 차단 없이 실시간 안내한다. 기존 저장 초안은 자동으로
덮어쓰지 않았다. 전체 31개 테스트 파일의 153개 테스트, lint, typecheck, Next.js 및
OpenNext Cloudflare 빌드, `git diff --check`를 통과했다.

2026-07-19 상품 관리 > 상품 편집 > 판매용 상품명 옆에 `상품명 추천`을 추가했다.
현재 입력 제목과 선택된 네이버 카테고리에서 상품 유형·소재·재질·용도·일반 분류어를
규칙으로 분리하고 네이버 검색광고 키워드 도구에서 정확한 조합의 실제 월간 검색량과
관련 후보를 조회한다. 상품 유형이 없거나 입력 소재와 충돌하는 연관어는 제외하고,
외부 연관어를 제목에 무조건 삽입하지 않는다. 추천 제목과 분석·검색량 근거를 먼저
표시한 뒤 사용자가 `이 상품명 적용`을 눌러야 편집값이 바뀐다. 자동 저장·네이버 자동
반영·생성형 AI 호출은 하지 않는다. 검색광고 키 누락이나 조회 실패 시 규칙 추천과 한계
안내를 반환한다. 구현은 `product-title-recommendation.ts`, API는
`POST /api/products/{id}/title-recommendation`이다. 전체 32개 테스트 파일의 156개
테스트, lint, typecheck, Next.js 및 OpenNext Cloudflare 빌드, `git diff --check`를
통과했다.

### 이미 완료된 범위

- 관리자 경로: `/admin/keywords`
- 스마트스토어·브랜드스토어 `/products/{상품번호}` 링크 연결
- 상품 정보 입력과 수정 가능한 규칙 기반 상품 분석
- 규칙 키워드 후보 생성과 중복·길이·문장형 후보 정리
- 네이버 검색광고 `relKeyword` 연관 후보 확장
- 네이버 검색광고 키워드 도구의 PC·모바일 월간 검색량과 경쟁도 조회
- `< 10` 원문 보존과 내부 비교값 분리
- 검색량 기준 소형·중형·대형·미분류 분류
- 그룹·최소/최대 검색량·경쟁도·텍스트 필터와 필수 정렬
- 필터 변경 후 선택 유지, 표시 항목 선택·해제, 전체 초기화
- 선택 키워드 기반 상품명 초안, 사용자 수정과 내부 저장
- 24시간 검색량 캐시, 401·403·429·5xx 구분, 제한된 지수 백오프
- 고정 Mock 분석·검색량과 정상·일부 실패·전체 실패 fixture
- 사용자별 `owner_id` 쿼리와 Supabase RLS
- migration `0010_violet_midnight.sql` 실제 DB 적용 완료
- migration `0011_tough_prodigy.sql`의 `rules` 출처 enum 실제 DB 적용 완료

네이버 검색광고 실계정 호출은 검증을 완료했다. 가짜 성공 응답이나 추정 검색량은 만들지 않는다.

### 사용자가 먼저 할 일

`C:\Users\ssmh0\shoppingday\.env.local`에 아래 값을 직접 입력한다. Secret은 대화창, 문서, 터미널 출력에 붙여넣지 않는다.

```dotenv
USE_MOCK_EXTERNAL_APIS=false

NAVER_SEARCH_AD_API_KEY=
NAVER_SEARCH_AD_SECRET_KEY=
NAVER_SEARCH_AD_CUSTOMER_ID=
```

`NAVER_API_HUB_CLIENT_ID`, `NAVER_API_HUB_CLIENT_SECRET`은 이번 MVP에 필요하지 않으므로 비워도 된다. 입력이 끝나면 사용자에게 키 값을 요구하지 말고 `API 키 입력 완료`라는 확인만 받는다.

### Codex가 이어서 할 일

1. `AGENTS.md`, `docs/product-strategy.md`, 이 문서, `docs/external-apis.md`를 먼저 읽는다.
2. `git status --short --branch`로 현재 dirty worktree를 확인하고 기존 변경을 절대 reset/checkout하지 않는다.
3. 환경변수 값 자체를 출력하지 않고 검색광고 3개가 모두 설정됐는지만 확인한다.
4. `USE_MOCK_EXTERNAL_APIS=false`인지 확인한 뒤 개발 서버를 재시작한다.
5. `/admin/keywords`에서 실제 판매 반응이 있는 상품 1개로 아래 순서를 검증한다.

```text
상품 링크 연결 → 규칙 기반 분석 → 네이버 연관 키워드·검색량 새로고침
→ 키워드 선택 → 상품명 초안 생성 → 사용자 수정·저장
```

6. 규칙 후보 품질, 네이버 연관 키워드·검색량·경쟁도, `< 10`, 일부 누락 상태를 확인한다. 실패하면 실제 오류 코드를 보고하고 임의 값으로 채우지 않는다.
7. 실 API 검증 후 `npm run lint`, `npm run typecheck`, `npm test`, `npm run cf:build`를 다시 실행한다.
8. 사용자 확인 전에는 커밋·푸시·Cloudflare 운영 배포·네이버 상품 자동 수정을 하지 않는다.

### 당시 검증 결과

- ESLint 통과
- TypeScript 통과
- 전체 테스트: 30개 파일, 148개 통과
- Next.js 프로덕션 빌드 통과
- Cloudflare OpenNext 빌드 통과
- `git diff --check` 통과
- DB migration `0010_violet_midnight.sql` 적용 성공
- DB migration `0011_tough_prodigy.sql` 적용 성공
- 이 세션에는 연결 가능한 브라우저가 없어 자동 육안 점검은 못 했지만 jsdom UI 테스트로 필터·선택 유지·Mock 표시·상품명 생성을 검증했다.

### 주의할 구현 세부사항

- 네이버 응답 `relKeyword`가 입력의 공백을 제거할 수 있어 요청과 응답 매칭에서만 공백을 무시한다. UI와 DB에는 사용자 키워드를 보존한다.
- 네이버는 공백이 포함된 `hintKeywords`를 `400 / 11001`로 거절할 수 있어 요청에서만 공백을 제거한다.
- 네이버 연관 키워드는 구체 상품 유형을 포함한 결과만 후보에 추가해 `코바늘`, `벨크로` 같은 넓은 부자재 결과를 제외한다.
- 일시적인 검색광고 `error` 결과는 24시간 캐시하지 않아 다음 새로고침에서 재시도할 수 있다.
- API HUB 쇼핑 인사이트 `ratio`는 상대 비율이지 실제 검색량이나 순위가 아니므로 UI에 연결하지 않았다.
- 순위 추적, 판매자센터 크롤링, 자동 네이버 상품명 변경은 의도적으로 구현하지 않았다.
- 로컬에서 키 없이 확인하려면 `USE_MOCK_EXTERNAL_APIS=true`를 사용한다. 운영 `NODE_ENV=production`에서는 Mock 활성화를 거부한다.
- 이 문구 이후 변경은 최상단 종료 시점 절에 기록된 커밋 `1d1190e`까지 GitHub에
  푸시했다. Cloudflare 운영 배포는 하지 않았다.

## 재개 방법

기존 Codex 세션이 남아 있으면 프로젝트 터미널에서 다음 명령을 먼저 시도한다.

```bash
codex resume 019f6a8c-4599-74b2-ad8e-5aa6b49fad4b
```

세션을 복구할 수 없으면 새 Codex에게 다음과 같이 요청한다.

> `C:\Users\ssmh0\shoppingday\AGENTS.md`, `docs/product-strategy.md`, `docs/NEXT_SESSION.md`, `docs/external-apis.md`를 모두 읽고 작업 트리와 DB 적용 상태를 보존한 뒤 `2026-07-20 재개 순서`부터 이어서 진행해줘. Secret 값은 출력하지 마.

새 세션 시작 시 확인 명령:

```powershell
cd C:\Users\ssmh0\shoppingday
git status --short --branch
npm run typecheck
```

기능 구현은 커밋 `1d1190e`로 푸시됐다. 현재 dirty 상태가 보이면 새 사용자 변경일 수
있으므로 확인 없이 `git reset`, `git checkout --`를 실행하지 않는다.

## 2026-07-16 완료 상태

- 운영 기준 브랜치: `main`
- 완료 커밋: `2c4d55d` (`네이버 카테고리 동기화와 실마진 판매가 계산기 추가 (#3)`)
- GitHub PR #3 병합 완료
- Cloudflare Workers의 `main` 운영 배포 성공
- Cloudflare Build command: `npm run cf:build`
- Cloudflare Deploy command: `npm run cf:deploy`
- Worker minify 적용 후 배포 크기: 압축 약 2,774 KiB (무료 한도 3 MiB)
- 네이버 카테고리 실제 동기화 성공
  - 전체: 5,815개
  - 상품 등록 가능한 최종 카테고리: 4,999개
  - PostgreSQL `naver_commerce_categories`에 저장됨
- 관리자 경로: `/admin/channels/naver`
- 상품 편집창에 예상 수수료·배송비·목표 실마진 기반 권장 판매가 계산기 추가
- 전체 테스트 59개, lint, typecheck, Next.js build, OpenNext Cloudflare build 통과

## 2026-07-17 진행 상태

- 고정 IP 중계 구조를 제한형 HTTPS 릴레이로 결정하고 구현했다.
- Worker는 timestamp·nonce·메서드·경로·본문 hash를 포함한 HMAC 서명 요청을 보낸다.
- 릴레이는 현재 `GET /v1/categories`만 허용하며 5분 시간창과 nonce 재사용 방지를 적용한다.
- 네이버 인증정보와 Access Token은 릴레이 서버에만 두고, Worker에는 릴레이 URL과 공유 Secret만 둔다.
- 일시적인 502·503·504 및 연결 실패는 읽기 요청에 한해 한 번 재시도한다.
- 릴레이 감사 로그는 요청 ID, 메서드, 경로, 상태, 처리 시간만 기록한다.
- 배치 절차: [`naver-commerce-relay.md`](naver-commerce-relay.md)
- 전체 테스트 65개, lint, typecheck, Next.js build, OpenNext Cloudflare build 통과
- Cloudflare dry-run 크기: gzip 약 627.74 KiB
- 실제 고정 IP VM 준비, DNS/TLS, 네이버 허용 IP 등록과 Secret 배치는 아직 하지 않았다.
- 비용 없는 로컬 PC + Cloudflare Quick Tunnel 운영을 선택했다.
- Windows에 `cloudflared` 2026.7.2를 설치하고 Wrangler OAuth 로그인을 Windows Credential Manager에 저장했다.
- `npm run naver:local-tunnel` 한 명령으로 로컬 릴레이·Quick Tunnel 실행과 Worker Secret 갱신을 처리한다.
- 공유 Secret은 Git에서 제외되는 `.env.relay.local`에 자동 생성된다.
- Quick Tunnel URL은 `NAVER_COMMERCE_RELAY_URL_OVERRIDE` Worker Secret으로 매 실행 시 갱신된다.
- Linux 컨테이너에서 OpenNext 번들을 생성해 Worker에 배포했다. Windows OpenNext 빌드는 서버 청크 오류가 발생했으므로 운영 배포에 사용하지 않는다.
- 실제 터널 경유 네이버 전체 카테고리 호출 HTTP 200, 5,815개를 확인했다.
- Workers 사이트와 터널 `/healthz` 모두 HTTP 200을 확인했다.

## 보안 상태

- 이전 네이버 Client Secret은 Cloudflare 빌드 로그에 평문으로 노출되어 폐기했다.
- 네이버에서 새 Client Secret을 재발급했고 로컬 토큰 발급 HTTP 200을 확인했다.
- 새 `NAVER_COMMERCE_CLIENT_SECRET`은 Cloudflare Worker의 `Variables and Secrets`에서 반드시 `Secret` 타입으로 관리한다.
- `.env.local`은 Git에 커밋하지 않는다.
- Secret, Access Token, DB URL, 공급사 API Key를 터미널 출력·문서·PR·일반 로그에 남기지 않는다.

## 중요한 운영 제약

- 네이버 커머스API는 등록된 `API 호출 IP`만 허용한다.
- 2026-07-16 개발 검증에는 당시 Codespace 공인 IP `207.46.224.81`을 임시 등록했다.
- Codespace 공인 IP는 재시작 후 바뀔 수 있다. 다음 세션에서 실제 호출 전 `curl https://api.ipify.org`로 확인하고 네이버 API센터의 허용 IP를 갱신한다.
- 일반 Cloudflare Workers의 외부 호출 IP는 고정값으로 전제할 수 없다. 따라서 운영 화면의 네이버 동기화·상품 등록·수정·삭제 호출에는 고정 IP 중계 서버가 필요하다.
- 이미 저장된 네이버 카테고리 검색과 조회는 외부 API를 호출하지 않으므로 정상 동작한다.

## 다음 작업 우선순위

### 1. 네이버 API 운영 중계 안정화

- 로컬 PC 릴레이와 Cloudflare Quick Tunnel 연결을 구현하고 실제 API 호출을 검증했다.
- 현재 방식은 로컬 PC와 터널 창이 실행 중일 때만 네이버 API를 호출할 수 있다.
- 상시 운영이 필요해지면 고정 공인 IPv4를 가진 서버나 안정적인 Named Tunnel로 교체한다.
- 카테고리 DB 검색과 이미 저장된 상품 편집은 릴레이가 꺼져 있어도 동작한다.

### 2. 네이버 카테고리 속성 확장

- 상품의 `naverCategoryId`와 `naver_commerce_categories.id` 연결을 구현했다.
- 기본정보 탭에서 네이버 최종 카테고리를 검색·선택하고 상품명으로 자동 적용한다.
- 자동 추천은 고신뢰 로컬 일치를 우선하고, 없으면 네이버 카탈로그 30개 결과의 카테고리 다수결을 사용한다. 동률이면 상위 1~3개 결과에 더 많이 등장한 카테고리를 우선한다.
- 정확한 상품명으로 카탈로그 결과가 없으면 최소 한 단어를 남기면서 앞쪽 수식어를 최대 두 개 제거해 재검색한다. `나선형 캡슐커피 보관 디스펜서`는 30/30표로 `기타보관용기(50005257)`, `레트로 메모 포스트잇`은 30/30표로 `점착식메모지(50003558)`를 적용한다.
- 카테고리별 상품 속성·표준 옵션 API를 저장하고 상품 등록 필수값을 검증한다.

### 상품 목록과 변동처리

- 상품 목록에서 판매용 상품명을 클릭하면 제목만 인라인 저장할 수 있고, 공급처 상품번호는 별도 열에 표시한다.
- 목록 단위는 30·50·100개 중 선택하며 검색·필터·정렬·페이지 이동 시 유지한다.
- 카테고리 직접 검색은 한 글자부터 300ms 지연 검색하는 자동완성 목록을 제공한다.
- `/admin/settings/products`에서 사용자별 상품 처리 설정을 관리한다.
- 변동처리는 기본적으로 상품명·상세설명·이미지·옵션을 모두 보호한다. 설정 페이지에서 보호를 해제한 항목만 공급처 최신값으로 갱신한다.
- 카테고리 완화 검색어를 상품명에도 적용할지 설정 페이지에서 기본값을 정한다. 상품별 편집 화면에서 체크 상태를 다시 바꿀 수 있다.
- 동기화 상태는 5초마다 조회하며 대기 중에는 비결정 진행 표시, 처리 중에는 퍼센트와 처리 건수를 표시한다.

### 3. 스마트스토어 상품 발행 모델과 API

- 상품별 네이버 원상품번호·채널상품번호·발행 상태·마지막 payload hash·오류·동기화 시각을 저장하는 채널 발행 테이블을 추가한다.
- 등록, 조회, 수정, 삭제, 판매 상태 변경 API를 구현한다.
- 중복 등록 방지, 멱등성, 실패 재시도, 관리자 확인창과 감사 로그를 적용한다.
- 친구도매 변동정보를 판매 가능/품절, 가격, 상세, 이미지, 옵션 변경으로 구분해 실제 바뀐 필드만 전송한다.

### 4. 보류: 빠른 등록 AI 자동화

- 사용자는 현재 비용 없는 규칙 기반 흐름을 우선하고 OpenAI 선택 경로를 제거하도록
  결정했다. 생성형 AI 자동화는 다음 세션의 우선순위가 아니다.
- 사용자가 빠른 등록 단계의 별도 AI 자동화를 다시 명시적으로 요청하기 전에는
  제공업체, 모델, API Key 관리 화면을 추가하지 않는다.

### 5. 실마진 고도화 및 정산 대조

- 현재 계산기는 예상 전체 수수료율을 관리자가 직접 입력한다.
- 채널별 수수료 프로필, 배송비 템플릿, 포장비, 옵션 추가 원가, 반올림 정책을 저장한다.
- 네이버 주문·정산 API의 실제 수수료와 예상 실마진을 주문 후 대조한다.

## 관련 문서와 코드

- 운영 결정: [`ARCHITECTURE_DECISIONS.md`](ARCHITECTURE_DECISIONS.md)
- 네이버 공식 문서 인덱스와 구현 상태: [`naver-commerce-api.md`](naver-commerce-api.md)
- 네이버 클라이언트: `src/modules/channels/naver/naver-commerce-client.ts`
- 카테고리 저장소: `src/modules/channels/naver/naver-category-repository.ts`
- 카테고리 관리자 화면: `src/app/admin/channels/naver/page.tsx`
- 판매가 계산기: `src/modules/pricing/margin-calculator.ts`

## 검증 명령

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm run cf:build
npm run cf:deploy -- --dry-run
```

## 2026-07-18 성장 상품 키워드 관리

- 프로젝트 상시 판단 기준을 루트 `AGENTS.md`와 `docs/product-strategy.md`에 기록했다.
- `/admin/keywords`에 판매 반응이 확인된 스마트스토어 상품만 별도로 연결하는 관리 화면을 추가했다.
- 규칙 분석·키워드 후보, 네이버 검색광고 월간 검색량, 검색량 기반 크기 분류, 필터·정렬·선택, 상품명 초안·사용자 수정 저장 흐름을 구현했다.
- 외부 키 없이 고정 fixture로 동작하는 `USE_MOCK_EXTERNAL_APIS=true` 모드를 추가했고 운영에서는 활성화를 거부한다.
- 네이버 검색광고 HMAC 키워드 도구 클라이언트를 서버 전용 모듈로 분리했다.
- 검색량 캐시 기본 TTL은 24시간이며 `< 10` 원문과 내부 정규화 값을 분리한다.
- `keyword_managed_products`, `product_keyword_analyses`, `keyword_candidates`, `generated_titles`, `keyword_metric_cache`를 migration `0010_violet_midnight.sql`에 추가했다. 사용자 테이블은 owner 쿼리 조건과 Supabase RLS를 함께 적용한다.
- API HUB 쇼핑 인사이트 adapter는 준비했지만 상대 비율을 검색량·순위로 오해하지 않도록 UI에는 연결하지 않았다.
- 순위 추적, 판매자센터 크롤링, 자동 네이버 상품명 변경은 구현하지 않았다.
- 설정·공식 API·구조는 `README.md`, `docs/architecture.md`, `docs/external-apis.md`를 참고한다.

## 2026-07-17 관리자 상품 편집 UX 개선

- `/admin/layout.tsx`와 `admin-sidebar.tsx`를 추가해 상품 관리, 상품 가져오기, 판매 채널, 설정 화면에서 같은 왼쪽 내비게이션을 유지한다.
- 상품 편집 서랍에서 현재 필터, 정렬, 페이지에 표시된 상품 순서대로 이전·다음 상품을 열 수 있다. 저장하지 않은 변경사항이 있으면 이동 전에 확인한다.
- `상품명으로 자동 추천`을 직접 누르면 카테고리 검색에 사용한 정리된 검색어가 판매용 상품명에 즉시 적용된다. 설정의 기본 체크 상태와 관계없이 수동 클릭을 우선한다.
- 판매용 상품명 입력란 아래에 원본 상품명을 더 크게 표시한다.
- 상품 목록 행, 썸네일, 편집 서랍, 입력 컨트롤, 카테고리 결과의 크기를 확장해 가독성을 높였다.
- 상품 목록의 날짜·시간 포매터를 재사용하고 목록 URL 조립 로직을 통합했다.
- 관련 회귀 테스트는 `tests/integration/product-editor-drawer.test.tsx`에 있다.

## 2026-07-17 카테고리 필수정보와 자동저장

- 네이버 릴레이가 `GET /v1/product-attributes/attributes`와 `GET /v1/options/standard-options`를 허용하고 `categoryId`만 전달한다.
- `/api/integrations/naver/category-requirements`에서 카테고리별 필수 상품 속성과 필수 표준 옵션을 병렬 조회한다.
- 메타데이터는 Worker 인스턴스 메모리에 24시간 캐시하며, 갱신 실패 시 이전 캐시가 있으면 오래된 결과임을 표시하고 사용한다.
- 상품 편집창의 스마트스토어 탭에서 선택 카테고리의 필수 속성·옵션 요약을 표시한다. 실제 속성값 입력·저장은 채널 상품 발행 모델과 함께 구현해야 한다.
- 편집창에서 변경 후 다른 탭을 누르면 기존 초안 저장 API로 자동저장한 뒤 이동한다. 저장 실패 시 현재 탭에 남는다.
- 상품 목록 제목 편집은 저장·취소 버튼 없이 입력창이 포커스를 잃을 때 저장한다. Enter는 저장, Escape는 원래 값 복원 동작이다.
- 목록 행 높이, 상품명 글씨와 썸네일을 추가 확대했다.
- 관련 테스트는 `product-title-inline-editor.test.tsx`, `product-editor-drawer.test.tsx`, `naver-category-metadata.test.ts`에 있다.

## 2026-07-17 네이버 필수 속성 입력

- migration `0007_tiny_triathlon.sql`로 `products.naver_attributes` JSONB 필드를 추가하고 적용했다.
- 네이버 속성값 후보와 전체 단위 API를 HMAC 릴레이 및 카테고리 필수정보 API에 연결했다.
- 필수 속성은 단일 선택, 복수 선택, 범위형에 맞는 컨트롤로 스마트스토어 탭에서 입력한다. 범위형도 네이버 후보 구간이 있으면 표준 `attributeValueSeq`를 선택한다.
- 카테고리를 변경하면 이전 카테고리의 속성값을 클라이언트와 서버 양쪽에서 초기화한다.
- 등록 준비 처리 시 현재 카테고리의 필수 속성과 후보값을 서버에서 다시 조회해 누락값과 오래된 후보를 거부한다.
- 다음 작업은 저장된 `naverAttributes`를 v2 상품 등록 payload의 상세 속성으로 변환하고 상품정보제공고시·배송·이미지 업로드 모델을 연결하는 것이다.

## 2026-07-18 네이버 v2 상품 payload 변환

- `src/modules/channels/naver/naver-product-payload.ts`에서 저장된 카테고리, 판매용 상품명, 상세 HTML, 판매가, 네이버 필수 속성, 조합 옵션, 검색 태그를 `POST /v2/products` 요청 구조로 변환한다.
- 활성 옵션 조합은 그룹 순서에 따라 `optionCombinationGroupNames`와 `optionCombinations`로 변환하고 옵션 재고 합계를 원상품 재고로 사용한다.
- 네이버 업로드가 완료된 `storedUrl`만 대표·추가 이미지로 사용한다. 외부 공급처 URL은 발행하지 않는다.
- 속성값 ID가 없는 임의 속성, 불완전한 옵션 조합, 단일 재고·배송·A/S·원산지·상품정보제공고시·세금·채널 정책 누락은 경로별 발행 오류로 반환한다.
- payload의 객체 키를 정렬한 뒤 SHA-256 해시를 생성해 향후 `product_publications.last_payload_hash`와 중복 등록 방지에 사용한다.
- 실제 네이버 등록 호출은 아직 비활성 상태다. 발행 정책 저장 모델과 입력 UI, 상품정보제공고시 입력, 이미지 업로드 릴레이는 완료했으며 다음 작업은 `product_publications` 테이블을 추가한 뒤 관리자 확인을 거쳐 POST를 호출하는 것이다.

## 2026-07-18 세션 종료 상태

- 운영 브랜치: `main`
- 마지막 병합 커밋: `ed9eacc` (`Add Naver v2 product payload builder (#16)`)
- PR #16 병합과 Cloudflare Workers `main` 배포가 성공했다.
- 운영 URL `https://shoppingday.ssmh07.workers.dev/`에서 HTTP 200을 확인했다.
- 검증 결과: TypeScript, ESLint, 전체 18개 파일 97개 테스트, Next.js build, OpenNext Cloudflare build 모두 통과했다.
- Workers dry-run 크기: gzip 약 629.49 KiB로 무료 플랜 3 MiB 한도 아래다.
- 로컬 PC 릴레이와 Quick Tunnel은 기존 방식으로 계속 실행한다. 릴레이 실행 코드는 이번 PR에서 바뀌지 않았으므로 재시작하지 않았다.
- 작업 트리는 문서 인수인계 커밋 병합 후 `main`과 `origin/main`이 일치해야 한다.

### 다음 세션 시작 확인

```powershell
cd C:\Users\ssmh0\shoppingday
git switch main
git pull --ff-only origin main
git status --short --branch
npm run typecheck

Get-CimInstance Win32_Process |
  Where-Object { $_.CommandLine -match 'start-local-naver-tunnel|naver-commerce-relay|cloudflared' } |
  Select-Object ProcessId, ParentProcessId, Name, CommandLine

Invoke-RestMethod http://127.0.0.1:8788/healthz
```

릴레이가 실행 중이지 않으면 새 PowerShell 창에서 다음을 실행하고 창을 유지한다.

```powershell
npm run naver:local-tunnel
```

### 다음 구현 순서

1. `product_publications` 테이블과 migration `0009_nostalgic_red_wolf.sql`을 추가·적용했다. 상품·채널 유일 제약, 발행 상태, 원상품번호·채널상품번호, 마지막/시도 payload hash, 요청 ID, 시도 횟수, 최근 오류와 동기화 시각을 저장한다.
2. 발행 저장소가 트랜잭션과 행 잠금으로 중복 등록을 막고, 요청 ID가 일치하는 처리 중 요청만 성공·실패로 마감한다. 관리자 스마트스토어 탭은 payload 유효성 및 신규 등록·재시도·수정·최신·처리 중 상태를 조회해 표시한다.
3. 관리자 스마트스토어 탭에서 최신 payload를 다시 검증한 뒤 상품명·판매가가 포함된 최종 확인창을 통과해야만 `POST /v2/products`를 호출한다. 성공 응답의 원상품번호와 채널상품번호를 발행 저장소에 기록한다.
4. 네이버가 명시적으로 거부한 4xx는 수정 후 재시도할 수 있다. 타임아웃·5xx는 요청 성공 후 응답만 유실됐을 가능성이 있으므로 자동 재시도하지 않고 `중복 등록 확인 필요`로 차단한다. 다음은 판매자 관리 코드 조회를 이용한 결과 대사와 등록 상품 수정 API다.

### 2026-07-18 네이버 발행 정책·고시·이미지 업로드

- 사용자별 네이버 기본 발행 정책과 상품별 덮어쓰기 정책을 별도 테이블에 저장하고, 임의 기본값 없이 미입력 상태를 유지한다.
- 상품정보제공고시 목록·단건 조회를 HMAC 릴레이에 추가하고 최종 카테고리의 대카테고리를 기준으로 추천 상품군과 필수 항목을 입력한다.
- 네이버 이미지 업로드는 `POST /v1/product-images/upload` multipart 요청만 허용한다. 실제 multipart 바이트를 HMAC 서명에 포함한다.
- 공급처 이미지 URL은 내부 네트워크 접근을 차단하고 응답 MIME과 파일 시그니처를 함께 검증한다. JPG·PNG, 최대 10개, 파일당 10 MiB, 전체 50 MiB로 제한한다.
- 네이버 반환 URL은 `products.selected_images[*].storedUrl`에 낙관적 잠금과 감사 로그를 적용해 저장한다.
- 실제 Quick Tunnel 경유 JPG 1개 업로드에 성공했고 반환 호스트가 `shop-phinf.pstatic.net`임을 확인했다. 상품 등록이나 노출은 수행하지 않았다.

### 반드시 확인할 제한사항

- 현재 변환기는 `attributeValueSeq`가 없는 임의 범위 속성을 발행 거부한다. 네이버 공식 v2 스키마에서 `attributeValueSeq`가 필수이므로, 실제 API에 임의 범위값을 보낼 수 있는 별도 규칙이 확인되기 전에는 `0` 같은 값을 임의로 넣지 않는다.
- `deliveryInfo`와 상품정보제공고시는 아직 JSON 저장 모델과 UI가 없다. 임의 기본값으로 실제 상품을 등록하지 않는다.
- 외부 공급처 이미지 URL은 v2 상품 본문에 직접 사용할 수 없다. 반드시 네이버 이미지 업로드 API가 반환한 URL만 `storedUrl`로 사용한다.
- `product_publications`의 유일 제약, payload hash 비교, 상태 전이, 감사 로그, 관리자 상태 조회와 최종 확인 후 신규 등록 호출을 구현했다. 타임아웃·5xx 상태는 네이버 상품 목록과 대사하기 전까지 다시 등록하지 않는다.
- Quick Tunnel URL은 재실행할 때 바뀐다. `npm run naver:local-tunnel`이 Worker의 `NAVER_COMMERCE_RELAY_URL_OVERRIDE` Secret을 갱신한다.

배포 전에 dry-run 결과의 gzip 크기가 Cloudflare 무료 플랜 3 MiB 아래인지 확인한다.
