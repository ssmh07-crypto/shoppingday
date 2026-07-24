# External APIs for growth product management

이 문서는 성장 상품 키워드 관리에서 사용하는 공식 외부 API, 서버 인증 경계와 실제 구현 범위를 기록한다. Secret 값과 실제 인증 헤더는 기록하지 않는다.

## 규칙 기반 기본 모드

- 생성형 AI API를 사용하거나 선택하는 실행 경로가 없다.
- 공급사 상품명을 사전과 결정적인 규칙으로 분류한 뒤 사용자가 결과를 검토한다.
- 확인된 상품 유형과 속성만 조합해 키워드 후보와 수정 가능한 상품명 초안을 만든다.
- 검색량과 경쟁도는 네이버 검색광고 API 응답만 저장하며 임의로 추정하지 않는다.

## Naver Search Ads keyword tool

- 전체 문서: <https://naver.github.io/searchad-apidoc/>
- 키워드 도구: <https://naver.github.io/searchad-apidoc/#/operations/GET/~2keywordstool>
- 광고 플랫폼: <https://ads.naver.com/>
- 서비스 URL: `https://api.searchad.naver.com`
- 환경변수: `NAVER_SEARCH_AD_API_URL`, `NAVER_SEARCH_AD_API_KEY`, `NAVER_SEARCH_AD_SECRET_KEY`, `NAVER_SEARCH_AD_CUSTOMER_ID`, `NAVER_SEARCH_AD_TIMEOUT_MS`

인증 개요:

- `GET /keywordstool`
- 서명 원문: `{timestamp}.{METHOD}.{uri}`
- HMAC-SHA256 후 Base64
- 서버 전용 헤더: `X-Timestamp`, `X-API-KEY`, `X-Customer`, `X-Signature`

실제 구현:

- hint keyword 최대 5개씩 묶어 `showDetail=1` 조회
- 최대 5개 핵심 힌트의 `relKeyword`를 연관 후보로 추가하고 실제 지표를 함께 저장
- `hintKeywords` 요청에서만 공백을 제거해 네이버 오류 `11001`을 방지하고 UI·DB 원문은 보존
- 네이버 연관 응답 중 규칙 분석의 구체 상품 유형을 포함한 키워드만 후보에 추가
- 상품 편집의 `상품명 추천`은 현재 제목·카테고리에서 분리한 상품 유형, 소재, 용도
  조합의 실제 검색량을 조회하고 추천 근거로 표시
- 연관어 자체를 무조건 상품명에 삽입하지 않으며 상품 유형 누락과 소재 충돌 후보를 제외
- `relKeyword`, `monthlyPcQcCnt`, `monthlyMobileQcCnt`, `compIdx`만 내부 모델로 변환
- `< 10` 원문 보존, 내부 필터·정렬값은 상한 미만 최댓값인 9로 정규화
- API가 반환하지 않은 키워드는 `not-found`, 해석할 수 없는 값은 `error`
- 401, 403, 429, 5xx 구분, 429·5xx는 지수 백오프로 최대 2회 추가 시도
- 정규화 키워드 기준 PostgreSQL 캐시, 기본 TTL 24시간

주의:

- 검색량은 키워드 도구가 제공하는 월간 조회 수이며 스마트스토어 상품 순위가 아니다.
- 경쟁도는 API가 제공한 값만 낮음·중간·높음으로 매핑하고 모르는 값은 `unknown`으로 둔다.
- 호출 제한의 구체 수치는 계정과 운영 정책을 확인해야 하므로 코드에 임의로 고정하지 않는다.
- 상품명 추천은 검색량이 높은 무관 키워드를 넣지 않으며 추천 결과의 노출·매출을 보장하지 않는다.

## Naver Commerce API

- API 센터: <https://apicenter.commerce.naver.com/>
- 소개: <https://apicenter.commerce.naver.com/docs/introduction>
- 최신 API 문서: <https://apicenter.commerce.naver.com/docs/commerce-api/current>
- AI 활용 가이드: <https://apicenter.commerce.naver.com/docs/ai-use-guide>
- 솔루션 개발 가이드: <https://apicenter.commerce.naver.com/ko/basic/solution-doc>

성장 상품 관리의 실제 범위:

- 스마트스토어 또는 브랜드스토어의 HTTPS `/products/{channelProductNo}` 링크 검증
- 인증된 `GET /v2/products/channel-products/{channelProductNo}`로 본인 스토어 상품의
  현재 상품명, 카테고리 ID, 등록 속성, 판매자 태그 조회
- 로컬 카테고리 동기화 데이터와 카테고리별 속성 메타데이터를 이용해 ID를 사람이
  검토할 수 있는 이름과 값으로 변환
- 소재·재질, 색상, 사이즈·규격, 대상·성별, 계절처럼 속성명이 명확히 일치하는 값만
  규칙 분석 입력에 보강하고 나머지는 등록 속성 원문으로 보존
- 조회 실패 시 사용자의 수동 입력값을 보존하고 실패 이유를 화면에 표시
- 같은 소유자의 로컬 `product_publications.channel_product_no`가 있으면 상품 입력 초깃값 재사용
- 관리 화면에서 저장한 최종 상품명과 네이버 채널 데이터를 분리

이번 MVP에서 구현하지 않음:

- 다른 판매자의 상품이나 공개 페이지를 HTML 크롤링해 내용을 수집
- 생성한 상품명을 네이버 상품에 자동 반영
- 판매자센터 키워드 분석·상품 순위 조회, 로그인 자동화, HTML 크롤링

향후 네이버 상품 수정은 기존 커머스 adapter와 발행 정책을 통해 사용자의 별도 확인 뒤 연결해야 한다. 성장 관리 저장 성공을 네이버 반영 성공처럼 표시하지 않는다.

채널 상품 조회는 커머스 API 인증 계정이 접근할 수 있는 본인 스토어 상품으로 제한된다.
링크만으로 다른 판매자의 카테고리·속성·태그를 가져오는 기능이 아니다. 비밀키는 기존과
같이 서버 또는 서명된 중계 경로에만 있고 브라우저 응답과 로그에 포함하지 않는다.

## Naver API HUB

- 공식 문서 홈: <https://api.ncloud-docs.com/docs/home>
- 쇼핑 인사이트 개요: <https://api.ncloud-docs.com/docs/ai-naver-shoppinginsight>
- 서비스 URL: `https://naverapihub.apigw.ntruss.com`
- 환경변수: `NAVER_API_HUB_BASE_URL`, `NAVER_API_HUB_CLIENT_ID`, `NAVER_API_HUB_CLIENT_SECRET`

준비한 adapter:

- 서버 전용 `X-NCP-APIGW-API-KEY-ID`, `X-NCP-APIGW-API-KEY` 인증
- 쇼핑 분야 키워드 추세 요청과 응답 스키마 검증
- 최대 5개 키워드 제한

UI에 연결하지 않은 이유:

- 쇼핑 인사이트 결과의 `ratio`는 지정 기간 내 상대 비율이며 실제 월간 검색량이나 상품 순위가 아니다.
- 커머스 카테고리와 쇼핑 인사이트 카테고리의 안정적인 매핑이 아직 정의되지 않았다.
- 이 데이터를 검색광고 월간 검색량과 섞으면 사용자가 실제 수치로 오해할 수 있다.

## Mock mode

- 환경변수: `USE_MOCK_EXTERNAL_APIS=true`
- 규칙 분석, 키워드 검색량, 경쟁도, 일부 실패와 전체 실패 fixture는 결정적인 코드 fixture로 관리
- UI의 런타임 배지와 각 검색량 상태에 `Mock` 표시
- 실제 API 키 불필요
- `NODE_ENV=production`에서는 Mock 활성화를 거부

## Secret handling

- 모든 키는 서버 환경변수 또는 배포 플랫폼 Secret으로만 관리한다.
- `NEXT_PUBLIC_` 접두어를 붙이지 않는다.
- `.env.local`, `.dev.vars`, 릴레이 Secret 파일은 Git에 커밋하지 않는다.
- `.env.example`에는 변수명과 비밀이 아닌 기본 설정만 둔다.
- 사용자 원문 전체, API 키, HMAC 서명, Authorization 헤더, 외부 원본 응답 전체를 로그에 남기지 않는다.
