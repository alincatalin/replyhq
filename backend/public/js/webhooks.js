/**
 * Webhooks management for ReplyHQ Admin Settings
 */

async function initWebhooks() {
  try {
    await loadWebhooks();
    setupWebhookCreate();
  } catch (error) {
    console.error('[Webhooks] Initialization error:', error);
    showToast('Failed to load webhooks', 'error');
  }
}

async function loadWebhooks() {
  try {
    const data = await apiGet('/admin/webhooks');
    const list = document.getElementById('webhooks-list');
    if (!list) return;

    const webhooks = data.webhooks || [];
    if (webhooks.length === 0) {
      list.innerHTML = '<div style="color: var(--text-dim);">No webhooks configured yet.</div>';
      return;
    }

    list.innerHTML = webhooks.map(webhook => `
      <div style="border: 1px solid var(--border); border-radius: 10px; padding: 1rem;">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <div>
            <div style="font-weight: 600;">${escapeHtml(webhook.url)}</div>
            <div style="color: var(--text-dim); font-size: 0.9rem;">${escapeHtml((webhook.events || []).join(', '))}</div>
          </div>
          <div style="display: flex; gap: 0.5rem;">
            <button class="btn" data-webhook-action="test" data-webhook-id="${webhook.id}">Test</button>
            <button class="btn" data-webhook-action="toggle" data-webhook-id="${webhook.id}">
              ${webhook.isActive ? 'Disable' : 'Enable'}
            </button>
            <button class="btn" data-webhook-action="delete" data-webhook-id="${webhook.id}">Delete</button>
          </div>
        </div>
      </div>
    `).join('');

    list.querySelectorAll('button[data-webhook-action]').forEach(button => {
      button.addEventListener('click', handleWebhookAction);
    });
  } catch (error) {
    console.error('[Webhooks] Error loading webhooks:', error);
    showToast(handleApiError(error, 'Failed to load webhooks'), 'error');
  }
}

function setupWebhookCreate() {
  const createBtn = document.getElementById('create-webhook-btn');
  if (!createBtn) return;

  createBtn.addEventListener('click', async () => {
    const urlInput = document.getElementById('webhook-url');
    const eventsInput = document.getElementById('webhook-events');

    const url = urlInput?.value.trim();
    const events = eventsInput?.value.split(',').map(value => value.trim()).filter(Boolean) || [];

    if (!url || events.length === 0) {
      showToast('Please provide a webhook URL and at least one event.', 'error');
      return;
    }

    try {
      showLoading(createBtn, 'Creating...');
      await apiPost('/admin/webhooks', { url, events });
      if (urlInput) urlInput.value = '';
      if (eventsInput) eventsInput.value = '';
      await loadWebhooks();
      showToast('Webhook created', 'success');
    } catch (error) {
      console.error('[Webhooks] Error creating webhook:', error);
      showToast(handleApiError(error, 'Failed to create webhook'), 'error');
    } finally {
      hideLoading(createBtn);
    }
  });
}

async function handleWebhookAction(event) {
  const button = event.currentTarget;
  const action = button.getAttribute('data-webhook-action');
  const webhookId = button.getAttribute('data-webhook-id');
  if (!action || !webhookId) return;

  try {
    if (action === 'delete') {
      if (!confirm('Delete this webhook?')) return;
      await apiDelete(`/admin/webhooks/${webhookId}`);
      showToast('Webhook deleted', 'success');
    } else if (action === 'toggle') {
      const isDisabling = button.textContent.trim().toLowerCase() === 'disable';
      await apiPut(`/admin/webhooks/${webhookId}`, { isActive: !isDisabling });
      showToast(isDisabling ? 'Webhook disabled' : 'Webhook enabled', 'success');
    } else if (action === 'test') {
      showLoading(button, 'Testing...');
      const result = await apiPost(`/admin/webhooks/${webhookId}/test`, {});
      if (result.success) {
        showToast('Test webhook delivered', 'success');
      } else {
        showToast('Test webhook failed', 'error');
      }
    }

    await loadWebhooks();
  } catch (error) {
    console.error('[Webhooks] Error handling webhook action:', error);
    showToast(handleApiError(error, 'Failed to update webhook'), 'error');
  } finally {
    hideLoading(button);
  }
}

// Initialize webhooks when settings page loads
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initWebhooks);
} else {
  initWebhooks();
}
