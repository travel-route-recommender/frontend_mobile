# TourAPI 신분류체계 필터 백엔드 수정계획 및 적용 보고서

## 목적

탐색 화면의 세부 테마 필터가 한국관광공사 TourAPI 신분류체계(`lclsSystm1/2/3`)와 직접 연결되도록 백엔드 계약을 확장한다.

## 적용 범위

- `PlaceCard` 응답에 `lclsSystm1`, `lclsSystm2`, `lclsSystm3` 및 각 이름 필드를 포함한다.
- `areaBasedList2`, `searchKeyword2`, `locationBasedList2`, `searchFestival2`, `searchStay2`, `areaBasedSyncList2` 호출에 `lclsSystm1/2/3` query를 전달한다.
- `/tour/regions/:region/search`에서도 지역 내 검색 시 분류 필터를 유지한다.
- `/tour/meta/category-codes/tree`를 추가해 `lclsSystmCode2(lclsSystmListYn=Y)` 응답을 대분류/중분류/소분류 트리로 내려준다.
- 분류 코드 트리는 `META_TTL` 7일 캐시를 사용해 TourAPI 호출량을 줄인다.

## 프론트 계약

프론트는 아래 endpoint와 필드를 기대한다.

- `GET /tour/meta/category-codes/tree`
- 응답 예시:

```json
[
  {
    "code": "NA",
    "name": "자연관광",
    "children": [
      {
        "code": "NA02",
        "name": "자연생태",
        "children": [{ "code": "NA020400", "name": "숲" }]
      }
    ]
  }
]
```

- 장소 카드/상세 응답에는 가능한 경우 아래 필드가 포함된다.

```json
{
  "lclsSystm1": "NA",
  "lclsSystm1Name": "자연관광",
  "lclsSystm2": "NA02",
  "lclsSystm2Name": "자연생태",
  "lclsSystm3": "NA020400",
  "lclsSystm3Name": "숲"
}
```

## 검증 계획

- 백엔드 `npm run build`로 DTO/service/controller 타입 검증.
- 프론트 `npm run typecheck` 및 `npm run verify:place-flow`.
- 실제 TourAPI key가 있는 환경에서 `/tour/meta/category-codes/tree`와 `/tour/regions/32/search?lclsSystm1=NA` 응답 샘플 확인.

## 남은 리스크

- TourAPI 응답 키가 운영 환경에서 문서와 다르게 내려오는 경우를 대비해 camelCase/lowercase 계열 키를 모두 읽도록 처리했다.
- 기존 `/tour/meta/category-codes`의 flat 응답은 유지했다. 프론트 신규 필터는 tree endpoint를 사용한다.
- `detailIntro2` 부가정보는 기존 상세 endpoint의 `intro`를 활용하므로 별도 endpoint 추가는 필요 없다.

## 적용 파일

- `/Users/shin/Desktop/backend/src/tour/tour.util.ts`
- `/Users/shin/Desktop/backend/src/tour/dto/tour-query.dto.ts`
- `/Users/shin/Desktop/backend/src/tour/dto/tour-response.dto.ts`
- `/Users/shin/Desktop/backend/src/tour/tour.service.ts`
- `/Users/shin/Desktop/backend/src/tour/tour.controller.ts`

## 패치 보관

- 프론트 워크스페이스에 적용 패치 사본을 보관했다.
- `docs/backend-tour-classification.patch`
