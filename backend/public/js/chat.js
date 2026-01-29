/**
 * Chat interface functionality for ReplyHQ Admin
 * Handles real-time messaging between agents and users
 */

let socket = null;
let conversationId = null;
let conversations = [];
let messages = [];
let typingTimeout = null;
let userTypingTimeout = null;
let isUserTyping = false;

// Initialize chat
async function initChat() {
  try {
    // Get conversation ID from URL
    conversationId = getQueryParam('id');
    if (!conversationId) {
      await loadConversations();
      setupSearch();
      setupNewConversation();
      renderEmptyConversationState();
      console.log('[Chat] Initialized without active conversation');
      return;
    }

    // Initialize Socket.IO connection
    socket = await initAdminSocket();

    if (socket) {
      // Join conversation room
      await joinConversation(conversationId);

      // Listen for real-time events
      socket.on('message:new', handleNewMessage);
      socket.on('user:typing', handleUserTyping);
      socket.on('conversation:joined', handleConversationJoined);
    }

    // Load messages
    await loadMessages();
    await loadConversations();
    setupSearch();
    setupNewConversation();

    // Setup message input
    setupMessageInput();

    console.log('[Chat] Initialized for conversation:', conversationId);
  } catch (error) {
    console.error('[Chat] Initialization error:', error);
    showToast('Failed to load chat', 'error');
  }
}

// Load messages from API
async function loadMessages() {
  try {
    if (!conversationId) {
      return;
    }
    const data = await apiGet(`/admin/api/conversations/${conversationId}/messages`);

    // API returns { messages: [...] } with snake_case fields
    messages = (data.messages || []).map(msg => ({
      id: msg.id,
      localId: msg.local_id,
      conversationId: msg.conversation_id,
      body: msg.body,
      sender: msg.sender,
      createdAt: msg.created_at,
      status: msg.status
    }));

    renderMessages();
    scrollToBottom();
  } catch (error) {
    console.error('[Chat] Error loading messages:', error);
    showToast(handleApiError(error, 'Failed to load messages'), 'error');
  }
}

// Load conversations list
async function loadConversations() {
  try {
    const data = await apiGet('/admin/api/users');
    conversations = (data.users || []).map(user => ({
      id: user.conversation_id,
      userId: user.user_id,
      deviceId: user.device_id,
      status: user.status,
      lastMessage: user.last_message ? {
        body: user.last_message,
        sender: user.last_sender,
        createdAt: user.last_message_at
      } : null,
      createdAt: user.created_at,
      updatedAt: user.updated_at,
      isOnline: user.is_online,
      displayName: user.display_name,
      deviceContext: user.device_context || {}
    }));

    renderConversationsList(conversations);
  } catch (error) {
    console.error('[Chat] Error loading conversations:', error);
    showToast(handleApiError(error, 'Failed to load conversations'), 'error');
  }
}

// Render conversations list in sidebar
function renderConversationsList(conversations) {
  const listContainer = document.querySelector('.conversations-list');
  if (!listContainer) return;

  if (conversations.length === 0) {
    listContainer.innerHTML = `
      <div style="text-align: center; padding: 2rem; color: var(--text-dim);">
        <p>No conversations yet</p>
      </div>
    `;
    return;
  }

  listContainer.innerHTML = conversations.map(conversation => {
    const userName = conversation.displayName || `User ${conversation.deviceId?.substring(0, 6)}`;
    const initials = getInitials(userName);
    const avatarGradient = getAvatarGradient(conversation.deviceId || conversation.id);
    const lastMessageText = conversation.lastMessage?.body || 'No messages yet';
    const lastMessageTime = conversation.lastMessage?.createdAt ? formatRelativeTime(conversation.lastMessage.createdAt) : formatRelativeTime(conversation.createdAt);
    const lastMessageSender = conversation.lastMessage?.sender === 'agent' ? 'You: ' : '';
    const isActive = conversation.id === conversationId;

    return `
      <a href="/admin/chat.html?id=${conversation.id}" class="conversation-item ${isActive ? 'active' : ''}">
        <div class="conversation-avatar" style="background: ${avatarGradient};">${initials}</div>
        <div class="conversation-content">
          <div class="conversation-header">
            <span class="conversation-user">${escapeHtml(userName)}</span>
            <span class="conversation-time">${lastMessageTime}</span>
          </div>
          <div class="conversation-preview">
            ${escapeHtml(lastMessageSender + truncate(lastMessageText, 60))}
          </div>
        </div>
      </a>
    `;
  }).join('');
}

function renderEmptyConversationState() {
  const header = document.querySelector('.chat-header');
  const messagesContainer = document.querySelector('.messages-area');
  const messageInput = document.querySelector('.chat-input');
  const sendButton = document.querySelector('.send-btn');

  if (header) {
    header.innerHTML = `
      <div class="chat-user-info">
        <div class="conversation-avatar">?</div>
        <div>
          <div class="chat-user-name">Select a conversation</div>
          <div class="chat-user-meta">Choose a message thread from the left</div>
        </div>
      </div>
    `;
  }

  if (messagesContainer) {
    messagesContainer.innerHTML = `
      <div style="text-align: center; padding: 3rem; color: var(--text-dim);">
        <p>No conversation selected</p>
        <p style="font-size: 0.9rem; margin-top: 0.5rem;">
          Pick a conversation or start a new one
        </p>
      </div>
    `;
  }

  if (messageInput) {
    messageInput.disabled = true;
  }
  if (sendButton) {
    sendButton.disabled = true;
  }
}

function setupSearch() {
  const searchInput = document.querySelector('.search-box');
  if (!searchInput) return;

  searchInput.addEventListener('input', (event) => {
    const query = event.target.value.toLowerCase();
    const filtered = conversations.filter((conversation) => {
      const name = conversation.displayName || '';
      const lastMessage = conversation.lastMessage?.body || '';
      return name.toLowerCase().includes(query) || lastMessage.toLowerCase().includes(query);
    });
    renderConversationsList(filtered);
  });
}

function setupNewConversation() {
  const button = document.getElementById('new-conversation-btn');
  if (!button) return;

  button.addEventListener('click', async (event) => {
    event.preventDefault();
    const deviceId = window.prompt('Enter device ID (required)');
    if (!deviceId) return;
    const userId = window.prompt('Enter user ID (optional)') || '';

    try {
      const response = await apiPost('/admin/api/conversations', {
        device_id: deviceId.trim(),
        user_id: userId.trim() || undefined
      });
      if (response?.conversation?.id) {
        window.location.href = `/admin/chat.html?id=${response.conversation.id}`;
      }
    } catch (error) {
      console.error('[Chat] Error creating conversation:', error);
      showToast(handleApiError(error, 'Failed to create conversation'), 'error');
    }
  });
}

// Render all messages
function renderMessages() {
  const messagesContainer = document.querySelector('.messages-area');
  if (!messagesContainer) return;

  if (messages.length === 0) {
    messagesContainer.innerHTML = `
      <div style="text-align: center; padding: 3rem; color: var(--text-dim);">
        <p>No messages yet</p>
        <p style="font-size: 0.9rem; margin-top: 0.5rem;">
          Start the conversation by sending a message
        </p>
      </div>
    `;
    return;
  }

  messagesContainer.innerHTML = messages
    .map(message => renderMessage(message))
    .join('');
}

// Render individual message
function renderMessage(message) {
  const isAgent = message.sender === 'agent';
  const isSystem = message.sender === 'system';

  if (isSystem) {
    return `
      <div class="message user">
        <div class="message-content">
          <div class="message-bubble">
            <div class="message-text">${escapeHtml(message.body)}</div>
          </div>
          <div class="message-time" style="font-size: 0.75rem; color: var(--text-dim); margin-top: 0.25rem;">
            ${formatTime(message.createdAt)}
          </div>
        </div>
      </div>
    `;
  }

  const senderClass = isAgent ? 'agent' : 'user';
  const senderName = isAgent ? 'You' : (message.senderName || 'User');
  const statusIndicator = isAgent ? renderMessageStatus(message.status) : '';

  return `
    <div class="message ${senderClass}">
      <div class="message-avatar">${isAgent ? 'A' : getInitials(senderName)}</div>
      <div class="message-content">
        <div class="message-sender">
          ${senderName}
          <span class="message-time">${formatTime(message.createdAt)}</span>
        </div>
        <div class="message-bubble">
          <div class="message-text">${escapeHtml(message.body)}</div>
        </div>
        ${statusIndicator ? `<div style="font-size: 0.75rem; color: var(--text-dim); margin-top: 0.25rem;">${statusIndicator}</div>` : ''}
      </div>
    </div>
  `;
}

// Render message status indicator
function renderMessageStatus(status) {
  const statusMap = {
    'QUEUED': '○',
    'SENDING': '◔',
    'SENT': '◑',
    'DELIVERED': '◕',
    'READ': '●',
    'FAILED': '✕'
  };

  const statusIcon = statusMap[status] || '○';
  const statusClass = status === 'FAILED' ? 'status-failed' : 'status-normal';

  return `<span class="message-status ${statusClass}" title="${status}">${statusIcon}</span>`;
}

// Handle new message from Socket.IO
function handleNewMessage(message) {
  console.log('[Chat] New message:', message);

  // Only add if it's for this conversation
  if (message.conversationId !== conversationId && message.conversation_id !== conversationId) {
    return;
  }

  // Check if message already exists (deduplication)
  const existingIndex = messages.findIndex(m =>
    m.id === message.id || m.localId === message.localId || m.localId === message.local_id
  );

  if (existingIndex >= 0) {
    // Update existing message (e.g., status change)
    messages[existingIndex] = {
      id: message.id,
      localId: message.localId || message.local_id,
      conversationId: message.conversationId || message.conversation_id,
      body: message.body,
      sender: message.sender,
      createdAt: message.createdAt || message.created_at,
      status: message.status
    };
  } else {
    // Add new message
    messages.push({
      id: message.id,
      localId: message.localId || message.local_id,
      conversationId: message.conversationId || message.conversation_id,
      body: message.body,
      sender: message.sender,
      createdAt: message.createdAt || message.created_at,
      status: message.status
    });
  }

  renderMessages();
  scrollToBottom();
}

// Handle user typing indicator
function handleUserTyping(data) {
  console.log('[Chat] User typing:', data);

  const { is_typing } = data;

  clearTimeout(userTypingTimeout);

  if (is_typing) {
    isUserTyping = true;
    showTypingIndicator();

    // Auto-hide after 3 seconds if no new typing event
    userTypingTimeout = setTimeout(() => {
      isUserTyping = false;
      hideTypingIndicator();
    }, 3000);
  } else {
    isUserTyping = false;
    hideTypingIndicator();
  }
}

// Handle conversation joined event
function handleConversationJoined(data) {
  console.log('[Chat] Joined conversation:', data);
}

// Setup message input handlers
function setupMessageInput() {
  const messageInput = document.querySelector('.chat-input');
  const sendButton = document.querySelector('.send-btn');

  if (!messageInput || !sendButton) return;

  // Handle send button click
  sendButton.addEventListener('click', async (e) => {
    e.preventDefault();
    await sendMessage();
  });

  // Handle Enter key (Shift+Enter for new line)
  messageInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  // Handle typing indicators
  messageInput.addEventListener('input', () => {
    // Clear previous timeout
    clearTimeout(typingTimeout);

    // Send typing start
    sendTypingStart(conversationId);

    // Auto-send typing stop after 3 seconds of no typing
    typingTimeout = setTimeout(() => {
      sendTypingStop(conversationId);
    }, 3000);
  });

  // Send typing stop when input loses focus
  messageInput.addEventListener('blur', () => {
    clearTimeout(typingTimeout);
    sendTypingStop(conversationId);
  });

  // Enable send button when there's text
  messageInput.addEventListener('input', () => {
    const hasText = messageInput.value.trim().length > 0;
    sendButton.disabled = !hasText;
  });
}

// Send message to backend
async function sendMessage() {
  const messageInput = document.querySelector('.chat-input');
  const sendButton = document.querySelector('.send-btn');

  if (!messageInput || !sendButton) return;

  const body = messageInput.value.trim();
  if (!body) return;

  // Disable input while sending
  messageInput.disabled = true;
  sendButton.disabled = true;
  const originalText = sendButton.textContent;
  sendButton.textContent = 'Sending...';

  try {
    // Stop typing indicator
    clearTimeout(typingTimeout);
    sendTypingStop(conversationId);

    // Send message via API
    const response = await apiPost(`/admin/api/conversations/${conversationId}/messages`, {
      body
    });

    // Message will be received via Socket.IO, so we don't need to manually add it
    // But we can optimistically add it for better UX
    const optimisticMessage = {
      id: response.message?.id || `temp-${Date.now()}`,
      localId: response.message?.localId,
      conversationId,
      body,
      sender: 'agent',
      createdAt: new Date().toISOString(),
      status: 'SENDING'
    };

    messages.push(optimisticMessage);
    renderMessages();
    scrollToBottom();

    // Clear input
    messageInput.value = '';
    messageInput.focus();
  } catch (error) {
    console.error('[Chat] Error sending message:', error);
    showToast(handleApiError(error, 'Failed to send message'), 'error');
  } finally {
    // Re-enable input
    messageInput.disabled = false;
    sendButton.disabled = false;
    sendButton.textContent = originalText;
  }
}

// Show typing indicator
function showTypingIndicator() {
  const messagesContainer = document.querySelector('.messages-area');
  if (!messagesContainer) return;

  // Remove existing indicator
  const existing = document.getElementById('typing-indicator');
  if (existing) return; // Already showing

  const indicator = document.createElement('div');
  indicator.id = 'typing-indicator';
  indicator.className = 'message user';
  indicator.innerHTML = `
    <div class="message-avatar">...</div>
    <div class="message-content">
      <div class="message-bubble">
        <div class="typing-dots">
          <span></span><span></span><span></span>
        </div>
      </div>
    </div>
  `;

  messagesContainer.appendChild(indicator);
  scrollToBottom();
}

// Hide typing indicator
function hideTypingIndicator() {
  const indicator = document.getElementById('typing-indicator');
  if (indicator) {
    indicator.remove();
  }
}

// Scroll to bottom of messages
function scrollToBottom() {
  const messagesContainer = document.querySelector('.messages-area');
  if (messagesContainer) {
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  }
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', initChat);

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
  if (socket && conversationId) {
    clearTimeout(typingTimeout);
    sendTypingStop(conversationId);
    leaveConversation(conversationId);
    removeAllSocketListeners();
    closeAdminSocket();
  }
});
