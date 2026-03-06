// Configuration file for WorldView
// Copy this file to config.js and fill in your API keys

export const config = {
  // Cesium Ion Access Token
  // Get your token from: https://ion.cesium.com/tokens
  // Used as CESIUM_ION_TOKEN by globe.js
  CESIUM_ION_TOKEN: 'YOUR_CESIUM_ION_ACCESS_TOKEN_HERE',

  // N2YO API Key (for satellite tracking data)
  // Get your key from: https://www.n2yo.com/api/
  n2yoApiKey: 'YOUR_N2YO_API_KEY_HERE',

  // Space-Track.org credentials (for TLE data)
  // Register at: https://www.space-track.org/auth/createAccount
  spaceTrackUsername: 'YOUR_SPACE_TRACK_USERNAME_HERE',
  spaceTrackPassword: 'YOUR_SPACE_TRACK_PASSWORD_HERE',

  // Refresh rates (in milliseconds)
  refreshRates: {
    // How often to update satellite positions
    satellitePositionUpdate: 1000, // 1 second

    // How often to fetch new TLE data
    tleFetch: 3600000, // 1 hour

    // How often to update satellite visibility
    visibilityUpdate: 5000, // 5 seconds

    // How often to update ground station tracking
    groundStationUpdate: 2000 // 2 seconds
  },

  // Default view settings
  view: {
    // Default camera position
    defaultLatitude: 0,
    defaultLongitude: 0,
    defaultHeight: 20000000, // meters above surface

    // Field of view
    fov: 60 // degrees
  },

  // Satellite filtering
  satellites: {
    // Maximum number of satellites to display
    maxDisplayed: 1000,

    // Minimum elevation for visibility (degrees)
    minElevation: 10,

    // Default satellite categories to show
    defaultCategories: [
      'active',
      'weather',
      'communications',
      'navigation',
      'science'
    ]
  }
};

export default config;
