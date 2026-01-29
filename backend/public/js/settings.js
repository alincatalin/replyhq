/**
 * Settings functionality for ReplyHQ Admin
 * Handles billing subscription management
 */

let subscriptionData = null;

// Initialize settings
async function initSettings() {
  try {
    // Load billing/subscription info
    await loadSubscriptionInfo();

    // Setup billing action handlers
    setupBillingHandlers();

    console.log('[Settings] Initialized successfully');
  } catch (error) {
    console.error('[Settings] Initialization error:', error);
    showToast('Failed to load settings', 'error');
  }
}

// Load subscription information
async function loadSubscriptionInfo() {
  try {
    const response = await apiGet('/admin/billing/subscription');

    if (response.subscription) {
      subscriptionData = {
        status: response.subscription.status,
        currentPeriodEnd: response.subscription.current_period_end || response.subscription.currentPeriodEnd,
        cancelAtPeriodEnd: response.subscription.cancel_at_period_end || response.subscription.cancelAtPeriodEnd,
        trialEndsAt: response.subscription.trial_ends_at || response.subscription.trialEndsAt,
        priceId: response.subscription.price_id || response.subscription.priceId,
        liveStatus: response.subscription.live_status || response.subscription.liveStatus
      };
    } else {
      subscriptionData = null;
    }

    // Render billing information
    renderBillingInfo();
  } catch (error) {
    console.error('[Settings] Error loading subscription:', error);
    showToast(handleApiError(error, 'Failed to load subscription info'), 'error');
  }
}

// Render billing information
function renderBillingInfo() {
  const billingContainer = document.getElementById('billing-container');
  if (!billingContainer) return;

  if (!subscriptionData) {
    billingContainer.innerHTML = `
      <div class="info-section">
        <div class="info-label">Current Plan</div>
        <div class="info-value">Free Trial</div>
      </div>
      <div class="info-section">
        <div class="info-label">Status</div>
        <div class="info-value">
          <span class="badge">No active subscription</span>
        </div>
      </div>
      <div style="margin-top: 1.5rem;">
        <button class="btn btn-primary" id="start-trial-btn">Start 14-Day Trial</button>
      </div>
    `;
    return;
  }

  const { status, currentPeriodEnd, cancelAtPeriodEnd, trialEndsAt } = subscriptionData;

  // Determine plan name from priceId
  const planName = getPlanNameFromPriceId(subscriptionData.priceId);

  // Format dates
  const periodEndDate = currentPeriodEnd ? formatDate(currentPeriodEnd) : 'N/A';
  const trialEndDate = trialEndsAt ? formatDate(trialEndsAt) : null;

  // Status badge
  let statusBadge = '';
  if (status === 'active') {
    if (trialEndDate) {
      statusBadge = `<span class="badge success">Trial (ends ${trialEndDate})</span>`;
    } else if (cancelAtPeriodEnd) {
      statusBadge = `<span class="badge warning">Canceling on ${periodEndDate}</span>`;
    } else {
      statusBadge = `<span class="badge success">Active</span>`;
    }
  } else if (status === 'trialing') {
    statusBadge = `<span class="badge info">Trial (ends ${trialEndDate})</span>`;
  } else if (status === 'canceled') {
    statusBadge = `<span class="badge">Canceled</span>`;
  } else if (status === 'past_due') {
    statusBadge = `<span class="badge error">Past Due</span>`;
  } else {
    statusBadge = `<span class="badge">${status}</span>`;
  }

  billingContainer.innerHTML = `
    <div class="info-section">
      <div class="info-label">Current Plan</div>
      <div class="info-value">${planName}</div>
    </div>
    <div class="info-section">
      <div class="info-label">Status</div>
      <div class="info-value">${statusBadge}</div>
    </div>
    <div class="info-section">
      <div class="info-label">Billing Period</div>
      <div class="info-value">Renews on ${periodEndDate}</div>
    </div>
    <div style="margin-top: 1.5rem; display: flex; gap: 1rem;">
      ${!cancelAtPeriodEnd ? `
        <button class="btn btn-outline" id="cancel-subscription-btn">Cancel Subscription</button>
      ` : `
        <button class="btn btn-primary" id="reactivate-subscription-btn">Reactivate Subscription</button>
      `}
      ${status === 'active' && !trialEndDate ? `
        <button class="btn btn-primary" id="manage-billing-btn">Manage Billing</button>
      ` : ''}
    </div>
  `;

  // Re-setup handlers after render
  setupBillingHandlers();
}

// Get plan name from Stripe price ID
function getPlanNameFromPriceId(priceId) {
  if (!priceId) return 'Unknown Plan';

  // Map price IDs to plan names (these would come from env/config in production)
  const planMap = {
    'price_starter': 'Starter Plan',
    'price_pro': 'Pro Plan',
    'price_business': 'Business Plan',
    'price_enterprise': 'Enterprise Plan'
  };

  // Try exact match first
  if (planMap[priceId]) {
    return planMap[priceId];
  }

  // Try partial match
  for (const [key, value] of Object.entries(planMap)) {
    if (priceId.includes(key.replace('price_', ''))) {
      return value;
    }
  }

  return 'Pro Plan'; // Default
}

// Setup billing action handlers
function setupBillingHandlers() {
  // Cancel subscription button
  const cancelBtn = document.getElementById('cancel-subscription-btn');
  if (cancelBtn) {
    cancelBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      await cancelSubscription();
    });
  }

  // Reactivate subscription button
  const reactivateBtn = document.getElementById('reactivate-subscription-btn');
  if (reactivateBtn) {
    reactivateBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      await reactivateSubscription();
    });
  }

  // Manage billing button (opens Stripe portal)
  const manageBtn = document.getElementById('manage-billing-btn');
  if (manageBtn) {
    manageBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      showToast('Stripe Customer Portal not yet implemented', 'info');
      // TODO: Implement Stripe Customer Portal when backend adds endpoint
    });
  }

  // Start trial button
  const startTrialBtn = document.getElementById('start-trial-btn');
  if (startTrialBtn) {
    startTrialBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      await startTrial();
    });
  }

  // Plan upgrade/change buttons
  const planButtons = document.querySelectorAll('[data-plan-price-id]');
  planButtons.forEach(button => {
    button.addEventListener('click', async (e) => {
      e.preventDefault();
      const priceId = button.getAttribute('data-plan-price-id');
      await changePlan(priceId);
    });
  });
}

// Cancel subscription at period end
async function cancelSubscription() {
  const confirmed = confirm(
    'Are you sure you want to cancel your subscription? ' +
    'You will continue to have access until the end of your billing period.'
  );

  if (!confirmed) return;

  try {
    showLoadingOverlay();

    const response = await apiPost('/admin/billing/cancel', {});

    // Reload subscription info
    await loadSubscriptionInfo();

    hideLoadingOverlay();
    showToast(`Subscription will cancel on ${formatDate(response.cancel_at || response.cancelAt)}`, 'success');
  } catch (error) {
    console.error('[Settings] Error canceling subscription:', error);
    hideLoadingOverlay();
    showToast(handleApiError(error, 'Failed to cancel subscription'), 'error');
  }
}

// Reactivate canceled subscription
async function reactivateSubscription() {
  try {
    showLoadingOverlay();

    await apiPost('/admin/billing/reactivate', {});

    // Reload subscription info
    await loadSubscriptionInfo();

    hideLoadingOverlay();
    showToast('Subscription reactivated successfully', 'success');
  } catch (error) {
    console.error('[Settings] Error reactivating subscription:', error);
    hideLoadingOverlay();
    showToast(handleApiError(error, 'Failed to reactivate subscription'), 'error');
  }
}

// Start 14-day trial
async function startTrial() {
  try {
    showLoadingOverlay();

    // Default to Pro plan for trial
    const priceId = 'price_pro'; // This should come from config

    const successUrl = `${window.location.origin}/admin/settings.html?checkout=success`;
    const cancelUrl = `${window.location.origin}/admin/settings.html?checkout=canceled`;

    const response = await apiPost('/admin/billing/checkout', {
      priceId,
      successUrl,
      cancelUrl
    });

    // Redirect to Stripe Checkout
    if (response.url) {
      window.location.href = response.url;
    } else {
      throw new Error('No checkout URL returned');
    }
  } catch (error) {
    console.error('[Settings] Error starting trial:', error);
    hideLoadingOverlay();
    showToast(handleApiError(error, 'Failed to start trial'), 'error');
  }
}

// Change plan (upgrade/downgrade)
async function changePlan(priceId) {
  try {
    showLoadingOverlay();

    const successUrl = `${window.location.origin}/admin/settings.html?upgrade=success`;
    const cancelUrl = `${window.location.origin}/admin/settings.html?upgrade=canceled`;

    const response = await apiPost('/admin/billing/checkout', {
      priceId,
      successUrl,
      cancelUrl
    });

    // Redirect to Stripe Checkout
    if (response.url) {
      window.location.href = response.url;
    } else {
      throw new Error('No checkout URL returned');
    }
  } catch (error) {
    console.error('[Settings] Error changing plan:', error);
    hideLoadingOverlay();
    showToast(handleApiError(error, 'Failed to change plan'), 'error');
  }
}

// Handle checkout return (success/canceled)
function handleCheckoutReturn() {
  const urlParams = new URLSearchParams(window.location.search);

  if (urlParams.has('checkout')) {
    const status = urlParams.get('checkout');
    if (status === 'success') {
      showToast('Subscription activated successfully!', 'success', 5000);
    } else if (status === 'canceled') {
      showToast('Checkout canceled', 'info');
    }
    // Clean URL
    window.history.replaceState({}, document.title, window.location.pathname);
  }

  if (urlParams.has('upgrade')) {
    const status = urlParams.get('upgrade');
    if (status === 'success') {
      showToast('Plan updated successfully!', 'success', 5000);
    } else if (status === 'canceled') {
      showToast('Plan change canceled', 'info');
    }
    // Clean URL
    window.history.replaceState({}, document.title, window.location.pathname);
  }
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
  handleCheckoutReturn();
  initSettings();
});
