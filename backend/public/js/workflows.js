/**
 * Workflows list page
 */

async function initWorkflows() {
  try {
    await loadWorkflows();
  } catch (error) {
    console.error('[Workflows] Initialization error:', error);
    showToast('Failed to load workflows', 'error');
  }
}

async function loadWorkflows() {
  try {
    const data = await apiGet('/admin/workflows');
    const list = document.getElementById('workflows-list');
    if (!list) return;

    const workflows = data.workflows || [];
    if (workflows.length === 0) {
      list.innerHTML = '<div style="color: var(--text-dim); padding: 1rem;">No workflows yet.</div>';
      return;
    }

    list.innerHTML = workflows.map((workflow) => {
      const status = workflow.status || 'draft';
      const statusClass = status === 'active' ? 'active' : status === 'paused' ? 'paused' : '';

      return `
        <a href="workflow-editor.html?id=${encodeURIComponent(workflow.id)}" class="w-card">
          <div class="w-header">
            <div>
              <div class="w-title">${escapeHtml(workflow.name)}</div>
              <div class="w-desc">${escapeHtml(workflow.description || 'No description')}</div>
            </div>
            <div class="w-status ${statusClass}">${escapeHtml(status.toUpperCase())}</div>
          </div>
          <div class="w-stats">
            <div class="w-stat-item">
              <span class="w-stat-val">${formatNumber(workflow.stats?.totalExecutions ?? 0)}</span>
              <span class="w-stat-label">Entered</span>
            </div>
            <div class="w-stat-item">
              <span class="w-stat-val">--</span>
              <span class="w-stat-label">Rate</span>
            </div>
          </div>
        </a>
      `;
    }).join('');
  } catch (error) {
    console.error('[Workflows] Error loading workflows:', error);
    showToast(handleApiError(error, 'Failed to load workflows'), 'error');
  }
}

// Initialize on page load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initWorkflows);
} else {
  initWorkflows();
}
