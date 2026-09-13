# 은평 한마디 지도

은평구 학생들이 지도 위 장소에 의견을 남기는 1차 로컬 버전입니다.

## 실행

`0913` 폴더에서 아래 명령을 실행한 뒤 브라우저에서 `http://localhost:4173`을 엽니다.

```powershell
python -m http.server 4173
```

Leaflet과 OpenStreetMap 타일을 CDN에서 불러오므로 지도 표시에는 인터넷 연결이 필요합니다. 등록한 핀은 별도 데이터베이스가 아닌 현재 브라우저의 `localStorage`에만 저장됩니다.

장소 검색은 공개 Nominatim 검색 API를 사용합니다. 검색 버튼 또는 Enter로 요청하며, 요청 간격 제한과 동일 검색어 캐시가 적용됩니다. 공개 서비스의 [사용 정책](https://operations.osmfoundation.org/policies/nominatim/)에 따라 자동완성 방식의 연속 검색은 사용하지 않습니다.
