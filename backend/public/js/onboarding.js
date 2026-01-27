/**
 * Onboarding functionality for ReplyHQ Admin
 * Handles platform selection, quickstart guides, and progress tracking
 */

let onboardingState = null;
let currentPlatform = null;

// Initialize onboarding
async function initOnboarding() {
  try {
    // Load current status
    await loadOnboardingStatus();

    // Load checklist
    await loadChecklist();

    // Setup platform selector if present
    setupPlatformSelector();

    console.log('[Onboarding] Initialized successfully');
  } catch (error) {
    console.error('[Onboarding] Initialization error:', error);
    showToast('Failed to load onboarding data', 'error');
  }
}

// Load current onboarding status
async function loadOnboardingStatus() {
  try {
    const data = await apiGet('/admin/onboarding/status');

    onboardingState = {
      platform: data.platform,
      useCase: data.use_case,
      progress: data.progress,
      completed: data.completed,
      completedAt: data.completed_at
    };

    currentPlatform = data.platform;

    // Update UI if platform is selected
    if (currentPlatform) {
      await loadQuickstart(currentPlatform);
      updateProgressBar(data.progress);
    }
  } catch (error) {
    console.error('[Onboarding] Error loading status:', error);
    showToast(handleApiError(error, 'Failed to load onboarding status'), 'error');
  }
}

// Setup platform selector
function setupPlatformSelector() {
  // Platform selection buttons/cards
  const platformButtons = document.querySelectorAll('[data-platform]');

  platformButtons.forEach(button => {
    button.addEventListener('click', async (e) => {
      e.preventDefault();
      const platform = button.getAttribute('data-platform');
      await selectPlatform(platform);
    });
  });

  // Use case selection if present
  const useCaseInputs = document.querySelectorAll('[name="use-case"]');
  useCaseInputs.forEach(input => {
    input.addEventListener('change', async (e) => {
      if (currentPlatform) {
        await updateUseCase(e.target.value);
      }
    });
  });
}

// Select platform and load quickstart
async function selectPlatform(platform, useCase = null) {
  try {
    showLoadingOverlay();

    // Save platform selection
    const response = await apiPost('/admin/onboarding/platform', {
      platform,
      useCase: useCase || undefined
    });

    currentPlatform = platform;
    onboardingState.platform = platform;
    onboardingState.useCase = response.useCase;

    // Load platform-specific quickstart guide
    await loadQuickstart(platform);

    // Reload checklist (now platform-specific)
    await loadChecklist();

    hideLoadingOverlay();
    showToast(`${platform.toUpperCase()} selected`, 'success');
  } catch (error) {
    console.error('[Onboarding] Error selecting platform:', error);
    hideLoadingOverlay();
    showToast(handleApiError(error, 'Failed to select platform'), 'error');
  }
}

// Update use case only
async function updateUseCase(useCase) {
  if (!currentPlatform) return;

  try {
    await apiPost('/admin/onboarding/platform', {
      platform: currentPlatform,
      useCase
    });

    onboardingState.useCase = useCase;
    showToast('Use case updated', 'success');
  } catch (error) {
    console.error('[Onboarding] Error updating use case:', error);
    showToast(handleApiError(error, 'Failed to update use case'), 'error');
  }
}

// Load quickstart guide for platform
async function loadQuickstart(platform) {
  try {
    const response = await apiGet(`/admin/docs/quickstart/${platform}`);

    const { quickstart } = response;

    // Render quickstart guide
    renderQuickstart(quickstart);
  } catch (error) {
    console.error('[Onboarding] Error loading quickstart:', error);
    showToast(handleApiError(error, 'Failed to load quickstart guide'), 'error');
  }
}

// Render quickstart guide
function renderQuickstart(quickstart) {
  const quickstartContainer = document.getElementById('quickstart-container');
  if (!quickstartContainer) return;

  // The backend returns markdown with pre-filled API credentials
  // For now, just display it in a formatted way
  quickstartContainer.innerHTML = `
    <div class="quickstart-content">
      ${formatMarkdownToHTML(quickstart)}
    </div>
  `;

  // Setup copy buttons for code blocks
  setupCopyButtons();
}

// Simple markdown to HTML converter (basic implementation)
function formatMarkdownToHTML(markdown) {
  // This is a simplified converter - in production, use a library like marked.js
  let html = markdown;

  // Code blocks (triple backticks)
  html = html.replace(/```(\w+)?\n([\s\S]*?)```/g, (match, lang, code) => {
    return `<div class="code-block">
      <div class="code-header">
        <span class="code-lang">${lang || 'code'}</span>
        <button class="copy-btn" data-code="${escapeHtml(code.trim())}">Copy</button>
      </div>
      <pre><code>${escapeHtml(code.trim())}</code></pre>
    </div>`;
  });

  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>');

  // Headers
  html = html.replace(/^### (.+)$/gm, '<h3 class="section-heading">$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2 class="section-title">$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1 class="page-title">$1</h1>');

  // Lists
  html = html.replace(/^\- (.+)$/gm, '<li>$1</li>');
  html = html.replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>');

  // Paragraphs
  html = html.replace(/^(?!<[hup]|```|<div)(.+)$/gm, '<p>$1</p>');

  // Links
  html = html.replace(/\[([^\]]+)\]\(([^\)]+)\)/g, '<a href="$2" target="_blank">$1</a>');

  // Bold
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

  return html;
}

// Setup copy buttons for code blocks
function setupCopyButtons() {
  const copyButtons = document.querySelectorAll('.copy-btn');

  copyButtons.forEach(button => {
    button.addEventListener('click', async (e) => {
      e.preventDefault();

      // Get code from data attribute or from sibling code element
      const code = button.getAttribute('data-code') ||
                   button.closest('.code-block')?.querySelector('code')?.textContent;

      if (!code) return;

      try {
        await navigator.clipboard.writeText(code);

        // Visual feedback
        const originalText = button.textContent;
        button.textContent = 'Copied!';
        button.style.color = 'var(--success)';

        setTimeout(() => {
          button.textContent = originalText;
          button.style.color = '';
        }, 2000);
      } catch (error) {
        console.error('[Onboarding] Failed to copy:', error);
        showToast('Failed to copy to clipboard', 'error');
      }
    });
  });
}

// Load checklist with progress
async function loadChecklist() {
  try {
    const response = await apiGet('/admin/onboarding/checklist');

    const { checklist, progress, completed } = response;

    // Update progress bar
    updateProgressBar(progress);

    // Render checklist items
    renderChecklist(checklist);

    // Show completion message if done
    if (completed) {
      showCompletionMessage();
    }
  } catch (error) {
    console.error('[Onboarding] Error loading checklist:', error);
    showToast(handleApiError(error, 'Failed to load checklist'), 'error');
  }
}

// Render checklist items
function renderChecklist(checklist) {
  const checklistContainer = document.getElementById('checklist-container');
  if (!checklistContainer) return;

  if (!checklist || checklist.length === 0) {
    checklistContainer.innerHTML = `
      <div style="text-align: center; padding: 2rem; color: var(--text-dim);">
        <p>Select a platform to see onboarding tasks</p>
      </div>
    `;
    return;
  }

  checklistContainer.innerHTML = checklist
    .sort((a, b) => a.order - b.order)
    .map(task => renderChecklistItem(task))
    .join('');

  // Setup task completion handlers
  setupTaskHandlers();
}

// Render individual checklist item
function renderChecklistItem(task) {
  const completedClass = task.completed ? 'completed' : '';
  const requiredBadge = task.required ? '<span class="badge">Required</span>' : '';
  const checkIcon = task.completed ? '✓' : '';

  return `
    <div class="checklist-item ${completedClass}" data-task-id="${task.id}">
      <div class="checklist-checkbox ${task.completed ? 'checked' : ''}">
        ${checkIcon}
      </div>
      <div class="checklist-content">
        <div class="checklist-header">
          <h4 class="checklist-title">${escapeHtml(task.title)}</h4>
          <div class="checklist-meta">
            ${requiredBadge}
            <span class="time-badge">${task.estimatedTime || ''}</span>
          </div>
        </div>
        <p class="checklist-description">${escapeHtml(task.description)}</p>
        ${!task.completed ? `<button class="btn btn-small mark-complete-btn" data-task-id="${task.id}">Mark as Complete</button>` : ''}
      </div>
    </div>
  `;
}

// Setup task completion handlers
function setupTaskHandlers() {
  const completeButtons = document.querySelectorAll('.mark-complete-btn');

  completeButtons.forEach(button => {
    button.addEventListener('click', async (e) => {
      e.preventDefault();
      const taskId = button.getAttribute('data-task-id');
      await markTaskComplete(taskId);
    });
  });
}

// Mark task as complete
async function markTaskComplete(taskId) {
  try {
    const button = document.querySelector(`button[data-task-id="${taskId}"]`);
    if (button) {
      button.disabled = true;
      button.textContent = 'Marking...';
    }

    const response = await apiPost(`/admin/onboarding/mark-complete/${taskId}`, {});

    // Update progress bar
    updateProgressBar(response.progress);

    // Reload checklist to show updated state
    await loadChecklist();

    showToast('Task completed!', 'success');
  } catch (error) {
    console.error('[Onboarding] Error marking task complete:', error);
    showToast(handleApiError(error, 'Failed to mark task complete'), 'error');

    // Re-enable button
    const button = document.querySelector(`button[data-task-id="${taskId}"]`);
    if (button) {
      button.disabled = false;
      button.textContent = 'Mark as Complete';
    }
  }
}

// Update progress bar
function updateProgressBar(progress) {
  const progressBar = document.querySelector('.progress-bar-fill');
  const progressText = document.querySelector('.progress-text');

  if (progressBar) {
    progressBar.style.width = `${progress}%`;
  }

  if (progressText) {
    progressText.textContent = `${progress}% Complete`;
  }
}

// Show completion message
function showCompletionMessage() {
  const completionContainer = document.getElementById('completion-message');
  if (!completionContainer) return;

  completionContainer.innerHTML = `
    <div class="completion-card">
      <div class="completion-icon">🎉</div>
      <h2>Onboarding Complete!</h2>
      <p>You're all set up and ready to start using ReplyHQ.</p>
      <div style="display: flex; gap: 1rem; justify-content: center; margin-top: 1.5rem;">
        <a href="dashboard.html" class="btn">View Dashboard</a>
        <a href="chat.html" class="btn btn-outline">Start Messaging</a>
      </div>
    </div>
  `;

  completionContainer.style.display = 'block';
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', initOnboarding);
