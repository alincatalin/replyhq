/**
 * Broadcasts list page
 */

async function initBroadcasts() {
  try {
    await loadBroadcasts();
  } catch (error) {
    console.error('[Broadcasts] Initialization error:', error);
    showToast('Failed to load broadcasts', 'error');
  }
}

async function loadBroadcasts() {
  try {
    const data = await apiGet('/admin/broadcasts');
    const list = document.getElementById('broadcasts-list');
    if (!list) return;

    const broadcasts = data.broadcasts || [];
    if (broadcasts.length === 0) {
      list.innerHTML = '<div style="color: var(--text-dim); padding: 1rem;">No broadcasts yet.</div>';
      return;
    }

    list.innerHTML = broadcasts.map((broadcast) => {
      const status = broadcast.status || 'draft';
      const statusLabel = status.charAt(0).toUpperCase() + status.slice(1);
      const createdAt = broadcast.sentAt || broadcast.scheduledAt || broadcast.createdAt;
      const dateLabel = createdAt ? formatDate(createdAt) : 'N/A';
      const openRate = formatPercent(broadcast.stats?.openRate ?? 0, true);
      const clickRate = formatPercent(broadcast.stats?.clickRate ?? 0, true);

      return `
        <a href="broadcast-analytics.html?id=${encodeURIComponent(broadcast.id)}" class="broadcast-item">
          <div class="broadcast-info">
            <h3>${escapeHtml(broadcast.title)} <span class="status-badge">${escapeHtml(statusLabel)}</span></h3>
            <div class="broadcast-meta">
              <span>${status === 'scheduled' ? 'Scheduled' : 'Sent'} ${escapeHtml(dateLabel)}</span>
              <span>•</span>
              <span>${escapeHtml(broadcast.targetType || 'ALL_USERS')}</span>
            </div>
          </div>
          <div class="broadcast-stats">
            <div class="b-stat">
              <span class="b-stat-val">${formatNumber(broadcast.stats?.totalSent ?? 0)}</span>
              <span class="b-stat-label">Sent</span>
            </div>
            <div class="b-stat">
              <span class="b-stat-val">${openRate}</span>
              <span class="b-stat-label">Opened</span>
            </div>
            <div class="b-stat">
              <span class="b-stat-val">${clickRate}</span>
              <span class="b-stat-label">Clicked</span>
            </div>
          </div>
        </a>
      `;
    }).join('');
  } catch (error) {
    console.error('[Broadcasts] Error loading broadcasts:', error);
    showToast(handleApiError(error, 'Failed to load broadcasts'), 'error');
  }
}

// Initialize on page load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initBroadcasts);
} else {
  initBroadcasts();
}
