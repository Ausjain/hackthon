'use strict';

module.exports = function handler(request, response) {
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET');
    return response.status(405).json({ error: 'Method not allowed' });
  }

  response.setHeader('Cache-Control', 'no-store');
  return response.status(200).json({
    googleMapsBrowserKey: process.env.GOOGLE_MAPS_BROWSER_KEY || ''
  });
};
