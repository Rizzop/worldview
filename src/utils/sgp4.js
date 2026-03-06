/**
 * SGP4 Orbit Propagator Wrapper
 * Wraps satellite.js library to compute satellite position from TLE data.
 * Given TLE strings and a timestamp, returns lat/lon/alt.
 */

// Use satellite.js from global scope (loaded via CDN in index.html)
// In Node.js, it may be available via require/import or globalThis
const satellite = (typeof window !== 'undefined' && window.satellite) ||
                  (typeof globalThis !== 'undefined' && globalThis.satellite) ||
                  null;

/**
 * Propagate a satellite position from TLE data at a given time
 *
 * @param {string} line1 - First line of TLE data
 * @param {string} line2 - Second line of TLE data
 * @param {Date} date - JavaScript Date object for the propagation time
 * @returns {Object|null} Position as { lat, lon, alt } in degrees and km, or null on error
 *   lat: latitude in degrees (-90 to 90)
 *   lon: longitude in degrees (-180 to 180)
 *   alt: altitude in kilometers above Earth's surface
 */
export function propagateTLE(line1, line2, date) {
  // Check if satellite.js is available
  if (!satellite) {
    throw new Error('satellite.js library not loaded');
  }

  // Validate inputs
  if (!line1 || !line2 || typeof line1 !== 'string' || typeof line2 !== 'string') {
    throw new Error('Invalid TLE: line1 and line2 must be non-empty strings');
  }

  if (!(date instanceof Date) || isNaN(date.getTime())) {
    throw new Error('Invalid date: must be a valid Date object');
  }

  // Parse the TLE data
  let satrec;
  try {
    satrec = satellite.twoline2satrec(line1, line2);
  } catch (e) {
    throw new Error(`Failed to parse TLE: ${e.message}`);
  }

  // Check for TLE parsing errors
  if (!satrec || satrec.error !== 0) {
    const errorCode = satrec ? satrec.error : 'unknown';
    throw new Error(`TLE parsing error (code: ${errorCode})`);
  }

  // Propagate the satellite position to the given date
  const positionAndVelocity = satellite.propagate(satrec, date);

  // Check if propagation failed
  if (!positionAndVelocity || !positionAndVelocity.position) {
    return null;
  }

  const positionEci = positionAndVelocity.position;

  // Check for invalid position (can happen with bad TLE or date far from epoch)
  if (typeof positionEci.x !== 'number' || isNaN(positionEci.x)) {
    return null;
  }

  // Calculate GMST (Greenwich Mean Sidereal Time)
  const gmst = satellite.gstime(date);

  // Convert ECI position to geodetic coordinates
  const positionGd = satellite.eciToGeodetic(positionEci, gmst);

  // Convert to degrees and return
  const lat = satellite.degreesLat(positionGd.latitude);
  const lon = satellite.degreesLong(positionGd.longitude);
  const alt = positionGd.height; // Already in km

  return {
    lat,
    lon,
    alt
  };
}
