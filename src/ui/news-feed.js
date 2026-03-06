/**
 * News Feed Panel - Live Intel Feed
 * Displays a scrollable list of news articles on the right side of the screen.
 * Clicking an article flies camera to the location and shows the info panel.
 */

/**
 * Region colors for left border styling
 */
const REGION_COLORS = {
  'Middle East': '#ff6b00', // orange
  'Europe': '#0088ff',      // blue
  'Asia': '#ff3333',        // red
  'Africa': '#ffcc00',      // yellow
  'Americas': '#00cc66',    // green
  'default': '#888888',     // gray
};

/**
 * Country to region mapping for border colors
 */
const COUNTRY_REGIONS = {
  // Middle East
  'Iran': 'Middle East',
  'Iraq': 'Middle East',
  'Israel': 'Middle East',
  'Syria': 'Middle East',
  'Yemen': 'Middle East',
  'Lebanon': 'Middle East',
  'Palestine': 'Middle East',
  'Saudi Arabia': 'Middle East',
  'Jordan': 'Middle East',
  'Turkey': 'Middle East',
  'Egypt': 'Middle East',
  // Europe
  'United Kingdom': 'Europe',
  'France': 'Europe',
  'Germany': 'Europe',
  'Poland': 'Europe',
  'Ukraine': 'Europe',
  'Russia': 'Europe',
  'Lithuania': 'Europe',
  // Asia
  'China': 'Asia',
  'India': 'Asia',
  'Pakistan': 'Asia',
  'North Korea': 'Asia',
  'South Korea': 'Asia',
  'Taiwan': 'Asia',
  'Japan': 'Asia',
  'Myanmar': 'Asia',
  'Afghanistan': 'Asia',
  // Africa
  'Sudan': 'Africa',
  'Somalia': 'Africa',
  'Libya': 'Africa',
  'Nigeria': 'Africa',
  // Americas
  'United States': 'Americas',
};

/**
 * Parse GDELT date format "20260306T090000Z" into a Date object
 * @param {string|Date} dateValue - GDELT date string or Date object
 * @returns {Date} Parsed Date object
 */
function parseGdeltDate(dateValue) {
  if (dateValue instanceof Date) {
    return dateValue;
  }
  if (typeof dateValue === 'string') {
    // GDELT format: 20260306T090000Z
    const parsed = dateValue.replace(
      /(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z/,
      '$1-$2-$3T$4:$5:$6Z'
    );
    const date = new Date(parsed);
    if (!isNaN(date.getTime())) {
      return date;
    }
  }
  return new Date();
}

/**
 * Format timestamp as relative time ("2h ago", "45m ago")
 * @param {Date|string} timestamp - Timestamp to format
 * @returns {string} Relative time string
 */
function formatTimeAgo(timestamp) {
  const date = parseGdeltDate(timestamp);
  const now = Date.now();
  const diff = now - date.getTime();

  if (isNaN(diff) || diff < 0) {
    return 'just now';
  }

  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) {
    return 'just now';
  } else if (minutes < 60) {
    return `${minutes}m ago`;
  } else if (hours < 24) {
    return `${hours}h ago`;
  } else {
    return `${days}d ago`;
  }
}

/**
 * Get region color for a country
 * @param {string} country - Country name
 * @returns {string} CSS color value
 */
function getRegionColor(country) {
  const region = COUNTRY_REGIONS[country] || 'default';
  return REGION_COLORS[region] || REGION_COLORS.default;
}

/**
 * NewsFeed class - Renders a news feed panel on the right side
 */
export class NewsFeed {
  /**
   * Create a new NewsFeed instance
   * @param {Object} options - Configuration options
   * @param {Object} options.globe - Globe instance for camera control
   * @param {Object} options.newsLayer - NewsLayer instance for data
   * @param {Object} [options.infoPanel] - InfoPanel instance for showing details
   */
  constructor(options = {}) {
    this.globe = options.globe || null;
    this.newsLayer = options.newsLayer || null;
    this.infoPanel = options.infoPanel || null;
    this.panel = null;
    this.visible = false;
    this._events = [];
    this._domAvailable = typeof document !== 'undefined';

    if (this._domAvailable) {
      this._createPanel();
      this._injectStyles();
    }
  }

  /**
   * Inject CSS styles for the news feed panel
   * @private
   */
  _injectStyles() {
    if (document.getElementById('newsFeedStyles')) {
      return; // Already injected
    }

    const style = document.createElement('style');
    style.id = 'newsFeedStyles';
    style.textContent = `
      .news-feed-panel {
        position: fixed;
        right: 0;
        top: 0;
        height: 100vh;
        width: 320px;
        background: rgba(10, 10, 20, 0.85);
        backdrop-filter: blur(12px);
        -webkit-backdrop-filter: blur(12px);
        border-left: 1px solid rgba(0, 255, 255, 0.2);
        display: flex;
        flex-direction: column;
        z-index: 1000;
        font-family: 'Courier New', monospace;
        transition: transform 0.3s ease;
      }

      .news-feed-panel.hidden {
        transform: translateX(100%);
      }

      .news-feed-header {
        padding: 16px;
        border-bottom: 1px solid rgba(0, 255, 255, 0.2);
        flex-shrink: 0;
      }

      .news-feed-title {
        color: #00ffff;
        font-size: 14px;
        font-weight: bold;
        letter-spacing: 2px;
        margin: 0 0 8px 0;
      }

      .news-feed-stats {
        color: rgba(255, 255, 255, 0.5);
        font-size: 10px;
        letter-spacing: 1px;
      }

      .news-feed-list {
        flex: 1;
        overflow-y: auto;
        padding: 0;
        margin: 0;
        list-style: none;
      }

      .news-feed-list::-webkit-scrollbar {
        width: 4px;
      }

      .news-feed-list::-webkit-scrollbar-track {
        background: rgba(0, 0, 0, 0.3);
      }

      .news-feed-list::-webkit-scrollbar-thumb {
        background: rgba(0, 255, 255, 0.3);
        border-radius: 2px;
      }

      .news-feed-item {
        padding: 12px 16px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.05);
        cursor: pointer;
        transition: background 0.2s ease;
        border-left: 3px solid transparent;
      }

      .news-feed-item:hover {
        background: rgba(0, 255, 255, 0.1);
      }

      .news-feed-item-headline {
        color: #ffffff;
        font-size: 12px;
        font-weight: bold;
        line-height: 1.4;
        margin: 0 0 6px 0;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
      }

      .news-feed-item-meta {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 10px;
      }

      .news-feed-item-source {
        color: rgba(255, 255, 255, 0.5);
      }

      .news-feed-item-time {
        color: rgba(255, 255, 255, 0.4);
      }

      .news-feed-item-country {
        background: rgba(255, 165, 0, 0.3);
        color: #ffa500;
        padding: 2px 6px;
        border-radius: 2px;
        font-size: 9px;
        font-weight: bold;
        letter-spacing: 0.5px;
      }

      .news-feed-toggle {
        position: fixed;
        right: 320px;
        top: 50%;
        transform: translateY(-50%);
        width: 24px;
        height: 48px;
        background: rgba(10, 10, 20, 0.85);
        backdrop-filter: blur(12px);
        -webkit-backdrop-filter: blur(12px);
        border: 1px solid rgba(0, 255, 255, 0.2);
        border-right: none;
        border-radius: 4px 0 0 4px;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 1001;
        transition: right 0.3s ease;
      }

      .news-feed-toggle.panel-hidden {
        right: 0;
      }

      .news-feed-toggle-arrow {
        color: #00ffff;
        font-size: 12px;
        transition: transform 0.3s ease;
      }

      .news-feed-toggle.panel-hidden .news-feed-toggle-arrow {
        transform: rotate(180deg);
      }

      .news-feed-empty {
        padding: 32px 16px;
        text-align: center;
        color: rgba(255, 255, 255, 0.4);
        font-size: 11px;
      }
    `;
    document.head.appendChild(style);
  }

  /**
   * Create the panel DOM element
   * @private
   */
  _createPanel() {
    // Create main panel
    this.panel = document.createElement('div');
    this.panel.className = 'news-feed-panel hidden';
    this.panel.innerHTML = `
      <div class="news-feed-header">
        <h2 class="news-feed-title">LIVE INTEL FEED</h2>
        <div class="news-feed-stats">0 EVENTS | LAST 24H</div>
      </div>
      <ul class="news-feed-list"></ul>
    `;

    // Create toggle button
    this.toggleBtn = document.createElement('button');
    this.toggleBtn.className = 'news-feed-toggle panel-hidden';
    this.toggleBtn.innerHTML = '<span class="news-feed-toggle-arrow">&lt;</span>';
    this.toggleBtn.addEventListener('click', () => this.toggle());

    // Add to document
    document.body.appendChild(this.panel);
    document.body.appendChild(this.toggleBtn);
  }

  /**
   * Update the news feed with new events
   * @param {Array<Object>} events - Array of news event objects
   */
  update(events) {
    if (!this._domAvailable || !this.panel) {
      return;
    }

    this._events = events || [];

    // Update stats
    const statsEl = this.panel.querySelector('.news-feed-stats');
    if (statsEl) {
      statsEl.textContent = `${this._events.length} EVENTS | LAST 24H`;
    }

    // Update list
    const listEl = this.panel.querySelector('.news-feed-list');
    if (!listEl) {
      return;
    }

    listEl.innerHTML = '';

    if (this._events.length === 0) {
      listEl.innerHTML = '<li class="news-feed-empty">No news events loaded.<br>Enable the News layer to see events.</li>';
      return;
    }

    for (const event of this._events) {
      const li = document.createElement('li');
      li.className = 'news-feed-item';

      // Set left border color based on region
      const regionColor = getRegionColor(event.country);
      li.style.borderLeftColor = regionColor;

      // Extract source domain from URL or use source field
      const sourceDomain = event.source || 'Unknown';

      // Format time
      const timeAgo = formatTimeAgo(event.timestamp);

      li.innerHTML = `
        <div class="news-feed-item-headline">${this._escapeHtml(event.headline || 'News Event')}</div>
        <div class="news-feed-item-meta">
          <span class="news-feed-item-source">${this._escapeHtml(sourceDomain)}</span>
          <span class="news-feed-item-time">${timeAgo}</span>
          ${event.country ? `<span class="news-feed-item-country">${this._escapeHtml(event.country)}</span>` : ''}
        </div>
      `;

      // Click handler - fly to location and show info panel
      li.addEventListener('click', () => {
        this._handleItemClick(event);
      });

      listEl.appendChild(li);
    }
  }

  /**
   * Escape HTML to prevent XSS
   * @param {string} str - String to escape
   * @returns {string} Escaped string
   * @private
   */
  _escapeHtml(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  /**
   * Handle click on a news item
   * @param {Object} event - News event object
   * @private
   */
  _handleItemClick(event) {
    // Fly camera to event location
    if (this.globe && event.lat != null && event.lon != null) {
      this.globe.flyTo({
        latitude: event.lat,
        longitude: event.lon,
        height: 2000000, // 2000km altitude for good view
      }, 2); // 2 second flight duration
    }

    // Show info panel with event details
    if (this.infoPanel) {
      this.infoPanel.show(event);
    }

    // Dispatch event for potential marker highlight
    if (typeof document !== 'undefined') {
      const customEvent = new CustomEvent('newsFeedClick', { detail: event });
      document.dispatchEvent(customEvent);
    }
  }

  /**
   * Show the news feed panel
   */
  show() {
    if (!this.panel) return;
    this.panel.classList.remove('hidden');
    this.toggleBtn.classList.remove('panel-hidden');
    this.visible = true;
  }

  /**
   * Hide the news feed panel
   */
  hide() {
    if (!this.panel) return;
    this.panel.classList.add('hidden');
    this.toggleBtn.classList.add('panel-hidden');
    this.visible = false;
  }

  /**
   * Toggle panel visibility
   */
  toggle() {
    if (this.visible) {
      this.hide();
    } else {
      this.show();
    }
  }

  /**
   * Check if panel is visible
   * @returns {boolean}
   */
  isVisible() {
    return this.visible;
  }

  /**
   * Set globe reference for camera control
   * @param {Object} globe - Globe instance
   */
  setGlobe(globe) {
    this.globe = globe;
  }

  /**
   * Set news layer reference for data
   * @param {Object} newsLayer - NewsLayer instance
   */
  setNewsLayer(newsLayer) {
    this.newsLayer = newsLayer;
  }

  /**
   * Set info panel reference for showing details
   * @param {Object} infoPanel - InfoPanel instance
   */
  setInfoPanel(infoPanel) {
    this.infoPanel = infoPanel;
  }

  /**
   * Destroy the news feed and clean up
   */
  destroy() {
    if (this.panel && this.panel.parentNode) {
      this.panel.parentNode.removeChild(this.panel);
    }
    if (this.toggleBtn && this.toggleBtn.parentNode) {
      this.toggleBtn.parentNode.removeChild(this.toggleBtn);
    }
    this.panel = null;
    this.toggleBtn = null;
    this._events = [];
  }
}

// Export helper functions for use in other modules
export { parseGdeltDate, formatTimeAgo, getRegionColor };

export default NewsFeed;
