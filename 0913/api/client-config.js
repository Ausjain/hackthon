'use strict';

module.exports = function handler(request, response) {
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET');
    return response.status(405).json({ error: 'Method not allowed' });
  }

  response.setHeader('Cache-Control', 'no-store');
  return response.status(200).json({
    googleMapsBrowserKey: process.env.GOOGLE_MAPS_BROWSER_KEY || '',
    firebaseConfig: {
      apiKey:            process.env.FIREBASE_API_KEY || '',
      authDomain:        process.env.FIREBASE_AUTH_DOMAIN || '',
      projectId:         process.env.FIREBASE_PROJECT_ID || '',
      storageBucket:     process.env.FIREBASE_STORAGE_BUCKET || '',
      messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || '',
      appId:             process.env.FIREBASE_APP_ID || ''
    }
  });
};
