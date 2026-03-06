/**
 * Coordinate Conversion Utilities
 * Pure math functions for coordinate transformations required by SGP4 orbit propagation.
 * No browser dependencies - works in Node.js.
 */

// WGS84 Earth ellipsoid constants
const EARTH_RADIUS_KM = 6378.137; // Equatorial radius in km
const EARTH_FLATTENING = 1 / 298.257223563;
const EARTH_ECCENTRICITY_SQ = EARTH_FLATTENING * (2 - EARTH_FLATTENING);

/**
 * Convert degrees to radians
 * @param {number} degrees - Angle in degrees
 * @returns {number} Angle in radians
 */
export function degreesToRadians(degrees) {
  return degrees * (Math.PI / 180);
}

/**
 * Convert radians to degrees
 * @param {number} radians - Angle in radians
 * @returns {number} Angle in degrees
 */
export function radiansToDegrees(radians) {
  return radians * (180 / Math.PI);
}

/**
 * Convert ECI (Earth-Centered Inertial) coordinates to geodetic (lat/lon/alt)
 * Uses iterative algorithm for accurate conversion with WGS84 ellipsoid.
 *
 * @param {Object} positionEci - ECI position vector
 * @param {number} positionEci.x - X coordinate in km
 * @param {number} positionEci.y - Y coordinate in km
 * @param {number} positionEci.z - Z coordinate in km
 * @param {number} gmst - Greenwich Mean Sidereal Time in radians
 * @returns {Object} Geodetic coordinates { latitude, longitude, altitude }
 *   latitude and longitude in radians, altitude in km
 */
export function eciToGeodetic(positionEci, gmst) {
  const { x, y, z } = positionEci;

  // Calculate longitude (adjust for Earth rotation via GMST)
  const longitude = Math.atan2(y, x) - gmst;

  // Normalize longitude to [-PI, PI]
  let lonNorm = longitude;
  while (lonNorm > Math.PI) lonNorm -= 2 * Math.PI;
  while (lonNorm < -Math.PI) lonNorm += 2 * Math.PI;

  // Calculate distance from Z-axis
  const p = Math.sqrt(x * x + y * y);

  // Iterative calculation of latitude (accounts for Earth's oblateness)
  let latitude = Math.atan2(z, p);
  let prevLatitude;
  const maxIterations = 10;
  const tolerance = 1e-12;

  for (let i = 0; i < maxIterations; i++) {
    prevLatitude = latitude;
    const sinLat = Math.sin(latitude);
    const N = EARTH_RADIUS_KM / Math.sqrt(1 - EARTH_ECCENTRICITY_SQ * sinLat * sinLat);
    latitude = Math.atan2(z + EARTH_ECCENTRICITY_SQ * N * sinLat, p);

    if (Math.abs(latitude - prevLatitude) < tolerance) {
      break;
    }
  }

  // Calculate altitude
  const sinLat = Math.sin(latitude);
  const cosLat = Math.cos(latitude);
  const N = EARTH_RADIUS_KM / Math.sqrt(1 - EARTH_ECCENTRICITY_SQ * sinLat * sinLat);

  let altitude;
  if (Math.abs(cosLat) > 1e-10) {
    altitude = p / cosLat - N;
  } else {
    // Near poles, use Z component
    altitude = Math.abs(z) / Math.abs(sinLat) - N * (1 - EARTH_ECCENTRICITY_SQ);
  }

  return {
    latitude,
    longitude: lonNorm,
    altitude
  };
}

/**
 * Calculate great-circle distance between two geodetic points using Haversine formula
 *
 * @param {number} lat1 - Latitude of point 1 in radians
 * @param {number} lon1 - Longitude of point 1 in radians
 * @param {number} lat2 - Latitude of point 2 in radians
 * @param {number} lon2 - Longitude of point 2 in radians
 * @returns {number} Distance in kilometers
 */
export function distanceKm(lat1, lon1, lat2, lon2) {
  const dLat = lat2 - lat1;
  const dLon = lon2 - lon1;

  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1) * Math.cos(lat2) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return EARTH_RADIUS_KM * c;
}
