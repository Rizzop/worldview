# WorldView - Global Satellite Tracking Visualization

WorldView is an interactive 3D globe application for real-time satellite tracking and geospatial data visualization. Built with CesiumJS for high-performance WebGL rendering and satellite.js for accurate orbital calculations.

```
    +--------------------------------------------------+
    |                    WorldView                      |
    |                                                  |
    |   +------------------------------------------+   |
    |   |                                          |   |
    |   |           3D CesiumJS Globe              |   |
    |   |         (Satellite Tracking)             |   |
    |   |                                          |   |
    |   +------------------------------------------+   |
    |                       |                          |
    |   +-------------------+--------------------+     |
    |   |         |         |         |          |     |
    |   v         v         v         v          v     |
    | Satellites Flights  CCTV   Military  Seismic    |
    |  Layer     Layer   Layer   Layer     Layer      |
    |                                                  |
    |   +------------------------------------------+   |
    |   |  UI: Controls | HUD | Info Panel | Search|   |
    |   +------------------------------------------+   |
    |                                                  |
    |   +------------------------------------------+   |
    |   |  Shaders: NVG | FLIR | CRT Effects       |   |
    |   +------------------------------------------+   |
    +--------------------------------------------------+
```

## Features

- **3D Globe Visualization**: Interactive Earth rendering with CesiumJS
- **Real-time Satellite Tracking**: Track satellites using TLE (Two-Line Element) data
- **Multiple Data Layers**:
  - Satellites (ISS, Starlink, weather satellites, etc.)
  - Live Flight Tracking
  - CCTV Camera Feeds
  - Military Asset Positions
  - Seismic Activity Monitoring
  - Traffic Data Visualization
- **Visual Effects (Shaders)**:
  - Night Vision (NVG) Mode
  - Thermal/FLIR View
  - Retro CRT Display Effect
- **UI Components**:
  - Layer Toggle Controls with Opacity Sliders
  - Heads-Up Display (HUD) with FPS Counter
  - Information Panel for Selected Objects
  - Location Search with Geocoding
- **Dark Theme Interface**: Military/tactical aesthetic
- **Responsive Design**: Works on various screen sizes

## Setup Instructions

### 1. Clone the Repository
```bash
git clone <repository-url>
cd worldview/product
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Configure API Keys
```bash
cp config.example.js config.js
```
Edit `config.js` and add your API keys (see API Keys section below).

### 4. Start the Development Server
```bash
npm start
```

### 5. Open in Browser
Navigate to `http://localhost:5173` (or the URL shown in terminal).

## Alternative: Run Without Node.js

If you prefer not to use npm/Vite, you can serve the files with Python:

```bash
# Python 3
python -m http.server 8000

# Then open http://localhost:8000
```

Note: Some features may have limited functionality without the Vite build system.

## API Keys

The following API keys are required for full functionality:

### Cesium Ion Token (Required)
Used for globe rendering and terrain data.
- **Get your token**: https://ion.cesium.com/tokens
- **Instructions**: Sign up for free, create a token in your dashboard
- **Config key**: `CESIUM_ION_TOKEN`

### N2YO API Key (Optional - for satellite tracking)
Provides real-time satellite position data.
- **Get your key**: https://www.n2yo.com/api/
- **Instructions**: Register for free, find API key in account settings
- **Config key**: `n2yoApiKey`

### Space-Track.org Credentials (Optional - for TLE data)
Access to official NORAD TLE databases.
- **Register**: https://www.space-track.org/auth/createAccount
- **Instructions**: Create account (approval may take 24-48 hours)
- **Config keys**: `spaceTrackUsername`, `spaceTrackPassword`

## How to Run

### Development Mode (Recommended)
```bash
npm install      # Install dependencies
npm start        # Start Vite dev server with hot reload
```

### Production Build
```bash
npm run build    # Build for production
npm run preview  # Preview production build
```

### Simple HTTP Server
```bash
python -m http.server 8000
```

### Running Tests
```bash
npm test         # Run Vitest test suite
```

## Project Structure

```
product/
├── index.html           # Main HTML entry point
├── config.example.js    # Configuration template
├── config.js            # Your local config (gitignored)
├── package.json         # Dependencies and scripts
├── src/
│   ├── app.js           # Application entry point
│   ├── globe.js         # CesiumJS viewer wrapper
│   ├── layers/          # Data layer modules
│   │   ├── satellites.js
│   │   ├── flights.js
│   │   ├── cctv.js
│   │   ├── military.js
│   │   ├── seismic.js
│   │   └── traffic.js
│   ├── shaders/         # Visual effect shaders
│   │   ├── nvg.glsl     # Night vision
│   │   ├── flir.glsl    # Thermal imaging
│   │   ├── crt.glsl     # CRT effect
│   │   └── shader-manager.js
│   ├── ui/              # User interface components
│   │   ├── controls.js  # Layer toggles & settings
│   │   ├── hud.js       # Heads-up display
│   │   ├── info-panel.js
│   │   └── search.js    # Location search
│   └── utils/           # Utility modules
│       ├── api.js       # API helpers
│       ├── coordinates.js
│       └── sgp4.js      # Orbital calculations
├── styles/
│   ├── main.css         # Primary styles
│   └── hud.css          # HUD overlay styles
└── tests/               # Test files
```

## Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| cesium | ^1.112.0 | 3D globe rendering |
| satellite.js | ^5.0.0 | Satellite position calculations |
| vite | ^5.0.0 | Development server & bundler |
| vite-plugin-cesium | ^1.2.22 | Cesium integration for Vite |
| vitest | ^1.0.0 | Testing framework |

## Browser Requirements

- Modern browser with WebGL 2.0 support
- Chrome 90+, Firefox 90+, Safari 15+, Edge 90+
- Hardware acceleration enabled recommended

## Troubleshooting

### "Cesium Ion access token required" error
**Problem**: Globe doesn't render, console shows token error.
**Solution**:
1. Make sure you've created `config.js` from `config.example.js`
2. Add your Cesium Ion token to `config.js`
3. Refresh the page

### Black screen / Globe not loading
**Problem**: Page loads but globe is black or missing.
**Solution**:
1. Check browser console for errors (F12)
2. Verify WebGL is enabled: visit `chrome://gpu` or `about:support`
3. Try a different browser
4. Update graphics drivers

### "Module not found" errors
**Problem**: Console shows import errors.
**Solution**:
1. Run `npm install` to install dependencies
2. Make sure you're using `npm start`, not opening index.html directly

### Satellites not appearing
**Problem**: Globe renders but no satellites visible.
**Solution**:
1. Check if N2YO API key is configured
2. Verify network requests in browser DevTools
3. Satellite layer may need to be enabled in controls

### Performance issues / Low FPS
**Problem**: Application runs slowly.
**Solution**:
1. Close other GPU-intensive applications
2. Reduce number of visible layers
3. Lower satellite count in config (`maxDisplayed`)
4. Enable hardware acceleration in browser settings

### CORS errors with Python server
**Problem**: API calls fail when using `python -m http.server`.
**Solution**: Use `npm start` instead, or configure CORS headers in a custom server.

## Screenshots

*Screenshots can be added to the `/screenshots` directory:*
- `screenshot-globe.png` - Main globe view
- `screenshot-satellites.png` - Satellite tracking
- `screenshot-night-vision.png` - NVG shader effect
- `screenshot-controls.png` - UI controls panel

## License

MIT License - See LICENSE file for details.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run tests: `npm test`
5. Submit a pull request

---

Built with CesiumJS and satellite.js
