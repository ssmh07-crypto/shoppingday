# Product domain

## 데이터 경계

- `supplier_products`: 상품명, 공급가, 이미지 URL, 옵션, 설명, 품절 상태, 공급처 시각, raw payload 원본. 상품 편집에서는 수정하지 않는다.
- `products`: 판매용 상품명, 태그, 판매가, 정화된 설명 HTML, 내부 카테고리, 판매 이미지 메타데이터, 편집 옵션, 상태와 버전.
- `products.owner_id`: 가져오기를 수행한 관리자. 목록·상세·수정 모두 현재 인증 사용자와 비교해 IDOR를 방지한다. 마이그레이션 이전 레거시 null 상품은 최초 저장 관리자에게 귀속된다.
- 향후 `product_publications`: 마켓별 게시 상태와 외부 상품 ID. `products.status`에 게시 상태를 섞지 않는다.

## 상태

- `draft`: 가져오기 직후 또는 사용자가 초안으로 되돌린 상태
- `editing`: 임시저장된 편집 상태. ready 중요 필드 수정 시에도 전환
- `ready`: 내부 필수값 검토 통과. 실제 마켓 게시는 아님
- `archived`: 내부 보관 상태

ready 중요 필드는 `title`, `sellingPrice`, `description`, `selectedImages`, `editedOptions`다. 태그나 카테고리만 바뀐 경우 ready를 유지할 수 있다.

## 필수 검증

ready에는 상품명, 0보다 큰 정수 판매가, 활성 대표 이미지, 상세설명이 필요하다. 옵션 그룹이 있으면 활성 조합도 필요하다. 카테고리와 태그는 이번 단계에서 선택값이다.

이미지는 `{id, source, sourceUrl, storedUrl, altText, sortOrder, isPrimary, enabled}` 구조이며 이번 단계에서는 `source=supplier`, `storedUrl=null`만 사용한다. 파일은 저장하지 않는다.

옵션은 `groups[].values[]`와 `combinations[]`로 분리한다. 빈 이름, 그룹 내 중복 값, 중복 조합, 비정수 추가금, 음수/비정수 재고를 거부한다. 옵션 없는 단일 상품은 빈 그룹과 조합으로 표현한다.
