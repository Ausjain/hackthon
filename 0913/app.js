(async () => {
  'use strict';

  const config = window.APP_CONFIG;
  if (!config?.region?.center || !config?.region?.bounds) throw new Error('config.js에 유효한 지역 설정이 필요합니다.');
  const { app: appConfig, region, map: mapConfig, search: searchConfig } = config;
  const STORAGE_KEY = `${appConfig.storageKeyPrefix}:${region.id}`;

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
      return value.map(place => normalizePlace(place));
    } catch (_) { return []; }
  }

  function normalizePlace(place) {
    const oldOpinions = Array.isArray(place.opinions)
      ? place.opinions
      : [{ id:`${place.id}-opinion`, text:place.opinion || '', category:place.category, createdAt:place.createdAt || null }];
    return {
      id:place.id,
      placeId:place.placeId || place.sourcePlaceId || null,
      lat:place.lat,
      lng:place.lng,
      placeName:place.placeName,
      reactions:place.reactions || {
        like:oldOpinions.filter(item => item.category === '좋아요').length,
        dislike:oldOpinions.filter(item => item.category === '불편해요').length
      },
      comments:Array.isArray(place.comments) ? place.comments : oldOpinions.filter(item => item.text?.trim()).map(item => ({
        id:item.id,
        text:item.text.trim(),
        createdAt:item.createdAt || null
      }))
    };
  }

  function savePlaces() { localStorage.setItem(STORAGE_KEY, JSON.stringify(places)); }
  function createId(suffix = '') {
    const id = crypto.randomUUID ? crypto.randomUUID() : String(Date.now());
    return suffix ? `${id}-${suffix}` : id;
  }
  function insideRegion(position) {
    const { lat, lng } = position;
    return lat >= region.bounds.south && lat <= region.bounds.north && lng >= region.bounds.west && lng <= region.bounds.east;
  }

  function markerOptions(place) {
    return {
      position: { lat:Number(place.lat), lng:Number(place.lng) },
      map,
      title: place.placeName,
      icon: { path:google.maps.SymbolPath.CIRCLE, scale:16, fillColor:'#ee6b3b', fillOpacity:1, strokeColor:'#ffffff', strokeWeight:4 },
      label: { text:'●', color:'#ffffff', fontSize:'10px', fontWeight:'700' }
    };
  }

  function renderPins() {
    pinMarkers.forEach(marker => marker.setMap(null));
    pinMarkers = [];
    places.forEach(place => {
      const marker = new google.maps.Marker(markerOptions(place));
      marker.placeRecordId = place.id;
      marker.addListener('click', () => openPlaceDetail(place, marker));
      pinMarkers.push(marker);
    });
    updateCounts();
  }

  function updateCounts() {
    document.querySelector('#pinCount').textContent = places.length;
  }

  function openPlaceDetail(place, marker) {
    const content = document.createElement('div');
    const title = document.createElement('h3');
    const reactions = document.createElement('div');
    const likeButton = createReactionButton('👍', '좋아요', place.reactions.like, 'like');
    const dislikeButton = createReactionButton('👎', '불편해요', place.reactions.dislike, 'dislike');
    const commentsTitle = document.createElement('strong');
    const commentsList = document.createElement('div');
    const commentForm = document.createElement('form');
    const commentInput = document.createElement('textarea');
    const commentButton = document.createElement('button');
    content.className = 'place-detail';
    title.className = 'popup-place';
    title.textContent = place.placeName;
    reactions.className = 'reaction-row';
    commentsTitle.className = 'comments-title';
    commentsTitle.textContent = `댓글 ${place.comments.length}개`;
    commentsList.className = 'comment-list';
    if (place.comments.length) {
      place.comments.forEach(comment => {
        const item = document.createElement('p');
        item.className = 'comment-item';
        item.textContent = comment.text;
        commentsList.append(item);
      });
    } else {
      const empty = document.createElement('p');
      empty.className = 'comment-empty';
      empty.textContent = '아직 댓글이 없어요. 첫 댓글을 남겨보세요!';
      commentsList.append(empty);
    }
    commentForm.className = 'comment-form';
    commentInput.maxLength = 200;
    commentInput.required = true;
    commentInput.rows = 2;
    commentInput.placeholder = '이 장소에 대한 댓글을 써주세요.';
    commentButton.type = 'submit';
    commentButton.textContent = '댓글 등록';
    commentForm.append(commentInput, commentButton);
    reactions.append(likeButton, dislikeButton);
    content.append(title, reactions, commentsTitle, commentsList, commentForm);
    commentForm.addEventListener('submit', event => {
      event.preventDefault();
      const text = commentInput.value.trim();
      if (!text) return;
      place.comments.push({ id:createId('comment'), text, createdAt:new Date().toISOString() });
      savePlaces();
      openPlaceDetail(place, marker);
    });
    infoWindow.setContent(content);
    infoWindow.open({ map, anchor:marker });

    function createReactionButton(icon, label, count, reactionKey) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `reaction-button ${reactionKey}`;
      button.textContent = `${icon} ${label} ${count}`;
      button.addEventListener('click', () => {
        place.reactions[reactionKey] += 1;
        savePlaces();
        openPlaceDetail(place, marker);
      });
      return button;
    }
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
    const savedPlace = places.find(place => place.placeId === result.placeId);
    if (savedPlace) {
      openPlaceDetail(savedPlace, searchMarker);
      return;
    }
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
    addButton.textContent = '이 장소를 내 지도에 추가하기';
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
    const existingPlace = selectedPlaceId ? places.find(place => place.placeId === selectedPlaceId) : null;
    const firstComment = opinion.value.trim();
    let savedPlace = existingPlace;
    if (existingPlace) {
      existingPlace.placeName = document.querySelector('#placeName').value.trim();
      existingPlace.lat = selectedLatLng.lat;
      existingPlace.lng = selectedLatLng.lng;
      if (firstComment) existingPlace.comments.push({ id:createId('comment'), text:firstComment, createdAt:new Date().toISOString() });
    } else {
      savedPlace = {
        id:createId(),
        placeId:selectedPlaceId,
        lat:selectedLatLng.lat,
        lng:selectedLatLng.lng,
        placeName:document.querySelector('#placeName').value.trim(),
        reactions:{ like:0, dislike:0 },
        comments:firstComment ? [{ id:createId('comment'), text:firstComment, createdAt:new Date().toISOString() }] : []
      };
      places.push(savedPlace);
    }
    savePlaces();
    renderPins();
    closeModal();
    const savedMarker = pinMarkers.find(marker => marker.placeRecordId === savedPlace?.id);
    if (savedPlace && savedMarker) openPlaceDetail(savedPlace, savedMarker);
    showToast('지도에 장소가 추가되었어요!');
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
  renderPins();
})().catch(error => {
  console.error(error);
  const mapElement = document.querySelector('#map');
  mapElement.innerHTML = `<div class="map-load-error"><strong>지도를 시작할 수 없습니다.</strong><span>${error.message}</span><small>.env 설정 후 npm start로 실행해 주세요.</small></div>`;
});
