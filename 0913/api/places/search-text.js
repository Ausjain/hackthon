'use strict';

const APP_CONFIG = require('../../config.js');
const GOOGLE_PLACES_URL = 'https://places.googleapis.com/v1/places:searchText';

function insideRegion(location) {
  const bounds = APP_CONFIG.region.bounds;
  return location.latitude >= bounds.south && location.latitude <= bounds.north
    && location.longitude >= bounds.west && location.longitude <= bounds.east;
}

function sendError(response, status, message) {
  return response.status(status).json({ error: message });
}

module.exports = async function handler(request, response) {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    return sendError(response, 405, 'Method not allowed');
  }
  response.setHeader('Cache-Control', 'no-store');
  const apiKey = process.env.GOOGLE_PLACES_API_KEY || '';
  if (!apiKey) return sendError(response, 503, 'GOOGLE_PLACES_API_KEY가 설정되지 않았습니다.');
  return handleSearch(request, response, apiKey);
};

async function handleSearch(request, response, apiKey) {
  try {
    const body = typeof request.body === 'string' ? JSON.parse(request.body || '{}') : (request.body || {});
    const query = body.query;
    if (typeof query !== 'string' || query.trim().length < 2 || query.length > 80) {
      return sendError(response, 400, '검색어는 2~80자로 입력해 주세요.');
    }
    const googleResponse = await callGooglePlaces(query.trim(), apiKey);
    const data = await googleResponse.json();
    if (!googleResponse.ok) {
      return sendError(response, googleResponse.status, data.error?.message || 'Google Places 검색에 실패했습니다.');
    }
    return response.status(200).json({ places: normalizePlaces(data.places || []) });
  } catch (error) {
    return sendError(response, 500, '장소 검색 처리 중 오류가 발생했습니다.');
  }
}

function callGooglePlaces(query, apiKey) {
  const { region, search } = APP_CONFIG;
  return fetch(GOOGLE_PLACES_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.location'
    },
    body: JSON.stringify({
      textQuery: `${query}, ${region.searchQuerySuffix}`,
      languageCode: search.language,
      regionCode: search.regionCode,
      pageSize: Math.min(search.requestLimit, 20),
      locationRestriction: {
        rectangle: {
          low: { latitude: region.bounds.south, longitude: region.bounds.west },
          high: { latitude: region.bounds.north, longitude: region.bounds.east }
        }
      }
    })
  });
}

function normalizePlaces(rawPlaces) {
  return rawPlaces
    .filter(place => place.location && insideRegion(place.location))
    .slice(0, APP_CONFIG.search.displayLimit)
    .map(place => ({
      placeId: place.id,
      name: place.displayName?.text || place.formattedAddress,
      address: place.formattedAddress || '',
      lat: place.location.latitude,
      lng: place.location.longitude
    }));
}
