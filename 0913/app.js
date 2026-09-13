(() => {
  'use strict';

  const GUHYEON_SCHOOL_CENTER = [37.60979, 126.90571];
  const INITIAL_ZOOM = 17;
  const EUNPYEONG_BOUNDS = L.latLngBounds([37.5705, 126.8700], [37.6650, 126.9695]);
  const STORAGE_KEY = 'eunpyeong-voice-map-pins-v1';
  const NOMINATIM_ENDPOINT = 'https://nominatim.openstreetmap.org/search';
  const SEARCH_DELAY_MS = 500;
  const MIN_REQUEST_INTERVAL_MS = 1100;
  const categoryMeta = {
    '좋아요': { className: 'like', symbol: '♥', countId: 'likeCount' },
    '불편해요': { className: 'inconvenient', symbol: '!', countId: 'inconvenientCount' },
    '추천해요': { className: 'recommend', symbol: '★', countId: 'recommendCount' },
    '바뀌었으면 해요': { className: 'change', symbol: '↻', countId: 'changeCount' }
  };

  const map = L.map('map', {
    center: GUHYEON_SCHOOL_CENTER,
    zoom: INITIAL_ZOOM,
    minZoom: 13,
    maxZoom: 19,
    maxBounds: EUNPYEONG_BOUNDS.pad(0.12),
    maxBoundsViscosity: 1,
    zoomControl: true
  });

  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
  }).addTo(map);

  map.setView(GUHYEON_SCHOOL_CENTER, INITIAL_ZOOM);

  const pinModal = document.querySelector('#pinModal');
  const pinForm = document.querySelector('#pinForm');
  const opinion = document.querySelector('#opinion');
  const markersLayer = L.layerGroup().addTo(map);
  let selectedLatLng = null;
  let activeCategory = '전체';
  let pins = loadPins();
  let toastTimer;
  let searchTimer;
  let searchController;
  let lastSearchRequestAt = 0;
  let searchMarker = null;
  const searchCache = new Map();

  function loadPins() {
    try {
      const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      return Array.isArray(value) ? value : [];
    } catch (_) {
      return [];
    }
  }

  function savePins() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(pins));
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>'"]/g, character => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' })[character]);
  }

  function markerIcon(category) {
    const meta = categoryMeta[category];
    return L.divIcon({
      className: 'custom-marker',
      html: `<div class="marker-pin marker-${meta.className}"><span>${meta.symbol}</span></div>`,
      iconSize: [38, 45],
      iconAnchor: [19, 42],
      popupAnchor: [0, -38]
    });
  }

  function renderPins() {
    markersLayer.clearLayers();
    pins.filter(pin => activeCategory === '전체' || pin.category === activeCategory).forEach(pin => {
      L.marker([pin.lat, pin.lng], { icon: markerIcon(pin.category), title: pin.placeName })
        .bindPopup(`<span class="popup-category">${escapeHtml(pin.category)}</span><h3 class="popup-place">${escapeHtml(pin.placeName)}</h3><p class="popup-opinion">${escapeHtml(pin.opinion)}</p>`, { className: 'pin-popup' })
        .addTo(markersLayer);
    });
    updateCounts();
  }

  function updateCounts() {
    document.querySelector('#pinCount').textContent = pins.length;
    document.querySelector('#allCount').textContent = pins.length;
    Object.entries(categoryMeta).forEach(([category, meta]) => {
      document.querySelector(`#${meta.countId}`).textContent = pins.filter(pin => pin.category === category).length;
    });
  }

  function openModal(latlng, suggestedPlaceName = '') {
    selectedLatLng = latlng;
    document.querySelector('#selectedCoordinates').textContent = `위도 ${latlng.lat.toFixed(5)} · 경도 ${latlng.lng.toFixed(5)}`;
    pinModal.hidden = false;
    document.body.classList.add('modal-open');
    document.querySelector('#placeName').value = suggestedPlaceName;
    setTimeout(() => document.querySelector('#placeName').focus(), 50);
  }

  function closeModal() {
    pinModal.hidden = true;
    document.body.classList.remove('modal-open');
    pinForm.reset();
    document.querySelector('#charCount').textContent = '0';
    selectedLatLng = null;
  }

  function showToast(message) {
    const toast = document.querySelector('#toast');
    toast.textContent = message;
    toast.classList.add('visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('visible'), 2200);
  }

  function resultIsInEunpyeong(result) {
    const location = L.latLng(Number(result.lat), Number(result.lon));
    const addressText = `${result.display_name || ''} ${Object.values(result.address || {}).join(' ')}`;
    return EUNPYEONG_BOUNDS.contains(location) && /은평구|Eunpyeong/i.test(addressText);
  }

  function resultTitle(result) {
    const address = result.address || {};
    return address.amenity || address.building || address.shop || address.tourism || address.road || result.name || result.display_name.split(',')[0];
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
        button.type = 'button';
        button.className = 'search-result';
        const title = document.createElement('strong');
        const address = document.createElement('small');
        title.textContent = resultTitle(result);
        address.textContent = result.display_name;
        button.append(title, address);
        button.addEventListener('click', () => selectSearchResult(result));
        container.append(button);
      });
    }
    const attribution = document.createElement('div');
    attribution.className = 'search-attribution';
    attribution.innerHTML = '검색 데이터 © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors';
    container.append(attribution);
    container.hidden = false;
  }

  async function runPlaceSearch(query) {
    const normalizedQuery = query.trim().toLocaleLowerCase('ko-KR');
    if (normalizedQuery.length < 2) {
      renderSearchResults([], '두 글자 이상 입력해 주세요.');
      return;
    }
    if (searchCache.has(normalizedQuery)) {
      const cached = searchCache.get(normalizedQuery);
      renderSearchResults(cached, cached.length ? '' : '은평구 안에서 검색 결과를 찾지 못했어요.');
      return;
    }

    const submitButton = document.querySelector('.search-submit');
    submitButton.disabled = true;
    submitButton.textContent = '검색 중';
    searchController?.abort();
    const controller = new AbortController();
    searchController = controller;
    const elapsed = Date.now() - lastSearchRequestAt;
    if (elapsed < MIN_REQUEST_INTERVAL_MS) await new Promise(resolve => setTimeout(resolve, MIN_REQUEST_INTERVAL_MS - elapsed));

    const params = new URLSearchParams({
      q: `${query.trim()}, 은평구, 서울특별시`,
      format: 'jsonv2',
      addressdetails: '1',
      namedetails: '1',
      limit: '8',
      countrycodes: 'kr',
      'accept-language': 'ko',
      viewbox: '126.8700,37.6650,126.9695,37.5705',
      bounded: '1'
    });

    try {
      lastSearchRequestAt = Date.now();
      if (controller.signal.aborted) return;
      const response = await fetch(`${NOMINATIM_ENDPOINT}?${params}`, { signal: controller.signal });
      if (!response.ok) throw new Error(`Search failed: ${response.status}`);
      const data = await response.json();
      const results = data.filter(resultIsInEunpyeong).slice(0, 5);
      searchCache.set(normalizedQuery, results);
      renderSearchResults(results, results.length ? '' : '은평구 안에서 검색 결과를 찾지 못했어요.');
    } catch (error) {
      if (error.name !== 'AbortError') renderSearchResults([], '검색 서비스에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.');
    } finally {
      if (searchController === controller) {
        submitButton.disabled = false;
        submitButton.textContent = '검색';
      }
    }
  }

  function schedulePlaceSearch(query) {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => runPlaceSearch(query), SEARCH_DELAY_MS);
  }

  function selectSearchResult(result) {
    const location = L.latLng(Number(result.lat), Number(result.lon));
    if (!resultIsInEunpyeong(result)) {
      showToast('은평구 밖의 장소는 선택할 수 없어요.');
      return;
    }
    document.querySelector('#searchResults').hidden = true;
    map.setView(location, 17);
    if (searchMarker) searchMarker.remove();
    searchMarker = L.marker(location, { title: resultTitle(result) }).addTo(map);
    const popupContent = document.createElement('div');
    const title = document.createElement('h3');
    const address = document.createElement('p');
    const addButton = document.createElement('button');
    title.className = 'popup-place';
    title.textContent = resultTitle(result);
    address.className = 'popup-opinion';
    address.textContent = result.display_name;
    addButton.className = 'search-popup-button';
    addButton.type = 'button';
    addButton.textContent = '이 위치에 의견 핀 등록하기';
    addButton.addEventListener('click', () => openModal(location, resultTitle(result)));
    popupContent.append(title, address, addButton);
    searchMarker.bindPopup(popupContent, { className: 'pin-popup' }).openPopup();
  }

  map.on('click', event => {
    if (!EUNPYEONG_BOUNDS.contains(event.latlng)) {
      showToast('은평구 안의 장소를 선택해 주세요.');
      return;
    }
    openModal(event.latlng);
  });

  pinForm.addEventListener('submit', event => {
    event.preventDefault();
    if (!selectedLatLng) return;
    const formData = new FormData(pinForm);
    pins.push({
      id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
      lat: selectedLatLng.lat,
      lng: selectedLatLng.lng,
      placeName: document.querySelector('#placeName').value.trim(),
      opinion: opinion.value.trim(),
      category: formData.get('category')
    });
    savePins();
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
  document.querySelector('#resetViewButton').addEventListener('click', () => map.setView(GUHYEON_SCHOOL_CENTER, INITIAL_ZOOM));
  document.querySelector('#helpButton').addEventListener('click', () => showToast('지도에서 원하는 장소를 클릭해 의견을 등록하세요.'));
  document.querySelector('#searchForm').addEventListener('submit', event => {
    event.preventDefault();
    schedulePlaceSearch(document.querySelector('#searchInput').value);
  });
  document.querySelector('#searchInput').addEventListener('input', event => {
    document.querySelector('#searchClearButton').hidden = !event.target.value;
  });
  document.querySelector('#searchInput').addEventListener('keydown', event => {
    if (event.key === 'Escape') document.querySelector('#searchResults').hidden = true;
  });
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

  function selectCategory(category) {
    activeCategory = category;
    setActiveFilter();
    renderPins();
  }

  function setActiveFilter() {
    document.querySelectorAll('.category-filter').forEach(button => button.classList.toggle('active', button.dataset.category === activeCategory));
  }

  renderPins();
})();
