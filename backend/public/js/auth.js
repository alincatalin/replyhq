/**
 * Authentication utilities for ReplyHQ Admin Dashboard
 * Handles login, logout, token management, and route protection
 */

/**
 * Login user with email and password
 * @param {string} email - User email
 * @param {string} password - User password
 * @returns {Promise<{accessToken: string, refreshToken: string}>}
 */
async function login(email, password) {
  const response = await fetch('/admin/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Login failed');
  }

  const { access_token: accessToken, refresh_token: refreshToken } = await response.json();

  // Store tokens
  localStorage.setItem('accessToken', accessToken);
  localStorage.setItem('refreshToken', refreshToken);

  // Decode and store user info from JWT payload
  const payload = JSON.parse(atob(accessToken.split('.')[1]));
  localStorage.setItem('userId', payload.userId);
  localStorage.setItem('appId', payload.appId);
  localStorage.setItem('role', payload.role);
  localStorage.setItem('email', payload.email);

  return { accessToken, refreshToken };
}

/**
 * Get valid access token, refreshing if necessary
 * @returns {Promise<string|null>} - Access token or null if not authenticated
 */
async function getValidAccessToken() {
  const token = localStorage.getItem('accessToken');
  if (!token) return null;

  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    const expiry = payload.exp * 1000; // Convert to milliseconds

    // Refresh if expired or expiring in next minute (60 seconds buffer)
    if (expiry < Date.now() + 60000) {
      const refreshToken = localStorage.getItem('refreshToken');
      if (!refreshToken) {
        logout();
        return null;
      }

      const response = await fetch('/admin/auth/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: refreshToken })
      });

      if (!response.ok) {
        // Refresh token invalid or expired, logout
        logout();
        return null;
      }

      const { access_token: newToken } = await response.json();
      localStorage.setItem('accessToken', newToken);

      // Update user info from new token
      const newPayload = JSON.parse(atob(newToken.split('.')[1]));
      localStorage.setItem('userId', newPayload.userId);
      localStorage.setItem('appId', newPayload.appId);
      localStorage.setItem('role', newPayload.role);
      localStorage.setItem('email', newPayload.email);

      return newToken;
    }

    return token;
  } catch (error) {
    console.error('Error validating token:', error);
    logout();
    return null;
  }
}

/**
 * Logout current user
 * Revokes refresh token on server and clears local storage
 */
async function logout() {
  const refreshToken = localStorage.getItem('refreshToken');

  // Revoke refresh token on server (best effort, don't block on errors)
  if (refreshToken) {
    try {
      await fetch('/admin/auth/logout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: refreshToken })
      });
    } catch (error) {
      console.error('Error revoking refresh token:', error);
    }
  }

  // Clear all stored data
  localStorage.clear();

  // Redirect to login
  window.location.href = '/admin/login.html';
}

/**
 * Check if user is authenticated and redirect to login if not
 * Call this at the top of every protected page
 * @returns {boolean} - True if authenticated, false otherwise
 */
function requireAuth() {
  const token = localStorage.getItem('accessToken');
  if (!token) {
    // Save current URL to redirect back after login
    sessionStorage.setItem('returnUrl', window.location.pathname + window.location.search);
    window.location.href = '/admin/login.html';
    return false;
  }
  return true;
}

/**
 * Get current user info from localStorage
 * @returns {{userId: string, appId: string, role: string, email: string} | null}
 */
function getCurrentUser() {
  const userId = localStorage.getItem('userId');
  const appId = localStorage.getItem('appId');
  const role = localStorage.getItem('role');
  const email = localStorage.getItem('email');

  if (!userId || !appId || !role) {
    return null;
  }

  return { userId, appId, role, email };
}

/**
 * Get app ID for current user
 * @returns {string | null}
 */
function getAppId() {
  return localStorage.getItem('appId');
}

/**
 * Get access token (without validation)
 * Use getValidAccessToken() for API requests
 * @returns {string | null}
 */
function getAccessToken() {
  return localStorage.getItem('accessToken');
}

/**
 * Check if current user has a specific role
 * @param {string} role - Role to check (OWNER, ADMIN, AGENT)
 * @returns {boolean}
 */
function hasRole(role) {
  const currentRole = localStorage.getItem('role');
  return currentRole === role;
}

/**
 * Check if current user is owner
 * @returns {boolean}
 */
function isOwner() {
  return hasRole('OWNER');
}

/**
 * Check if current user is admin or owner
 * @returns {boolean}
 */
function isAdmin() {
  const role = localStorage.getItem('role');
  return role === 'OWNER' || role === 'ADMIN';
}

/**
 * Enforce authentication on protected pages.
 * Use this from external JS files to avoid inline scripts.
 */
function enforceAuth() {
  requireAuth();
}
