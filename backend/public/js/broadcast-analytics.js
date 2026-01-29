/**
 * Broadcast analytics page
 */

async function initBroadcastAnalytics() {
  try {
    const params = new URLSearchParams(window.location.search);
    const id = params.get('id');
    if (!id) {
      showToast('Missing broadcast id', 'error');
      return;
    }

    const broadcast = await apiGet(`/admin/broadcasts/${id}`);
    renderBroadcastAnalytics(broadcast);
  } catch (error) {
    console.error('[Broadcasts] Error loading analytics:', error);
    showToast(handleApiError(error, 'Failed to load broadcast analytics'), 'error');
  }
}

function renderBroadcastAnalytics(broadcast) {
  const titleEl = document.getElementById('broadcast-title');
  const statusEl = document.getElementById('broadcast-status');
  const sentEl = document.getElementById('broadcast-sent');
  const openRateEl = document.getElementById('broadcast-open-rate');
  const clickRateEl = document.getElementById('broadcast-click-rate');

  if (titleEl) titleEl.textContent = broadcast.title || 'Broadcast';
  if (statusEl) statusEl.textContent = (broadcast.status || 'draft').toUpperCase();

  if (sentEl) sentEl.textContent = formatNumber(broadcast.stats?.totalSent ?? 0);
  if (openRateEl) openRateEl.textContent = formatPercent(broadcast.stats?.openRate ?? 0, true);
  if (clickRateEl) clickRateEl.textContent = formatPercent(broadcast.stats?.clickRate ?? 0, true);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initBroadcastAnalytics);
} else {
  initBroadcastAnalytics();
}
