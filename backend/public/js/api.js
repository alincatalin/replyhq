/**
 * API utilities for ReplyHQ Admin Dashboard
 * Provides authenticated fetch wrapper with automatic token refresh
 */

/**
 * Make authenticated API request with automatic token refresh
 * @param {string} url - API endpoint URL
 * @param {RequestInit} options - Fetch options
 * @returns {Promise<Response>}
 */
async function apiRequest(url, options = {}) {
  const token = await getValidAccessToken();

  if (!token) {
    // User not authenticated, redirect to login
    window.location.href = '/admin/login.html';
    throw new Error('Not authenticated');
  }

  const response = await fetch(url, {
    ...options,
    headers: {
      ...options.headers,
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  });

  // Handle 401 Unauthorized (token invalid)
  if (response.status === 401) {
    logout();
    throw new Error('Session expired');
  }

  return response;
}

/**
 * Make GET request
 * @param {string} url - API endpoint URL
 * @returns {Promise<any>} - Parsed JSON response
 */
async function apiGet(url) {
  const response = await apiRequest(url, { method: 'GET' });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(error.error || error.message || `Request failed with status ${response.status}`);
  }

  return response.json();
}

/**
 * Make POST request
 * @param {string} url - API endpoint URL
 * @param {object} data - Request body data
 * @returns {Promise<any>} - Parsed JSON response
 */
async function apiPost(url, data) {
  const response = await apiRequest(url, {
    method: 'POST',
    body: JSON.stringify(data)
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(error.error || error.message || `Request failed with status ${response.status}`);
  }

  return response.json();
}

/**
 * Make PUT request
 * @param {string} url - API endpoint URL
 * @param {object} data - Request body data
 * @returns {Promise<any>} - Parsed JSON response
 */
async function apiPut(url, data) {
  const response = await apiRequest(url, {
    method: 'PUT',
    body: JSON.stringify(data)
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(error.error || error.message || `Request failed with status ${response.status}`);
  }

  return response.json();
}

/**
 * Make DELETE request
 * @param {string} url - API endpoint URL
 * @returns {Promise<any>} - Parsed JSON response
 */
async function apiDelete(url) {
  const response = await apiRequest(url, { method: 'DELETE' });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(error.error || error.message || `Request failed with status ${response.status}`);
  }

  return response.json();
}

/**
 * Make PATCH request
 * @param {string} url - API endpoint URL
 * @param {object} data - Request body data
 * @returns {Promise<any>} - Parsed JSON response
 */
async function apiPatch(url, data) {
  const response = await apiRequest(url, {
    method: 'PATCH',
    body: JSON.stringify(data)
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(error.error || error.message || `Request failed with status ${response.status}`);
  }

  return response.json();
}

/**
 * Handle API errors with user-friendly messages
 * @param {Error} error - Error object
 * @param {string} fallbackMessage - Fallback error message
 * @returns {string} - User-friendly error message
 */
function handleApiError(error, fallbackMessage = 'An error occurred') {
  console.error('API Error:', error);

  if (error.message === 'Not authenticated' || error.message === 'Session expired') {
    return 'Your session has expired. Please log in again.';
  }

  return error.message || fallbackMessage;
}

/**
 * Show loading state
 * @param {HTMLElement} element - Element to show loading state on
 * @param {string} loadingText - Loading text to display
 */
function showLoading(element, loadingText = 'Loading...') {
  if (element) {
    element.disabled = true;
    element.dataset.originalText = element.textContent;
    element.textContent = loadingText;
  }
}

/**
 * Hide loading state
 * @param {HTMLElement} element - Element to hide loading state from
 */
function hideLoading(element) {
  if (element && element.dataset.originalText) {
    element.disabled = false;
    element.textContent = element.dataset.originalText;
    delete element.dataset.originalText;
  }
}
