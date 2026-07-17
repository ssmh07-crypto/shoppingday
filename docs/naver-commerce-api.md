# 네이버 커머스API 참고 문서

스마트스토어 카테고리 및 상품 연동을 구현할 때는 네이버가 제공하는 공식 LLM 문서 인덱스를 우선 확인한다.

- 공식 문서 인덱스: <https://apicenter.commerce.naver.com/llms/llms.txt>
- 인증과 전자서명: <https://apicenter.commerce.naver.com/llms/intro-인증.md>
- 전체 카테고리 조회: <https://apicenter.commerce.naver.com/llms/get-v1-categories.md>
- 카테고리 단건 조회: <https://apicenter.commerce.naver.com/llms/get-v1-categories-categoryId.md>
- 하위 카테고리 조회: <https://apicenter.commerce.naver.com/llms/get-v1-categories-categoryId-sub-categories.md>
- 상품명 카탈로그 조회: <https://apicenter.commerce.naver.com/docs/commerce-api/current/get-model-list-product>
- 카테고리별 상품 속성 조회: <https://apicenter.commerce.naver.com/llms/get-v1-product-attributes-attributes.md>
- 카테고리별 상품 속성값 조회: <https://apicenter.commerce.naver.com/llms/get-v1-product-attributes-attribute-values.md>
- 전체 상품 속성값 단위 조회: <https://apicenter.commerce.naver.com/llms/get-v1-product-attributes-attribute-value-units.md>
- 카테고리별 표준 옵션 조회: <https://apicenter.commerce.naver.com/llms/get-v1-options-standard-options.md>

## 연동 원칙

- 카테고리 연동은 네이버 커머스API의 `상품` API 그룹 권한을 사용한다.
- 서버 전용 환경 변수 이름은 `NAVER_COMMERCE_CLIENT_ID`, `NAVER_COMMERCE_CLIENT_SECRET`, `NAVER_COMMERCE_TOKEN_TYPE`을 사용한다.
- 본인 스토어 애플리케이션의 기본 토큰 타입은 `SELF`로 계획한다. 다른 판매자 리소스를 연동하는 `SELLER` 방식이 필요할 때만 `NAVER_COMMERCE_ACCOUNT_ID`를 추가한다.
- 인증정보에는 `NEXT_PUBLIC_` 접두사를 붙이지 않는다.
- Client Secret과 발급된 Access Token은 이 문서, 소스 코드, Git 기록 또는 일반 로그에 저장하지 않는다.
- Access Token은 고정값으로 보관하지 않고 서버가 Client ID와 Client Secret으로 필요할 때 발급하고 만료를 관리한다.

## 현재 구현 상태

- bcrypt + Base64 전자서명, Client Credentials 토큰 발급·캐시, 인증 만료 시 1회 재발급을 구현했다.
- 운영 Worker용 HMAC 중계 클라이언트와 고정 IP Node.js 릴레이를 구현했다. 배치와 Secret 설정은 [`naver-commerce-relay.md`](naver-commerce-relay.md)를 따른다.
- `/admin/channels/naver`의 명시적 버튼으로 전체 카테고리를 가져와 `naver_commerce_categories`에 원자적으로 교체 저장한다.
- 화면 조회와 검색은 DB만 사용하므로 페이지를 열 때마다 네이버 API가 호출되지 않는다.
- 상품 기본정보에서 네이버 최종 카테고리를 검색·선택할 수 있다. 카테고리가 비어 있으면 상품명의 고신뢰 카테고리명 일치 또는 네이버 카탈로그 30개 결과의 카테고리 다수결을 이용해 자동 적용한다.
- 상품 등록·수정·삭제·판매 상태 변경, 카테고리 속성 및 표준 옵션, 주문 정산 연동은 아직 구현되지 않았다. 해당 기능을 구현하기 전 위 공식 인덱스에서 현재 endpoint 규격을 다시 확인한다.

## API 호출 IP

- 네이버는 애플리케이션에 등록한 API 호출 IP만 허용하며, 미등록 IP에서는 `403 GW.IP_NOT_ALLOWED`를 반환한다.
- 로컬·Codespace의 공인 IP는 바뀔 수 있으므로 개발용 임시 등록에만 사용한다.
- 일반 Cloudflare Workers의 외부 요청 IP는 고정값으로 전제하지 않는다. 운영에서는 고정 공인 IP를 가진 중계 서버를 사용하거나 Cloudflare Enterprise의 Dedicated Egress IP 같은 고정 egress 구성을 검토한다.
- 참고: <https://apicenter.commerce.naver.com/docs/trouble-shooting>
