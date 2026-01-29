/**
 * Broadcast creation page
 */

function buildSegmentQuery(selection) {
  switch (selection) {
    case 'Active in last 30 days':
      return { preset: 'active_30d' };
    case 'iOS Users Only':
      return { preset: 'platform_ios' };
    case 'Android Users Only':
      return { preset: 'platform_android' };
    default:
      return null;
  }
}

async function initBroadcastCreate() {
  const sendBtn = document.getElementById('send-broadcast-btn');
  if (!sendBtn) return;

  sendBtn.addEventListener('click', async () => {
    const titleInput = document.getElementById('broadcast-title');
    const pushTitleInput = document.getElementById('broadcast-push-title');
    const bodyInput = document.getElementById('broadcast-body');
    const targetSelect = document.getElementById('broadcast-target');

    const title = titleInput?.value.trim();
    const pushTitle = pushTitleInput?.value.trim();
    const body = bodyInput?.value.trim();
    const targetLabel = targetSelect?.value || 'All Users';

    if (!title || !body) {
      showToast('Please provide an internal name and message body.', 'error');
      return;
    }

    const segmentQuery = buildSegmentQuery(targetLabel);
    const targetType = segmentQuery ? 'SEGMENT' : 'ALL_USERS';

    try {
      showLoading(sendBtn, 'Sending...');
      await apiPost('/admin/broadcasts', {
        title,
        body,
        data: pushTitle ? { push_title: pushTitle } : undefined,
        targetType,
        segmentQuery: segmentQuery || undefined,
      });

      showToast('Broadcast created', 'success');
      window.location.href = '/admin/broadcasts.html';
    } catch (error) {
      console.error('[Broadcasts] Error creating broadcast:', error);
      showToast(handleApiError(error, 'Failed to create broadcast'), 'error');
    } finally {
      hideLoading(sendBtn);
    }
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initBroadcastCreate);
} else {
  initBroadcastCreate();
}
