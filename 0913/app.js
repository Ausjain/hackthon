(async () => {
  'use strict';

  const config = window.APP_CONFIG;
  if (!config?.region?.center || !config?.region?.bounds) throw new Error('config.js에 유효한 지역 설정이 필요합니다.');
  const { app: appConfig, region, map: mapConfig, search: searchConfig } = config;
  const STORAGE_KEY = `${appConfig.storageKeyPrefix}:${region.id}`;
  const MIGRATED_KEY = `${STORAGE_KEY}:firestore-migrated`;
  const CLIENT_ID_STORAGE_KEY = 'place-voice-map-client-id-v1';
  const FIRESTORE_COLLECTION = `${region.id}-places`;
  const interactionModel = window.INTERACTION_MODEL;
  const clientId = getOrCreateClientId();

  // ── 클라이언트 설정 로딩 (Maps 키 + Firebase 설정) ──────────────────────
  const clientConfigResponse = await fetch('/api/client-config');
  if (!clientConfigResponse.ok) throw new Error('지도 설정을 불러오지 못했습니다.');
  const clientConfigData = await clientConfigResponse.json();
  const { googleMapsBrowserKey, firebaseConfig } = clientConfigData;
  if (!googleMapsBrowserKey) throw new Error('.env에 GOOGLE_MAPS_BROWSER_KEY를 설정해 주세요.');
  if (!firebaseConfig?.projectId) throw new Error('.env에 FIREBASE_PROJECT_ID 등 Firebase 설정을 추가해 주세요.');

  // ── Firebase / Firestore 초기화 (CDN ESM) ───────────────────────────────
  const { initializeApp } = await import('https://www.gstatic.com/firebasejs/11.4.0/firebase-app.js');
  const {
    getFirestore, collection, doc,
    setDoc, onSnapshot, getDocs, runTransaction
  } = await import('https://www.gstatic.com/firebasejs/11.4.0/firebase-firestore.js');

  const firebaseApp = initializeApp(firebaseConfig);
  const db = getFirestore(firebaseApp);
  const placesCol = collection(db, FIRESTORE_COLLECTION);

  applyRegionConfig();

  // ── Google Maps 로딩 ─────────────────────────────────────────────────────
  await loadGoogleMaps(googleMapsBrowserKey);

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
  infoWindow.addListener('closeclick', () => { openedPlaceId = null; });
  const pinModal = document.querySelector('#pinModal');
  const pinForm = document.querySelector('#pinForm');
  const opinion = document.querySelector('#opinion');
  let selectedLatLng = null;
  let selectedPlaceId = null;
  let places = [];           // Firestore 실시간 구독으로 채워짐
  let pinMarkers = [];
  let searchMarker = null;
  let openedPlaceId = null;
  let toastTimer;
  let searchTimer;
  let searchController;
  let lastSearchRequestAt = 0;

  // ── 헬퍼 ─────────────────────────────────────────────────────────────────
  function getOrCreateClientId() {
    let id = localStorage.getItem(CLIENT_ID_STORAGE_KEY);
    if (!id) {
      id = crypto.randomUUID ? crypto.randomUUID() : `client-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      localStorage.setItem(CLIENT_ID_STORAGE_KEY, id);
    }
    return id;
  }

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

  async function loadGoogleMaps(key) {
    await new Promise((resolve, reject) => {
      window.__initTravelMap = resolve;
      const script = document.createElement('script');
      script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&callback=__initTravelMap&v=weekly&language=${encodeURIComponent(searchConfig.language)}&region=${encodeURIComponent(searchConfig.regionCode)}`;
      script.async = true;
      script.onerror = () => reject(new Error('Google 지도를 불러오지 못했습니다.'));
      document.head.append(script);
    });
    delete window.__initTravelMap;
  }

  function createId(suffix = '') {
    const id = crypto.randomUUID ? crypto.randomUUID() : String(Date.now());
    return suffix ? `${id}-${suffix}` : id;
  }

  function insideRegion(position) {
    const { lat, lng } = position;
    return lat >= region.bounds.south && lat <= region.bounds.north && lng >= region.bounds.west && lng <= region.bounds.east;
  }

  function normalizePlace(data, id) {
    const oldOpinions = Array.isArray(data.opinions)
      ? data.opinions
      : [{ id:`${id}-opinion`, text:data.opinion || '', category:data.category, createdAt:data.createdAt || null }];
    return interactionModel.ensurePlaceState({
      id,
      placeId:data.placeId || data.sourcePlaceId || null,
      lat:data.lat,
      lng:data.lng,
      placeName:data.placeName,
      reactions:data.reactions || {
        like:oldOpinions.filter(item => item.category === '좋아요').length,
        dislike:oldOpinions.filter(item => item.category === '불편해요').length
      },
      reactionClients:data.reactionClients || {},
      comments:Array.isArray(data.comments) ? data.comments : oldOpinions.filter(item => item.text?.trim()).map(item => ({
        id:item.id,
        text:item.text.trim(),
        createdAt:item.createdAt || null
      }))
    });
  }

  // ── Firestore 쓰기 ────────────────────────────────────────────────────────
  function placeData(place) {
    return {
      placeId:place.placeId || null,
      lat:Number(place.lat),
      lng:Number(place.lng),
      placeName:place.placeName,
      reactions:place.reactions,
      reactionClients:place.reactionClients,
      comments:place.comments
    };
  }

  async function savePlace(place) {
    try {
      await setDoc(doc(placesCol, place.id), placeData(place));
      return true;
    } catch (err) {
      console.error('Firestore 저장 실패:', err);
      showToast('저장 중 오류가 발생했습니다.');
      return false;
    }
  }

  async function updatePlaceInteraction(placeId, mutate) {
    try {
      let result;
      await runTransaction(db, async transaction => {
        const reference = doc(placesCol, placeId);
        const snapshot = await transaction.get(reference);
        if (!snapshot.exists()) throw new Error('장소를 찾을 수 없습니다.');
        const freshPlace = normalizePlace(snapshot.data(), snapshot.id);
        result = mutate(freshPlace);
        if (result?.changed === false || result?.ok === false) return;
        transaction.update(reference, {
          reactions:freshPlace.reactions,
          reactionClients:freshPlace.reactionClients,
          comments:freshPlace.comments
        });
      });
      return result;
    } catch (err) {
      console.error('Firestore 상호작용 저장 실패:', err);
      showToast('저장 중 오류가 발생했습니다.');
      return { ok:false, changed:false, reason:'error' };
    }
  }

  // ── localStorage → Firestore 마이그레이션 (최초 1회) ──────────────────────
  async function migrateLocalStorageIfNeeded() {
    if (localStorage.getItem(MIGRATED_KEY)) return;   // 이미 이전 완료
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) { localStorage.setItem(MIGRATED_KEY, '1'); return; }
    let localPlaces;
    try { localPlaces = JSON.parse(raw); } catch (_) { localStorage.setItem(MIGRATED_KEY, '1'); return; }
    if (!Array.isArray(localPlaces) || localPlaces.length === 0) { localStorage.setItem(MIGRATED_KEY, '1'); return; }

    const snapshot = await getDocs(placesCol);
    const remotePlaces = snapshot.docs.map(item => normalizePlace(item.data(), item.id));
    try {
      for (const rawPlace of localPlaces) {
        const localPlace = normalizePlace(rawPlace, rawPlace.id || createId());
        const matchingRemote = remotePlaces.find(remote =>
          (localPlace.placeId && remote.placeId === localPlace.placeId) || remote.id === localPlace.id
        );
        const targetId = matchingRemote?.id || localPlace.id;
        await runTransaction(db, async transaction => {
          const reference = doc(placesCol, targetId);
          const currentSnapshot = await transaction.get(reference);
          if (!currentSnapshot.exists()) {
            transaction.set(reference, placeData({ ...localPlace, id:targetId }));
            return;
          }
          const current = normalizePlace(currentSnapshot.data(), targetId);
          const knownComments = new Set(current.comments.map(comment =>
            comment.id || `${comment.clientId || ''}:${interactionModel.normalizeCommentText(comment.text)}`
          ));
          localPlace.comments.forEach(comment => {
            const key = comment.id || `${comment.clientId || ''}:${interactionModel.normalizeCommentText(comment.text)}`;
            if (!knownComments.has(key)) {
              current.comments.push(comment);
              knownComments.add(key);
            }
          });
          Object.entries(localPlace.reactionClients).forEach(([ownerId, reaction]) => {
            if (!current.reactionClients[ownerId] && ['like', 'dislike'].includes(reaction)) {
              current.reactionClients[ownerId] = reaction;
              current.reactions[reaction] += 1;
            }
          });
          transaction.set(reference, placeData(current));
        });
      }
      localStorage.setItem(MIGRATED_KEY, '1');
      showToast('기존 데이터를 공유 지도로 옮겼어요!');
    } catch (err) {
      console.error('마이그레이션 실패:', err);
    }
  }

  // ── 핀 렌더링 ─────────────────────────────────────────────────────────────
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

  // ── 장소 상세 팝업 ────────────────────────────────────────────────────────
  function openPlaceDetail(place, marker) {
    openedPlaceId = place.id;
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
        const item = document.createElement('div');
        const text = document.createElement('p');
        item.className = 'comment-item';
        text.textContent = comment.text;
        item.append(text);
        if (comment.clientId === clientId) {
          const deleteButton = document.createElement('button');
          deleteButton.type = 'button';
          deleteButton.className = 'comment-delete';
          deleteButton.textContent = '삭제';
          deleteButton.addEventListener('click', async () => {
            if (!window.confirm('이 댓글을 삭제할까요?')) return;
            await updatePlaceInteraction(place.id, freshPlace => ({
              ok:interactionModel.deleteOwnComment(freshPlace, comment.id, clientId)
            }));
          });
          item.append(deleteButton);
        }
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
    commentForm.addEventListener('submit', async event => {
      event.preventDefault();
      const text = commentInput.value.trim();
      if (!text) return;
      const result = await updatePlaceInteraction(place.id, freshPlace => interactionModel.addComment(freshPlace, {
        id:createId('comment'),
        text,
        clientId,
        createdAt:new Date().toISOString()
      }));
      if (!result.ok && result.reason === 'duplicate') {
        showToast('같은 댓글은 한 번만 등록할 수 있어요.');
        return;
      }
    });
    infoWindow.setContent(content);
    infoWindow.open({ map, anchor:marker });

    function createReactionButton(icon, label, count, reactionKey) {
      const button = document.createElement('button');
      const selected = place.reactionClients?.[clientId] === reactionKey;
      button.type = 'button';
      button.className = `reaction-button ${reactionKey}${selected ? ' selected' : ''}`;
      button.setAttribute('aria-pressed', String(selected));
      button.textContent = `${icon} ${label} ${count}`;
      button.addEventListener('click', async () => {
        await updatePlaceInteraction(place.id, freshPlace => interactionModel.toggleReaction(freshPlace, clientId, reactionKey));
      });
      button.addEventListener('contextmenu', async event => {
        event.preventDefault();
        await updatePlaceInteraction(place.id, freshPlace => interactionModel.toggleReaction(freshPlace, clientId, reactionKey, true));
      });
      return button;
    }
  }

  // ── 핀 추가 모달 ──────────────────────────────────────────────────────────
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

  // ── 검색 ─────────────────────────────────────────────────────────────────
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
    openedPlaceId = null;
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

  // ── 지도 / 폼 이벤트 ─────────────────────────────────────────────────────
  map.addListener('click', event => {
    openedPlaceId = null;
    const location = event.latLng.toJSON();
    if (!insideRegion(location)) return showToast(`${region.name} 안의 장소를 선택해 주세요.`);
    openModal(location);
  });

  pinForm.addEventListener('submit', async event => {
    event.preventDefault();
    if (!selectedLatLng) return;
    const firstComment = opinion.value.trim();
    const existingPlace = selectedPlaceId ? places.find(place => place.placeId === selectedPlaceId) : null;

    if (existingPlace) {
      existingPlace.placeName = document.querySelector('#placeName').value.trim();
      existingPlace.lat = selectedLatLng.lat;
      existingPlace.lng = selectedLatLng.lng;
      if (firstComment) {
        interactionModel.addComment(existingPlace, { id:createId('comment'), text:firstComment, clientId, createdAt:new Date().toISOString() });
      }
      const saved = await savePlace(existingPlace);
      if (!saved) return;
      closeModal();
      showToast('장소가 업데이트되었어요!');
    } else {
      const newPlace = {
        id: createId(),
        placeId: selectedPlaceId,
        lat: selectedLatLng.lat,
        lng: selectedLatLng.lng,
        placeName: document.querySelector('#placeName').value.trim(),
        reactions: { like:0, dislike:0 },
        reactionClients: {},
        comments: firstComment ? [{ id:createId('comment'), text:firstComment, clientId, createdAt:new Date().toISOString() }] : []
      };
      const saved = await savePlace(newPlace);
      if (!saved) return;
      closeModal();
      showToast('지도에 장소가 추가되었어요!');
    }
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

  // ── localStorage 마이그레이션 후 Firestore 실시간 구독 시작 ──────────────
  await migrateLocalStorageIfNeeded();

  onSnapshot(placesCol, snapshot => {
    places = snapshot.docs.map(d => normalizePlace(d.data(), d.id));
    renderPins();

    if (openedPlaceId && infoWindow.getMap()) {
      const freshPlace = places.find(place => place.id === openedPlaceId);
      const freshMarker = pinMarkers.find(marker => marker.placeRecordId === openedPlaceId);
      if (freshPlace && freshMarker) openPlaceDetail(freshPlace, freshMarker);
    }
  }, err => {
    console.error('Firestore 구독 오류:', err);
    showToast('실시간 연결에 문제가 생겼어요. 새로고침해 주세요.');
  });

})().catch(error => {
  console.error(error);
  const mapElement = document.querySelector('#map');
  mapElement.innerHTML = `<div class="map-load-error"><strong>지도를 시작할 수 없습니다.</strong><span>${error.message}</span><small>로컬 .env 또는 Vercel 환경변수 설정을 확인해 주세요.</small></div>`;
});
