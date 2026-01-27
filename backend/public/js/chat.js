/**
 * Chat interface functionality for ReplyHQ Admin
 * Handles real-time messaging between agents and users
 */

let socket = null;
let conversationId = null;
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
      showToast('No conversation selected', 'error');
      window.location.href = '/admin/dashboard.html';
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
