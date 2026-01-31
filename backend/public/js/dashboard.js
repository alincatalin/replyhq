/**
 * Dashboard functionality for ReplyHQ Admin
 * Displays conversation list with real-time updates
 */

let socket = null;
let conversations = [];

// Initialize dashboard
async function initDashboard() {
  try {
    // Initialize Socket.IO connection
    socket = await initAdminSocket();

    if (socket) {
      // Listen for real-time events
      socket.on('message:new', handleNewMessage);
      socket.on('session:connect', handleSessionConnect);
      socket.on('session:disconnect', handleSessionDisconnect);
    }

    // Load initial data
    await loadConversations();
    await loadStats();
    await loadAnalyticsOverview();

    // Set up search
    setupSearch();

    console.log('[Dashboard] Initialized successfully');
  } catch (error) {
    console.error('[Dashboard] Initialization error:', error);
    showToast('Failed to load dashboard', 'error');
  }
}

// Load analytics overview from API
async function loadAnalyticsOverview() {
  try {
    const data = await apiGet('/admin/analytics/overview');

    updateStat('analytics-total-events', data.totalEvents ?? 0);
    updateStat('analytics-unique-users', data.uniqueUsers ?? 0);

    const list = document.getElementById('analytics-top-events');
    if (!list) return;

    const topEvents = data.topEvents || [];
    if (topEvents.length === 0) {
      list.innerHTML = '<li style=\"color: var(--text-dim);\">No events yet</li>';
      return;
    }

    list.innerHTML = topEvents.map(event => `
      <li style=\"display: flex; justify-content: space-between; padding: 0.4rem 0; border-bottom: 1px solid var(--border);\">
        <span>${escapeHtml(event.eventName || event.event_name || 'Unknown')}</span>
        <span style=\"color: var(--text-dim);\">${formatNumber(event.count ?? 0)}</span>
      </li>
    `).join('');
  } catch (error) {
    console.error('[Dashboard] Error loading analytics overview:', error);
  }
}

// Load conversations from API
async function loadConversations() {
  try {
    showLoadingOverlay();

    const data = await apiGet('/admin/api/conversations');
    // API returns { conversations: [...] } with snake_case fields
    conversations = (data.conversations || []).map(item => ({
      id: item.conversation_id,
      userId: item.user_id,
      deviceId: item.device_id,
      visitorId: item.device_id,
      status: item.status,
      metadata: {
        userName: item.display_name,
        device: item.device_context || {}
      },
      lastMessage: item.last_message ? {
        body: item.last_message,
        sender: item.last_sender,
        createdAt: item.last_message_at
      } : null,
      createdAt: item.created_at,
      updatedAt: item.updated_at,
      isOnline: item.is_online
    }));

    renderConversations(conversations);

    hideLoadingOverlay();
  } catch (error) {
    console.error('[Dashboard] Error loading conversations:', error);
    hideLoadingOverlay();
    showToast(handleApiError(error, 'Failed to load conversations'), 'error');
  }
}

// Load dashboard stats
async function loadStats() {
  try {
    const stats = await apiGet('/admin/api/dashboard/stats');

    if (stats) {
      updateStat('total-conversations', stats.total_conversations ?? 0);
      updateStat('open-conversations', stats.open_conversations ?? 0);
      updateStat('resolved-conversations', stats.resolved_conversations ?? 0);
      updateStat('online-conversations', stats.online_conversations ?? 0);
      return;
    }

    // Fallback to client-side calculation if API is unavailable
    const totalConversations = conversations.length;
    const openConversations = conversations.filter(c => c.status === 'open').length;
    const resolvedConversations = conversations.filter(c => c.status === 'resolved').length;

    updateStat('total-conversations', totalConversations);
    updateStat('open-conversations', openConversations);
    updateStat('resolved-conversations', resolvedConversations);
  } catch (error) {
    console.error('[Dashboard] Error loading stats:', error);
  }
}

// Render conversations list
function renderConversations(conversations) {
  const listContainer = document.querySelector('.conversations-list');
  if (!listContainer) return;

  if (conversations.length === 0) {
    listContainer.innerHTML = `
      <div style="text-align: center; padding: 3rem; color: var(--text-dim);">
        <p>No conversations yet</p>
        <p style="font-size: 0.9rem; margin-top: 0.5rem;">
          Conversations will appear here when users message you
        </p>
      </div>
    `;
    return;
  }

  listContainer.innerHTML = conversations
    .map(conversation => renderConversationCard(conversation))
    .join('');
}

// Render individual conversation card
function renderConversationCard(conversation) {
  const { id, visitorId, status, metadata, lastMessage, createdAt, isOnline } = conversation;

  // Generate user display name
  const userName = metadata?.userName || metadata?.email || `User ${visitorId?.substring(0, 8)}`;

  // Generate avatar
  const initials = getInitials(userName);
  const avatarGradient = getAvatarGradient(visitorId || id || 'replyhq');

  // Format last message
  const lastMessageText = lastMessage?.body || 'No messages yet';
  const lastMessageTime = lastMessage?.createdAt ? formatRelativeTime(lastMessage.createdAt) : formatRelativeTime(createdAt);
  const lastMessageSender = lastMessage?.sender === 'agent' ? 'You: ' : '';

  // Get device info
  const deviceInfo = metadata?.device || {};
  const platform = deviceInfo.platform || 'Unknown';
  const deviceName = deviceInfo.model || deviceInfo.manufacturer || platform;

  // Status badge
  const statusBadge = status === 'resolved'
    ? '<span class="badge success">Resolved</span>'
    : '<span class="badge">Open</span>';

  // Online indicator
  const onlineIndicator = isOnline
    ? '<span class="online-dot" style="width: 8px; height: 8px; background: var(--success); border-radius: 50%; display: inline-block; margin-left: 4px;"></span>'
    : '';

  return `
    <a href="/admin/chat.html?id=${id}" class="conversation-item">
      <div class="conversation-avatar" style="background: ${avatarGradient};">
        ${initials}
        ${onlineIndicator}
      </div>
      <div class="conversation-content">
        <div class="conversation-header">
          <span class="conversation-user">${escapeHtml(userName)}</span>
          <span class="conversation-time">${lastMessageTime}</span>
        </div>
        <div class="conversation-preview">
          ${escapeHtml(lastMessageSender + truncate(lastMessageText, 80))}
        </div>
        <div class="conversation-meta">
          <span class="meta-tag">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
            </svg>
            ${escapeHtml(deviceName)}
          </span>
          ${statusBadge}
        </div>
      </div>
    </a>
  `;
}

// Handle new message from Socket.IO
function handleNewMessage(message) {
  console.log('[Dashboard] New message:', message);

  // Find conversation in list
  const conversationIndex = conversations.findIndex(c => c.id === message.conversationId);

  if (conversationIndex >= 0) {
    // Update existing conversation
    conversations[conversationIndex].lastMessage = {
      body: message.body,
      sender: message.sender,
      createdAt: message.createdAt
    };

    // Move to top of list
    const [conversation] = conversations.splice(conversationIndex, 1);
    conversations.unshift(conversation);
  } else {
    // New conversation - reload list
    loadConversations();
    return;
  }

  // Re-render list
  renderConversations(conversations);

  // Show toast for new user messages
  if (message.sender === 'user') {
    showToast('New message received', 'info', 2000);
  }
}

// Handle user coming online
function handleSessionConnect(data) {
  console.log('[Dashboard] User came online:', data);

  const { deviceId } = data;

  // Find conversation with this device
  const conversation = conversations.find(c => c.deviceId === deviceId);

  if (conversation) {
    conversation.isOnline = true;
    renderConversations(conversations);
  }
}

// Handle user going offline
function handleSessionDisconnect(data) {
  console.log('[Dashboard] User went offline:', data);

  const { deviceId } = data;

  // Find conversation with this device
  const conversation = conversations.find(c => c.deviceId === deviceId);

  if (conversation) {
    conversation.isOnline = false;
    renderConversations(conversations);
  }
}

// Update stat in UI
function updateStat(statId, value) {
  const statElement = document.getElementById(statId);
  if (statElement) {
    statElement.textContent = formatNumber(value);
  }
}

// Setup search functionality
function setupSearch() {
  const searchInput = document.querySelector('.search-input');
  if (!searchInput) return;

  searchInput.addEventListener('input', debounce((e) => {
    const query = e.target.value.toLowerCase().trim();

    if (!query) {
      renderConversations(conversations);
      return;
    }

    const filtered = conversations.filter(conversation => {
      const userName = conversation.metadata?.userName || conversation.metadata?.email || '';
      const lastMessage = conversation.lastMessage?.body || '';

      return userName.toLowerCase().includes(query) ||
             lastMessage.toLowerCase().includes(query) ||
             conversation.visitorId?.toLowerCase().includes(query);
    });

    renderConversations(filtered);
  }, 300));
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', initDashboard);

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
  if (socket) {
    removeAllSocketListeners();
    closeAdminSocket();
  }
});
