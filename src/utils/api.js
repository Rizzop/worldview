/**
 * API Fetch Utilities with Retry and Caching
 * Provides a reusable fetch wrapper with timeout, retry on failure, and optional response caching.
 * Works in Node.js with native fetch (Node 18+).
 */

// Simple in-memory cache
const cache = new Map();

/**
 * Default configuration
 */
const DEFAULT_CONFIG = {
  timeout: 30000,        // 30 seconds default timeout
  retries: 3,            // Max retry attempts
  retryDelay: 1000,      // Initial retry delay in ms
  useCache: false,       // Cache responses
  cacheTTL: 300000,      // Cache TTL: 5 minutes
};

/**
 * Sleep for a specified duration
 * @param {number} ms - milliseconds to sleep
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Calculate exponential backoff delay
 * @param {number} attempt - current attempt number (0-indexed)
 * @param {number} baseDelay - base delay in ms
 * @returns {number} delay in ms
 */
function getBackoffDelay(attempt, baseDelay) {
  // Exponential backoff: baseDelay * 2^attempt
  return baseDelay * Math.pow(2, attempt);
}

/**
 * Generate cache key from URL and options
 * @param {string} url - request URL
 * @param {object} options - fetch options
 * @returns {string} cache key
 */
function getCacheKey(url, options) {
  const method = options?.method || 'GET';
  const body = options?.body || '';
  return `${method}:${url}:${body}`;
}

/**
 * Check if a cached entry is still valid
 * @param {object} entry - cache entry with data and timestamp
 * @param {number} ttl - time to live in ms
 * @returns {boolean}
 */
function isCacheValid(entry, ttl) {
  if (!entry) return false;
  return Date.now() - entry.timestamp < ttl;
}

/**
 * Determine if an error is retryable
 * @param {Error} error - the error that occurred
 * @returns {boolean}
 */
function isRetryableError(error) {
  // Network errors, timeouts, and certain fetch errors are retryable
  if (error.name === 'AbortError') return true;  // Timeout
  if (error.name === 'TypeError') return true;   // Network failure
  if (error.message?.includes('fetch failed')) return true;
  if (error.message?.includes('network')) return true;
  if (error.message?.includes('ECONNREFUSED')) return true;
  if (error.message?.includes('ENOTFOUND')) return true;
  if (error.message?.includes('ETIMEDOUT')) return true;
  return false;
}

/**
 * Fetch with retry, timeout, and optional caching
 *
 * @param {string} url - URL to fetch
 * @param {object} options - Fetch options plus custom config
 * @param {number} [options.timeout] - Request timeout in ms (default: 30000)
 * @param {number} [options.retries] - Max retry attempts (default: 3)
 * @param {number} [options.retryDelay] - Initial retry delay in ms (default: 1000)
 * @param {boolean} [options.useCache] - Enable response caching (default: false)
 * @param {number} [options.cacheTTL] - Cache TTL in ms (default: 300000)
 * @returns {Promise<Response|null>} - Response object or null on failure
 * @throws {Error} - Throws on non-retryable errors after all retries exhausted
 */
export async function fetchWithRetry(url, options = {}) {
  const {
    timeout = DEFAULT_CONFIG.timeout,
    retries = DEFAULT_CONFIG.retries,
    retryDelay = DEFAULT_CONFIG.retryDelay,
    useCache = DEFAULT_CONFIG.useCache,
    cacheTTL = DEFAULT_CONFIG.cacheTTL,
    ...fetchOptions
  } = options;

  // Check cache first if caching is enabled
  if (useCache) {
    const cacheKey = getCacheKey(url, fetchOptions);
    const cachedEntry = cache.get(cacheKey);
    if (isCacheValid(cachedEntry, cacheTTL)) {
      return cachedEntry.data;
    }
  }

  let lastError = null;

  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      // Create abort controller for timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      // Merge signals if one was provided in options
      const signal = fetchOptions.signal
        ? AbortSignal.any([fetchOptions.signal, controller.signal])
        : controller.signal;

      const response = await fetch(url, {
        ...fetchOptions,
        signal,
      });

      clearTimeout(timeoutId);

      // Cache successful responses if caching is enabled
      if (useCache && response.ok) {
        const cacheKey = getCacheKey(url, fetchOptions);
        // Clone the response for caching since body can only be read once
        const clonedResponse = response.clone();
        cache.set(cacheKey, {
          data: clonedResponse,
          timestamp: Date.now(),
        });
      }

      return response;

    } catch (error) {
      lastError = error;

      // Check if error is retryable
      if (!isRetryableError(error)) {
        throw new Error(`Non-retryable fetch error: ${error.message}`);
      }

      // Don't retry if this was the last attempt
      if (attempt < retries - 1) {
        const delay = getBackoffDelay(attempt, retryDelay);
        await sleep(delay);
      }
    }
  }

  // All retries exhausted
  throw new Error(`Fetch failed after ${retries} attempts: ${lastError?.message || 'Unknown error'}`);
}

/**
 * Convenience wrapper that returns JSON or null
 * @param {string} url - URL to fetch
 * @param {object} options - Same options as fetchWithRetry
 * @returns {Promise<object|null>} - Parsed JSON or null on failure
 */
export async function fetchJSON(url, options = {}) {
  try {
    const response = await fetchWithRetry(url, options);
    if (!response || !response.ok) {
      return null;
    }
    return await response.json();
  } catch (error) {
    return null;
  }
}

/**
 * Clear the response cache
 */
export function clearCache() {
  cache.clear();
}

/**
 * Get cache statistics
 * @returns {object} Cache stats
 */
export function getCacheStats() {
  return {
    size: cache.size,
    keys: Array.from(cache.keys()),
  };
}

// Export defaults for testing
export { DEFAULT_CONFIG };
