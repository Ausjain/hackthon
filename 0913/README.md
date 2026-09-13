# 은평 한마디 지도

은평구 학생들이 지도 위 장소에 의견을 남기는 1차 로컬 버전입니다.

## 실행

`0913` 폴더에서 아래 명령을 실행한 뒤 브라우저에서 `http://localhost:4173`을 엽니다.

```powershell
python -m http.server 4173
```

Leaflet과 OpenStreetMap 타일을 CDN에서 불러오므로 지도 표시에는 인터넷 연결이 필요합니다. 등록한 핀은 별도 데이터베이스가 아닌 현재 브라우저의 `localStorage`에만 저장됩니다.

장소 검색은 공개 Nominatim 검색 API를 사용합니다. 검색 버튼 또는 Enter로 요청하며, 요청 간격 제한과 동일 검색어 캐시가 적용됩니다. 공개 서비스의 [사용 정책](https://operations.osmfoundation.org/policies/nominatim/)에 따라 자동완성 방식의 연속 검색은 사용하지 않습니다.

## 지역 설정 변경

앱 로직을 수정하지 않고 [`config.js`](./config.js)의 `region` 설정만 바꾸면 다른 지역에 사용할 수 있습니다.

- `id`: 지역별 핀 저장 공간을 구분하는 고유 ID
- `name`, `englishName`: 화면에 표시할 지역명
- `center`: 처음 표시할 중심 위도·경도
- `bounds`: 이동·핀 등록·검색 결과를 허용할 범위
- `initialZoom`, `minZoom`, `maxZoom`: 초기 및 허용 줌
- `searchResultZoom`: 검색 결과를 선택했을 때의 줌
- `searchQuerySuffix`: 검색어 뒤에 붙일 행정구역
- `searchAliases`: 검색 결과가 해당 지역인지 확인할 명칭 목록
- `countryCode`: Nominatim 국가 제한 코드

핀과 의견은 `storageKeyPrefix + region.id`로 분리 저장됩니다. 카테고리, 의견 작성, 지도 검색 로직에는 특정 지역명이 포함되지 않습니다.
