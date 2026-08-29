// Google Places proxy. The Places API key lives server-side only; the browser
// never sees it. All callers get a normalized result set and a `configured`
// flag so the UI can degrade to plain text when no key is set.

const KEY = process.env.GOOGLE_PLACES_API_KEY || '';
export const PLACES_CONFIGURED = !!KEY;

const ATS = 'https://maps.googleapis.com/maps/api/place';

async function gmap(url) {
  let res;
  try {
    res = await fetch(url);
  } catch (e) {
    return { error: `Place search network error: ${e.message}` };
  }
  if (!res.ok) {
    const detail = (await res.text()).slice(0, 200);
    return { error: `Place search failed (${res.status}): ${detail}` };
  }
  return res.json();
}

function normPrediction(p) {
  const fmt = p.structured_formatting || {};
  return {
    placeId: p.place_id,
    name: fmt.main_text || p.description || '',
    address: fmt.secondary_text || '',
  };
}

function normPlace(pl) {
  return {
    placeId: pl.place_id,
    name: pl.name || '',
    address: pl.formatted_address || pl.vicinity || '',
    lat: pl.geometry?.location?.lat ?? null,
    lng: pl.geometry?.location?.lng ?? null,
  };
}

// Place Autocomplete: search any POI (tennis courts, clubs, venues...).
export async function searchPlaces(q) {
  if (!KEY) return { configured: false, results: [] };
  const input = String(q || '').trim();
  if (!input) return { configured: true, results: [] };
  const data = await gmap(
    `${ATS}/autocomplete/json?input=${encodeURIComponent(input)}&types=establishment&key=${KEY}`
  );
  if (data.error) return { configured: true, error: data.error, results: [] };
  return {
    configured: true,
    results: (data.predictions || []).slice(0, 6).map(normPrediction),
  };
}

// Nearby courts: POIs near a latitude/longitude whose name/content matches the
// sport (defaults to tennis courts).
export async function nearbyCourts(lat, lng, q) {
  if (!KEY) return { configured: false, results: [] };
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return { configured: true, error: 'A valid location is required', results: [] };
  }
  const keyword = String(q || 'tennis court').trim() || 'tennis court';
  const data = await gmap(
    `${ATS}/nearbysearch/json?location=${lat},${lng}&radius=8000&keyword=${encodeURIComponent(keyword)}&key=${KEY}`
  );
  if (data.error) return { configured: true, error: data.error, results: [] };
  return {
    configured: true,
    results: (data.results || []).slice(0, 7).map(normPlace),
  };
}

// Resolve a selected autocomplete prediction into name + address + coordinates
// (coordinates only come from the Details endpoint or nearby search).
export async function placeDetails(placeId) {
  if (!KEY) return { configured: false, place: null };
  const data = await gmap(
    `${ATS}/details/json?placeid=${encodeURIComponent(placeId)}&fields=name,formatted_address,geometry&key=${KEY}`
  );
  if (data.error || !data.result) {
    return { configured: true, error: data.error || 'Place not found', place: null };
  }
  return { configured: true, place: normPlace(data.result) };
}

// "View on map" link that works with either coords or name+address text.
export function mapQueryLink(place) {
  if (!place) return null;
  const { name = '', address = '', lat, lng } = place;
  const q = Number.isFinite(lat) && Number.isFinite(lng) ? `${lat},${lng}` : `${name} ${address}`.trim() || name;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
}