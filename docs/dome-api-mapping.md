# 친구도매 API 매핑

검증 기준: 사용자가 제공한 2022-11-16 형식의 다중 상품 XML 샘플. 실제 계정 호출 검증은 아직 수행하지 않았습니다.

## 요청

`POST https://79dome.com/Api/ProductSelect_Api_UTF8.php`, form-urlencoded 방식입니다. `id`, `apiKey`는 필수이고 이번 단계에서는 `goodsno`만 선택 파라미터로 전송합니다. 문서상 향후 확장 후보는 `runout`, `opendate_s/e`, `modidate_s/e`입니다.

## 확인된 매핑

| XML | 표준 모델 | DB |
|---|---|---|
| `product@goodsno` | `externalProductId` | `supplier_products.external_product_id` |
| `goodsnm` | `originalName` | `original_name` |
| `goods_price` | `supplierPrice` | `supplier_price` |
| `status` (`정상`) | `availability=active` | `availability` |
| `status` (`품절`) | `availability=sold_out` | `availability` |
| `img_l/img_N` | `images[]` | `original_images` |
| `options` CDATA (`이름^|^가격||`) | `options[]` | `original_options` |
| `detailed_source` CDATA | `rawDescription` | `raw_description` |
| `regdate` | `supplierCreatedAt` | `supplier_created_at` |
| `lastmodidate` | `supplierUpdatedAt` | `supplier_updated_at` |
| 나머지 product 필드 | `rawPayload` | `raw_payload` |

`category`, `goodscd`, `madein`, `option_value`, `goods_consumer`, `goods_minPrice`는 샘플에서 존재를 확인했으나 표준 모델의 독립 필드로 승격하지 않고 raw payload에 보존합니다. 통화는 API가 별도 통화를 제공하지 않는 국내 공급가라는 현재 계약 전제에 따라 `KRW`로 저장합니다.

## 확인되지 않은 부분과 TODO

- 실제 API의 인증 실패, 호출 제한, 상품 없음, 서버 오류 XML 구조
- `runout`의 실제 값 전체와 `status`의 가능한 전체 집합
- 날짜의 공식 timezone 및 빈 날짜 이외의 변형
- 옵션명에 구분자 자체가 포함될 가능성, 추가금인지 절대 공급가인지에 대한 계약 의미
- 이미지 태그가 `img_N` 외 다른 중첩/반복 구조를 사용하는 경우
- XML 선언은 샘플의 EUC-KR을 확인했으며 HTTP charset/선언을 기준으로 decode하지만 실제 응답 헤더 조합 검증 필요

이 항목들은 실제 API 응답을 확보한 뒤 fixture와 스키마를 확장합니다. 확인 전에는 임의 필수 필드로 만들지 않습니다.
