export type SynonymGroup = {
  canonical: string;
  aliases: string[];
  categoryScope?: string[];
};

export const keywordLexicon = {
  materials: [
    "스테인리스", "스테인레스", "스텐", "철제", "금속", "고무", "실리콘",
    "가죽", "플라스틱", "아크릴", "원목", "나무", "유리", "면", "린넨",
    "폴리에스터", "울", "니트", "도자기", "세라믹",
  ],
  purposes: [
    "바느질", "재봉", "공예", "수납", "보관", "정리", "거치", "캠핑",
    "주방", "욕실", "차량", "사무", "작업", "청소", "운동", "낚시", "여행",
  ],
  targets: ["여성", "여자", "여성용", "남성", "남자", "남성용", "아동", "유아", "성인"],
  forms: ["루즈핏", "여유핏", "슬림핏", "오버핏", "라운드", "브이넥", "접이식", "휴대용"],
  features: ["방수", "미끄럼방지", "논슬립", "경량", "내열", "보온", "통기성", "다용도"],
  colors: ["검정", "블랙", "흰색", "화이트", "빨강", "레드", "파랑", "블루", "베이지", "그레이", "회색"],
  seasons: ["봄", "여름", "가을", "겨울", "동절기", "사계절"],
  styles: ["캐주얼", "클래식", "내추럴", "빈티지", "모던"],
  categoryTerms: ["부자재", "용품", "상품", "제품", "세트", "도구", "잡화", "소품"],
  promotionalTerms: [
    "무료배송", "정품", "신상품", "신상", "인기", "추천", "특가", "최저가",
    "할인", "이벤트", "국내배송", "당일배송", "명품", "프리미엄", "고급",
  ],
  abstractTerms: ["예쁜", "예쁨", "데일리", "데일리룩", "필수템", "핫템", "스타일"],
} as const;

export const synonymGroups: SynonymGroup[] = [
  { canonical: "여성", aliases: ["여자", "여성용"] },
  { canonical: "남성", aliases: ["남자", "남성용"] },
  { canonical: "루즈핏", aliases: ["여유핏", "넉넉한핏"] },
  { canonical: "겨울", aliases: ["동절기"] },
  { canonical: "티셔츠", aliases: ["티", "티샤쓰"], categoryScope: ["패션의류"] },
  { canonical: "스테인리스", aliases: ["스테인레스", "스텐"] },
];

export function canonicalKeyword(value: string, category = "") {
  const normalized = value.normalize("NFKC").trim().toLocaleLowerCase("ko-KR");
  const group = synonymGroups.find(
    (item) =>
      (!item.categoryScope?.length || item.categoryScope.some((scope) => category.includes(scope))) &&
      [item.canonical, ...item.aliases].some(
        (term) => term.toLocaleLowerCase("ko-KR") === normalized,
      ),
  );
  return group?.canonical ?? value.trim();
}
