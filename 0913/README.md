# 은평 한마디 지도

여행지와 생활 장소를 검색하고 개인 핀과 메모를 남기는 로컬 웹앱입니다. 기본 지역은 은평구이며 설정으로 다른 지역으로 변경할 수 있습니다.

## 실행

Google Cloud에서 **Maps JavaScript API**와 **Places API (New)**를 활성화하고 결제 계정을 연결합니다. `.env.example`을 `.env`로 복사한 뒤 두 API 키를 설정합니다.

```powershell
Copy-Item .env.example .env
# .env에 실제 키 입력
node server.js
```

브라우저에서 `http://127.0.0.1:4173`을 엽니다. 외부 패키지 설치는 필요하지 않습니다.

장소 검색은 Google Places API (New)의 Text Search를 사용합니다. 서버가 `.env`의 `GOOGLE_PLACES_API_KEY`로 요청하고 브라우저에는 이 키를 보내지 않습니다. 지도용 `GOOGLE_MAPS_BROWSER_KEY`는 소스 코드에는 저장되지 않지만 Google Maps JavaScript를 로드하기 위해 브라우저에 전달되므로, Google Cloud에서 허용 HTTP 리퍼러와 Maps JavaScript API로 반드시 제한해야 합니다. 서버 키도 Places API (New) 및 서버 IP로 제한하는 것을 권장합니다.

등록한 핀, 좋아요·불편해요 반응과 댓글은 데이터베이스 없이 현재 브라우저의 `localStorage`에 저장됩니다. Google 검색으로 선택한 장소는 Place ID를 기준으로 동일 장소를 판별하므로, 같은 장소를 다시 선택하면 기존 상세창이 열립니다. 과거 분류형 의견 데이터는 실행 시 반응 수와 댓글 구조로 자동 변환됩니다. Google 검색 결과 중 장기 저장이 허용되는 Place ID와 사용자가 직접 저장한 장소명·좌표·댓글만 핀에 보관합니다.

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
- `countryCode`: 지역 국가 코드

핀과 댓글은 `storageKeyPrefix + region.id`로 분리 저장됩니다. 반응, 댓글 작성, 지도 검색 로직에는 특정 지역명이 포함되지 않습니다.

## Vercel 배포

Vercel 프로젝트의 **Root Directory**를 `0913`으로 지정합니다. 별도 Build Command와 Output Directory는 설정하지 않아도 됩니다.

Vercel Project Settings의 Environment Variables에서 다음 값을 Preview와 Production 환경에 등록한 뒤 재배포합니다.

- `GOOGLE_PLACES_API_KEY`: `api/places/search-text.js` 서버리스 함수에서만 사용
- `GOOGLE_MAPS_BROWSER_KEY`: `api/client-config.js`를 통해 지도 로더에 전달

Vercel에서는 `server.js`를 실행하지 않습니다. `/api/client-config`와 `/api/places/search-text` 경로는 `api/` 폴더의 Vercel Functions가 처리합니다. `server.js`는 로컬 실행 전용입니다.
