'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const APP_CONFIG = require('./config.js');

loadEnv(path.join(__dirname, '.env'));

const PORT = Number(process.env.PORT) || 4173;
const GOOGLE_PLACES_API_KEY = process.env.GOOGLE_PLACES_API_KEY || '';
const GOOGLE_MAPS_BROWSER_KEY = process.env.GOOGLE_MAPS_BROWSER_KEY || '';
const FIREBASE_CONFIG = {
  apiKey:            process.env.FIREBASE_API_KEY || '',
  authDomain:        process.env.FIREBASE_AUTH_DOMAIN || '',
  projectId:         process.env.FIREBASE_PROJECT_ID || '',
  storageBucket:     process.env.FIREBASE_STORAGE_BUCKET || '',
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || '',
  appId:             process.env.FIREBASE_APP_ID || ''
};
const GOOGLE_PLACES_URL = 'https://places.googleapis.com/v1/places:searchText';
const MAX_BODY_BYTES = 8 * 1024;
const mimeTypes = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8', '.json':'application/json; charset=utf-8', '.svg':'image/svg+xml' };

function loadEnv(filePath) {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const separator = trimmed.indexOf('=');
    if (separator < 1) continue;
    const key = trimmed.slice(0, separator).trim();
    let value = trimmed.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    if (!(key in process.env)) process.env[key] = value;
  }
}

function sendJson(response, status, payload) {
  response.writeHead(status, { 'Content-Type':'application/json; charset=utf-8', 'Cache-Control':'no-store' });
  response.end(JSON.stringify(payload));
}

function readJson(request) {
  return new Promise((resolve, reject) => {
    let body = '';
    request.on('data', chunk => {
      body += chunk;
      if (Buffer.byteLength(body) > MAX_BODY_BYTES) reject(new Error('Request body too large'));
    });
    request.on('end', () => { try { resolve(JSON.parse(body || '{}')); } catch (error) { reject(error); } });
    request.on('error', reject);
  });
}

function insideRegion(location) {
  const { bounds } = APP_CONFIG.region;
  return location.latitude >= bounds.south && location.latitude <= bounds.north && location.longitude >= bounds.west && location.longitude <= bounds.east;
}

async function searchPlaces(request, response) {
  if (!GOOGLE_PLACES_API_KEY) return sendJson(response, 503, { error:'GOOGLE_PLACES_API_KEY가 설정되지 않았습니다.' });
  try {
    const { query } = await readJson(request);
    if (typeof query !== 'string' || query.trim().length < 2 || query.length > 80) return sendJson(response, 400, { error:'검색어는 2~80자로 입력해 주세요.' });
    const { region, search } = APP_CONFIG;
    const googleResponse = await fetch(GOOGLE_PLACES_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': GOOGLE_PLACES_API_KEY,
        'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.location'
      },
      body: JSON.stringify({
        textQuery: `${query.trim()}, ${region.searchQuerySuffix}`,
        languageCode: search.language,
        regionCode: search.regionCode,
        pageSize: Math.min(search.requestLimit, 20),
        locationRestriction: { rectangle: {
          low: { latitude:region.bounds.south, longitude:region.bounds.west },
          high: { latitude:region.bounds.north, longitude:region.bounds.east }
        } }
      })
    });
    const data = await googleResponse.json();
    if (!googleResponse.ok) return sendJson(response, googleResponse.status, { error:data.error?.message || 'Google Places 검색에 실패했습니다.' });
    const places = (data.places || []).filter(place => place.location && insideRegion(place.location)).slice(0, search.displayLimit).map(place => ({
      placeId: place.id,
      name: place.displayName?.text || place.formattedAddress,
      address: place.formattedAddress || '',
      lat: place.location.latitude,
      lng: place.location.longitude
    }));
    return sendJson(response, 200, { places });
  } catch (_) {
    return sendJson(response, 500, { error:'장소 검색 처리 중 오류가 발생했습니다.' });
  }
}

function serveStatic(request, response) {
  const requestPath = new URL(request.url, `http://${request.headers.host}`).pathname;
  const relativePath = requestPath === '/' ? 'index.html' : decodeURIComponent(requestPath).replace(/^\/+/, '');
  const root = path.resolve(__dirname);
  const filePath = path.resolve(root, relativePath);
  if (filePath !== path.join(root, 'index.html') && !filePath.startsWith(`${root}${path.sep}`)) return sendJson(response, 403, { error:'Forbidden' });
  fs.readFile(filePath, (error, content) => {
    if (error) return sendJson(response, error.code === 'ENOENT' ? 404 : 500, { error:'File not found' });
    response.writeHead(200, { 'Content-Type':mimeTypes[path.extname(filePath)] || 'application/octet-stream' });
    if (request.method === 'HEAD') return response.end();
    response.end(content);
  });
}

const server = http.createServer((request, response) => {
  if (request.method === 'GET' && request.url === '/api/client-config') return sendJson(response, 200, { googleMapsBrowserKey:GOOGLE_MAPS_BROWSER_KEY, firebaseConfig:FIREBASE_CONFIG });
  if (request.method === 'POST' && request.url === '/api/places/search-text') return searchPlaces(request, response);
  if (request.method === 'GET' || request.method === 'HEAD') return serveStatic(request, response);
  return sendJson(response, 405, { error:'Method not allowed' });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`여행 장소 지도가 http://127.0.0.1:${PORT} 에서 실행 중입니다.`);
  if (!GOOGLE_PLACES_API_KEY || !GOOGLE_MAPS_BROWSER_KEY) console.warn('.env에 Google Maps Platform API 키를 설정해 주세요.');
});
