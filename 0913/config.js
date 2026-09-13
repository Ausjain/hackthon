/*
 * 지역 변경은 이 파일의 region 값만 수정하면 됩니다.
 * bounds 순서: 남쪽(south), 서쪽(west), 북쪽(north), 동쪽(east)
 */
window.APP_CONFIG = {
  app: {
    titleSuffix: '한마디 지도',
    subtitle: '우리 동네를 더 좋은 곳으로',
    storageKeyPrefix: 'place-voice-map-pins-v1',
    legacyStorageKeysByRegion: {
      'eunpyeong-gu': ['eunpyeong-voice-map-pins-v1']
    }
  },
  region: {
    id: 'eunpyeong-gu',
    name: '은평구',
    englishName: 'EUNPYEONG',
    center: { lat: 37.60979, lng: 126.90571 },
    bounds: {
      south: 37.5705,
      west: 126.8700,
      north: 37.6650,
      east: 126.9695
    },
    initialZoom: 17,
    searchResultZoom: 17,
    minZoom: 13,
    maxZoom: 19,
    maxBoundsPadding: 0.12,
    searchQuerySuffix: '은평구, 서울특별시',
    searchAliases: ['은평구', 'Eunpyeong'],
    countryCode: 'kr'
  },
  map: {
    tileUrl: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
  },
  search: {
    endpoint: 'https://nominatim.openstreetmap.org/search',
    debounceMs: 500,
    minRequestIntervalMs: 1100,
    requestLimit: 8,
    displayLimit: 5,
    language: 'ko'
  }
};
