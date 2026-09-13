(async () => {
  'use strict';

  const config = window.APP_CONFIG;
  if (!config?.region?.center || !config?.region?.bounds) throw new Error('config.js에 유효한 지역 설정이 필요합니다.');
  const { app: appConfig, region, map: mapConfig, search: searchConfig } = config;
  const STORAGE_KEY = `${appConfig.storageKeyPrefix}:${region.id}`;
  const categoryMeta = {
    '좋아요': { className:'like', symbol:'♥', countId:'likeCount', color:'#cb4f61' },
    '불편해요': { className:'inconvenient', symbol:'!', countId:'inconvenientCount', color:'#d78327' },
    '추천해요': { className:'recommend', symbol:'★', countId:'recommendCount', color:'#39705f' },
    '바뀌었으면 해요': { className:'change', symbol:'↻', countId:'changeCount', color:'#6a61a9' }
  };

  applyRegionConfig();
  await loadGoogleMaps();

  const map = new google.maps.Map(document.querySelector('#map'), {
    center: region.center,
    zoom: region.initialZoom,
    minZoom: region.minZoom,
    maxZoom: region.maxZoom,
    mapTypeId: mapConfig.mapTypeId,
    clickableIcons: false,
    streetViewControl: false,
    fullscreenControl: false,
    mapTypeControl: false,
    restriction: { latLngBounds:region.bounds, strictBounds:true }
  });
  const infoWindow = new google.maps.InfoWindow();
  const pinModal = document.querySelector('#pinModal');
  const pinForm = document.querySelector('#pinForm');
  const opinion = document.querySelector('#opinion');
  let selectedLatLng = null;
  let selectedPlaceId = null;
  let activeCategory = '전체';
  let places = loadPlaces();
  let pinMarkers = [];
  let searchMarker = null;
  let toastTimer;
  let searchTimer;
  let searchController;
  let lastSearchRequestAt = 0;

  function applyRegionConfig() {
    const appTitle = `${region.name} ${appConfig.titleSuffix}`;
    document.title = appTitle;
    document.querySelector('#brandTitle').textContent = appTitle;
    document.querySelector('#brandSubtitle').textContent = appConfig.subtitle;
    document.querySelector('#brandLink').setAttribute('aria-label', `${appTitle} 처음으로`);
    document.querySelector('#regionEnglishName').textContent = `${region.englishName} VOICE MAP`;
    document.querySelector('#regionHeading').textContent = region.name;
    document.querySelector('#regionStepName').textContent = region.name;
    document.querySelector('#mapPanel').setAttribute('aria-label', `${region.name} 의견 지도`);
    document.querySelector('#searchLabel').textContent = `${region.name} 장소 또는 주소 검색`;
    document.querySelector('#searchInput').placeholder = `${region.name} 장소명 또는 주소 검색`;
    document.querySelector('#mapStatusText').textContent = `${region.name} 안에서만 핀을 등록할 수 있어요`;
  }

  async function loadGoogleMaps() {
    const response = await fetch('/api/client-config');
    if (!response.ok) throw new Error('지도 설정을 불러오지 못했습니다.');
    const { googleMapsBrowserKey } = await response.json();
    if (!googleMapsBrowserKey) throw new Error('.env에 GOOGLE_MAPS_BROWSER_KEY를 설정해 주세요.');
    await new Promise((resolve, reject) => {
      window.__initTravelMap = resolve;
      const script = document.createElement('script');
      script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(googleMapsBrowserKey)}&callback=__initTravelMap&v=weekly&language=${encodeURIComponent(searchConfig.language)}&region=${encodeURIComponent(searchConfig.regionCode)}`;
      script.async = true;
      script.onerror = () => reject(new Error('Google 지도를 불러오지 못했습니다.'));
      document.head.append(script);
    });
    delete window.__initTravelMap;
  }

  function loadPlaces() {
    try {
      let storedValue = localStorage.getItem(STORAGE_KEY);
      if (storedValue === null) {
        const legacyKeys = appConfig.legacyStorageKeysByRegion?.[region.id] || [];
        const legacyKey = legacyKeys.find(key => localStorage.getItem(key) !== null);
        storedValue = legacyKey ? localStorage.getItem(legacyKey) : '[]';
        if (legacyKey) localStorage.setItem(STORAGE_KEY, storedValue);
      }
      const value = JSON.parse(storedValue || '[]');
      if (!Array.isArray(value)) return [];
      return value.map(place => {
        if (Array.isArray(place.opinions)) return { ...place, placeId:place.placeId || place.sourcePlaceId || null };
        return {
          id:place.id,
          placeId:place.placeId || place.sourcePlaceId || null,
          lat:place.lat,
          lng:place.lng,
          placeName:place.placeName,
          opinions:[{
            id:`${place.id}-opinion`,
            text:place.opinion || '',
            category:place.category || '좋아요',
            createdAt:place.createdAt || null
          }]
        };
      });
    } catch (_) { return []; }
  }

  function savePlaces() { localStorage.setItem(STORAGE_KEY, JSON.stringify(places)); }
  function insideRegion(position) {
    const { lat, lng } = position;
    return lat >= region.bounds.south && lat <= region.bounds.north && lng >= region.bounds.west && lng <= region.bounds.east;
  }

  function markerOptions(place) {
    const visibleOpinions = activeCategory === '전체' ? place.opinions : place.opinions.filter(opinionItem => opinionItem.category === activeCategory);
    const markerCategory = visibleOpinions.at(-1)?.category || place.opinions.at(-1)?.category || '좋아요';
    const meta = categoryMeta[markerCategory];
    return {
      position: { lat:Number(place.lat), lng:Number(place.lng) },
      map,
      title: place.placeName,
      icon: { path:google.maps.SymbolPath.CIRCLE, scale:18, fillColor:meta.color, fillOpacity:1, strokeColor:'#ffffff', strokeWeight:4 },
      label: { text:meta.symbol, color:'#ffffff', fontSize:'14px', fontWeight:'700' }
    };
  }

  function renderPins() {
    pinMarkers.forEach(marker => marker.setMap(null));
    pinMarkers = [];
    places.filter(place => activeCategory === '전체' || place.opinions.some(opinionItem => opinionItem.category === activeCategory)).forEach(place => {
      const marker = new google.maps.Marker(markerOptions(place));
      marker.addListener('click', () => {
        const content = document.createElement('div');
        content.className = 'google-info-content';
        const title = document.createElement('h3');
        title.className = 'popup-place';
        title.textContent = place.placeName;
        content.append(title);
        place.opinions.filter(opinionItem => activeCategory === '전체' || opinionItem.category === activeCategory).forEach(opinionItem => {
          const opinionCard = document.createElement('div');
          const category = document.createElement('span');
          const memo = document.createElement('p');
          opinionCard.className = 'popup-opinion-card';
          category.className = 'popup-category';
          memo.className = 'popup-opinion';
          category.textContent = opinionItem.category;
          memo.textContent = opinionItem.text;
          opinionCard.append(category, memo);
          content.append(opinionCard);
        });
        infoWindow.setContent(content);
        infoWindow.open({ map, anchor:marker });
      });
      pinMarkers.push(marker);
    });
    updateCounts();
  }

  function updateCounts() {
    const opinionCount = places.reduce((total, place) => total + place.opinions.length, 0);
    document.querySelector('#pinCount').textContent = opinionCount;
    document.querySelector('#allCount').textContent = opinionCount;
    Object.entries(categoryMeta).forEach(([category, meta]) => {
      document.querySelector(`#${meta.countId}`).textContent = places.reduce((total, place) => total + place.opinions.filter(opinionItem => opinionItem.category === category).length, 0);
    });
  }

  function openModal(latlng, suggestedPlaceName = '', placeId = null) {
    selectedLatLng = latlng;
    selectedPlaceId = placeId;
    document.querySelector('#selectedCoordinates').textContent = `위도 ${latlng.lat.toFixed(5)} · 경도 ${latlng.lng.toFixed(5)}`;
    document.querySelector('#placeName').value = suggestedPlaceName;
    pinModal.hidden = false;
    document.body.classList.add('modal-open');
    setTimeout(() => document.querySelector('#placeName').focus(), 50);
  }

  function closeModal() {
    pinModal.hidden = true;
    document.body.classList.remove('modal-open');
    pinForm.reset();
    document.querySelector('#charCount').textContent = '0';
    selectedLatLng = null;
    selectedPlaceId = null;
  }

  function showToast(message) {
    const toast = document.querySelector('#toast');
    toast.textContent = message;
    toast.classList.add('visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('visible'), 2200);
  }

  function renderSearchResults(results, message = '') {
    const container = document.querySelector('#searchResults');
    container.replaceChildren();
    if (message) {
      const paragraph = document.createElement('p');
      paragraph.className = 'search-message';
      paragraph.textContent = message;
      container.append(paragraph);
    } else {
      results.forEach(result => {
        const button = document.createElement('button');
        const title = document.createElement('strong');
        const address = document.createElement('small');
        button.type = 'button';
        button.className = 'search-result';
        title.textContent = result.name;
        address.textContent = result.address;
        button.append(title, address);
        button.addEventListener('click', () => selectSearchResult(result));
        container.append(button);
      });
    }
    const attribution = document.createElement('div');
    attribution.className = 'search-attribution';
    attribution.setAttribute('translate', 'no');
    attribution.textContent = 'Google Maps';
    container.append(attribution);
    container.hidden = false;
  }

  async function runPlaceSearch(query) {
    const normalizedQuery = query.trim();
    if (normalizedQuery.length < 2) return renderSearchResults([], '두 글자 이상 입력해 주세요.');
    const submitButton = document.querySelector('.search-submit');
    submitButton.disabled = true;
    submitButton.textContent = '검색 중';
    searchController?.abort();
    const controller = new AbortController();
    searchController = controller;
    const elapsed = Date.now() - lastSearchRequestAt;
    if (elapsed < searchConfig.minRequestIntervalMs) await new Promise(resolve => setTimeout(resolve, searchConfig.minRequestIntervalMs - elapsed));
    try {
      if (controller.signal.aborted) return;
      lastSearchRequestAt = Date.now();
      const response = await fetch(searchConfig.endpoint, {
        method:'POST',
        headers:{ 'Content-Type':'application/json' },
        body:JSON.stringify({ query:normalizedQuery }),
        signal:controller.signal
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || '검색에 실패했습니다.');
      renderSearchResults(data.places, data.places.length ? '' : `${region.name} 안에서 검색 결과를 찾지 못했어요.`);
    } catch (error) {
      if (error.name !== 'AbortError') renderSearchResults([], error.message || '검색 서비스에 연결하지 못했어요.');
    } finally {
      if (searchController === controller) {
        submitButton.disabled = false;
        submitButton.textContent = '검색';
      }
    }
  }

  function schedulePlaceSearch(query) {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => runPlaceSearch(query), searchConfig.debounceMs);
  }

  function selectSearchResult(result) {
    const location = { lat:Number(result.lat), lng:Number(result.lng) };
    if (!insideRegion(location)) return showToast(`${region.name} 밖의 장소는 선택할 수 없어요.`);
    document.querySelector('#searchResults').hidden = true;
    map.panTo(location);
    map.setZoom(region.searchResultZoom);
    if (searchMarker) searchMarker.setMap(null);
    searchMarker = new google.maps.Marker({ position:location, map, title:result.name });
    const content = document.createElement('div');
    const title = document.createElement('h3');
    const address = document.createElement('p');
    const addButton = document.createElement('button');
    content.className = 'google-info-content';
    title.className = 'popup-place';
    address.className = 'popup-opinion';
    addButton.className = 'search-popup-button';
    title.textContent = result.name;
    address.textContent = result.address;
    addButton.type = 'button';
    addButton.textContent = '이 위치에 의견 핀 등록하기';
    addButton.addEventListener('click', () => openModal(location, result.name, result.placeId));
    content.append(title, address, addButton);
    infoWindow.setContent(content);
    infoWindow.open({ map, anchor:searchMarker });
  }

  map.addListener('click', event => {
    const location = event.latLng.toJSON();
    if (!insideRegion(location)) return showToast(`${region.name} 안의 장소를 선택해 주세요.`);
    openModal(location);
  });

  pinForm.addEventListener('submit', event => {
    event.preventDefault();
    if (!selectedLatLng) return;
    const formData = new FormData(pinForm);
    const opinionItem = {
      id:crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-opinion`,
      text:opinion.value.trim(),
      category:formData.get('category'),
      createdAt:new Date().toISOString()
    };
    const existingPlace = selectedPlaceId ? places.find(place => place.placeId === selectedPlaceId) : null;
    if (existingPlace) {
      existingPlace.placeName = document.querySelector('#placeName').value.trim();
      existingPlace.lat = selectedLatLng.lat;
      existingPlace.lng = selectedLatLng.lng;
      existingPlace.opinions.push(opinionItem);
    } else {
      places.push({
        id:crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
        placeId:selectedPlaceId,
        lat:selectedLatLng.lat,
        lng:selectedLatLng.lng,
        placeName:document.querySelector('#placeName').value.trim(),
        opinions:[opinionItem]
      });
    }
    savePlaces();
    activeCategory = '전체';
    setActiveFilter();
    renderPins();
    closeModal();
    showToast('지도에 의견 핀이 등록되었어요!');
  });

  opinion.addEventListener('input', () => { document.querySelector('#charCount').textContent = opinion.value.length; });
  document.querySelector('#closeModalButton').addEventListener('click', closeModal);
  document.querySelector('#cancelButton').addEventListener('click', closeModal);
  pinModal.addEventListener('click', event => { if (event.target === pinModal) closeModal(); });
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && !pinModal.hidden) closeModal(); });
  document.querySelector('#mapTip button').addEventListener('click', () => document.querySelector('#mapTip').remove());
  document.querySelector('#resetViewButton').addEventListener('click', () => { map.setCenter(region.center); map.setZoom(region.initialZoom); });
  document.querySelector('#helpButton').addEventListener('click', () => showToast('지도에서 원하는 장소를 클릭해 의견을 등록하세요.'));
  document.querySelector('#searchForm').addEventListener('submit', event => { event.preventDefault(); schedulePlaceSearch(document.querySelector('#searchInput').value); });
  document.querySelector('#searchInput').addEventListener('input', event => { document.querySelector('#searchClearButton').hidden = !event.target.value; });
  document.querySelector('#searchInput').addEventListener('keydown', event => { if (event.key === 'Escape') document.querySelector('#searchResults').hidden = true; });
  document.querySelector('#searchClearButton').addEventListener('click', () => {
    const input = document.querySelector('#searchInput');
    input.value = '';
    input.focus();
    document.querySelector('#searchClearButton').hidden = true;
    document.querySelector('#searchResults').hidden = true;
    clearTimeout(searchTimer);
    searchController?.abort();
  });
  document.querySelector('#showAllButton').addEventListener('click', () => selectCategory('전체'));
  document.querySelectorAll('.category-filter').forEach(button => button.addEventListener('click', () => selectCategory(button.dataset.category)));

  function selectCategory(category) { activeCategory = category; setActiveFilter(); renderPins(); }
  function setActiveFilter() { document.querySelectorAll('.category-filter').forEach(button => button.classList.toggle('active', button.dataset.category === activeCategory)); }

  renderPins();
})().catch(error => {
  console.error(error);
  const mapElement = document.querySelector('#map');
  mapElement.innerHTML = `<div class="map-load-error"><strong>지도를 시작할 수 없습니다.</strong><span>${error.message}</span><small>.env 설정 후 npm start로 실행해 주세요.</small></div>`;
});
