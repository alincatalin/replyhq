/**
 * Onboarding functionality for ReplyHQ Admin
 * Handles platform selection and step-by-step SDK setup
 */

let onboardingState = null;
let currentPlatform = 'ios';
let currentStep = 1;
let appConfig = null;

const PLATFORM_TEMPLATES = {
  ios: {
    install: {
      language: 'bash',
      code: `# Build the iOS framework (once per release)
./gradlew :sdk:linkReleaseFrameworkIosArm64 :sdk:linkReleaseFrameworkIosSimulatorArm64

# Then add sdkKit.framework to your Xcode app target`,
      note: 'Use the generated sdkKit.framework in your Xcode project.'
    },
    configure: {
      language: 'swift',
      code: `import UIKit
import sdkKit

@main
class AppDelegate: UIResponder, UIApplicationDelegate {
    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
    ) -> Bool {
        ReplyHQChatSDK.initialize(appId: "{{APP_ID}}", apiKey: "{{API_KEY}}")
        return true
    }
}`
    },
    verifyPrimary: {
      title: 'Identify a user',
      language: 'swift',
      code: `ReplyHQChatSDK.setUser(
    id: "user_123",
    name: "Jamie Lee",
    email: "jamie@example.com",
    attributes: ["plan": "pro"]
) { conversation, error in
    if let error = error {
        print("Error: \(error)")
    }
}`
    },
    verifySecondary: {
      title: 'Open the chat UI',
      language: 'swift',
      code: `import SwiftUI
import sdkKit

struct SupportView: View {
    @State private var showChat = false

    var body: some View {
        Button("Open ReplyHQ") { showChat = true }
            .sheet(isPresented: $showChat) {
                ReplyHQChatView(isPresented: $showChat)
            }
    }
}`
    },
    verifyNote: 'Open the chat and send a test message to confirm everything is wired up.'
  },
  android: {
    install: {
      language: 'gradle',
      code: `repositories {
    mavenLocal()
    mavenCentral()
    google()
}

dependencies {
    implementation("dev.replyhq:sdk:0.1.0")
}`,
      note: 'Make sure mavenLocal() is listed first while testing local SDK builds.'
    },
    configure: {
      language: 'kotlin',
      code: `import android.app.Application
import dev.replyhq.sdk.ChatSDK

class MyApplication : Application() {
    override fun onCreate() {
        super.onCreate()
        ChatSDK.init(
            context = this,
            appId = "{{APP_ID}}",
            apiKey = "{{API_KEY}}"
        )
    }
}`
    },
    verifyPrimary: {
      title: 'Identify a user',
      language: 'kotlin',
      code: `import androidx.lifecycle.lifecycleScope
import dev.replyhq.sdk.ChatSDK
import dev.replyhq.sdk.config.ChatUser
import kotlinx.coroutines.launch

lifecycleScope.launch {
    ChatSDK.setUser(
        ChatUser(
            id = "user_123",
            name = "Jamie Lee",
            email = "jamie@example.com",
            attributes = mapOf("plan" to "pro")
        )
    )
}`
    },
    verifySecondary: {
      title: 'Send a test message',
      language: 'kotlin',
      code: `import androidx.lifecycle.lifecycleScope
import dev.replyhq.sdk.ChatSDK
import kotlinx.coroutines.launch

lifecycleScope.launch {
    ChatSDK.sendMessage("Hello from Android 👋")
}`
    },
    verifyNote: 'After sending, the message should appear in your ReplyHQ inbox.'
  }
};

async function initOnboarding() {
  try {
    enforceAuth();

    await loadOnboardingStatus();
    setupPlatformSelector();
    setupApiKeyRegenerate();
    setupApiKeyModal();
    setupStepControls();

    await applyPlatform(currentPlatform, false);
    setStep(currentStep);

    console.log('[Onboarding] Initialized successfully');
  } catch (error) {
    console.error('[Onboarding] Initialization error:', error);
    showToast('Failed to load onboarding data', 'error');
  }
}

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

    currentPlatform = data.platform || currentPlatform;
  } catch (error) {
    console.error('[Onboarding] Error loading status:', error);
    showToast(handleApiError(error, 'Failed to load onboarding status'), 'error');
  }
}

function setupPlatformSelector() {
  const platformButtons = document.querySelectorAll('[data-platform]');
  platformButtons.forEach(button => {
    button.addEventListener('click', async (e) => {
      e.preventDefault();
      const platform = button.getAttribute('data-platform');
      await applyPlatform(platform, true);
    });
  });
}

async function applyPlatform(platform, persist) {
  if (!platform) return;

  currentPlatform = platform;

  updatePlatformUI(platform);
  if (persist && currentStep === 1) {
    setStep(2);
  }
  await loadPlatformConfig(platform);

  if (persist) {
    try {
      await apiPost('/admin/onboarding/platform', {
        platform
      });
    } catch (error) {
      console.error('[Onboarding] Error saving platform:', error);
      showToast(handleApiError(error, 'Failed to save platform'), 'error');
    }
  }

}

function updatePlatformUI(platform) {
  const platformOptions = document.querySelectorAll('.platform-option');
  const platformPills = document.querySelectorAll('.platform-pill');

  platformOptions.forEach(option => {
    option.classList.toggle('selected', option.getAttribute('data-platform') === platform);
  });

  platformPills.forEach(pill => {
    pill.classList.toggle('active', pill.getAttribute('data-platform') === platform);
  });

  const installLabel = document.getElementById('install-platform-label');
  if (installLabel) {
    installLabel.textContent = platform === 'ios' ? 'iOS' : 'Android';
  }
}

async function loadPlatformConfig(platform) {
  try {
    const response = await apiGet(`/admin/docs/quickstart/${platform}`);
    const { apiKey, ...safeConfig } = response.config || {};
    appConfig = safeConfig;

    updateCredentials(appConfig);
    renderPlatformContent(platform, appConfig);
  } catch (error) {
    console.error('[Onboarding] Error loading platform config:', error);
    showToast(handleApiError(error, 'Failed to load SDK setup'), 'error');
  }
}

function updateCredentials(config) {
  const appIdInput = document.getElementById('app-id-input');
  const apiKeyInput = document.getElementById('api-key-input');
  const apiKeyNote = document.getElementById('api-key-note');

  if (appIdInput) {
    appIdInput.value = config?.appId || '';
  }

  if (apiKeyInput) {
    apiKeyInput.value = config?.maskedApiKey || '';
  }

  if (apiKeyNote) {
    if (config?.apiKeyAvailable) {
      apiKeyNote.textContent = 'Keep this secret. Do not commit it to source control. Generate a new key to reveal it once.';
    } else {
      apiKeyNote.textContent = 'API key hidden. Generate a new key to replace it.';
    }
  }
}

function setupApiKeyRegenerate() {
  const apiKeyRegenerate = document.getElementById('api-key-regenerate');
  if (!apiKeyRegenerate || apiKeyRegenerate.dataset.bound === 'true') return;

  apiKeyRegenerate.dataset.bound = 'true';
  apiKeyRegenerate.addEventListener('click', async () => {
    const originalText = apiKeyRegenerate.textContent || 'Generate new';
    apiKeyRegenerate.disabled = true;
    apiKeyRegenerate.textContent = 'Generating...';
    openApiKeyModal({ loading: true });

    try {
      const data = await apiPost('/admin/onboarding/api-key/rotate', {});
      appConfig = {
        ...(appConfig || {}),
        maskedApiKey: data.maskedApiKey,
        apiKeyAvailable: true,
      };
      updateCredentials(appConfig);
      renderPlatformContent(currentPlatform, appConfig);
      openApiKeyModal({ apiKey: data.apiKey });
      showToast('API key regenerated.', 'success');
    } catch (error) {
      console.error('[Onboarding] Error regenerating API key:', error);
      openApiKeyModal({ error: handleApiError(error, 'Failed to regenerate API key') });
      showToast(handleApiError(error, 'Failed to regenerate API key'), 'error');
    } finally {
      apiKeyRegenerate.disabled = false;
      apiKeyRegenerate.textContent = originalText;
    }
  });
}

function setupApiKeyModal() {
  const modal = document.getElementById('api-key-modal');
  const closeButton = document.getElementById('close-api-key-modal');
  const acknowledgeButton = document.getElementById('ack-api-key-modal');

  if (!modal) return;

  const closeModal = () => {
    const apiKeyEl = document.getElementById('api-key-full');
    if (apiKeyEl) apiKeyEl.textContent = '';
    const statusEl = document.getElementById('api-key-modal-status');
    if (statusEl) {
      statusEl.textContent = '';
      statusEl.classList.remove('error');
      statusEl.classList.add('is-hidden');
    }
    const keyContainer = document.querySelector('#api-key-modal .modal-key');
    if (keyContainer) keyContainer.classList.remove('is-hidden');
    const copyButton = document.getElementById('copy-api-key-full');
    if (copyButton) copyButton.disabled = false;
    modal.classList.remove('active');
  };

  if (closeButton && closeButton.dataset.bound !== 'true') {
    closeButton.dataset.bound = 'true';
    closeButton.addEventListener('click', closeModal);
  }

  if (acknowledgeButton && acknowledgeButton.dataset.bound !== 'true') {
    acknowledgeButton.dataset.bound = 'true';
    acknowledgeButton.addEventListener('click', closeModal);
  }

  modal.addEventListener('click', (event) => {
    if (event.target === modal) {
      closeModal();
    }
  });

  const copyButton = document.getElementById('copy-api-key-full');
  if (copyButton && copyButton.dataset.bound !== 'true') {
    copyButton.dataset.bound = 'true';
    copyButton.addEventListener('click', async () => {
      const apiKey = document.getElementById('api-key-full')?.textContent || '';
      if (!apiKey) return;

      try {
        await navigator.clipboard.writeText(apiKey);
        const originalText = copyButton.textContent;
        copyButton.textContent = 'Copied!';
        copyButton.style.color = 'var(--success)';
        setTimeout(() => {
          copyButton.textContent = originalText;
          copyButton.style.color = '';
        }, 2000);
      } catch (error) {
        console.error('[Onboarding] Failed to copy API key:', error);
        showToast('Failed to copy API key', 'error');
      }
    });
  }
}

function openApiKeyModal({ apiKey, loading = false, error = '' } = {}) {
  const modal = document.getElementById('api-key-modal');
  const apiKeyEl = document.getElementById('api-key-full');
  const statusEl = document.getElementById('api-key-modal-status');
  const keyContainer = document.querySelector('#api-key-modal .modal-key');
  const copyButton = document.getElementById('copy-api-key-full');
  if (!modal || !apiKeyEl || !statusEl || !keyContainer || !copyButton) return;

  if (loading) {
    statusEl.textContent = 'Generating a new API key...';
    statusEl.classList.remove('error', 'is-hidden');
    keyContainer.classList.add('is-hidden');
    copyButton.disabled = true;
    apiKeyEl.textContent = '';
  } else if (error) {
    statusEl.textContent = error;
    statusEl.classList.add('error');
    statusEl.classList.remove('is-hidden');
    keyContainer.classList.add('is-hidden');
    copyButton.disabled = true;
    apiKeyEl.textContent = '';
  } else {
    statusEl.textContent = '';
    statusEl.classList.remove('error');
    statusEl.classList.add('is-hidden');
    keyContainer.classList.remove('is-hidden');
    copyButton.disabled = false;
    apiKeyEl.textContent = apiKey || '';
  }

  modal.classList.add('active');
}

function renderPlatformContent(platform, config) {
  const template = PLATFORM_TEMPLATES[platform];
  if (!template) return;

  const installCode = replacePlaceholders(template.install.code, config);
  const configureCode = replacePlaceholders(template.configure.code, config);
  const verifyPrimaryCode = replacePlaceholders(template.verifyPrimary.code, config);
  const verifySecondaryCode = replacePlaceholders(template.verifySecondary.code, config);

  renderCodeBlock('install-code', template.install.language, installCode);
  setNote('install-note', template.install.note);

  renderCodeBlock('configure-code', template.configure.language, configureCode);

  renderTitledBlock('verify-code-primary', template.verifyPrimary.title, template.verifyPrimary.language, verifyPrimaryCode);
  renderTitledBlock('verify-code-secondary', template.verifySecondary.title, template.verifySecondary.language, verifySecondaryCode);
  setNote('verify-note', template.verifyNote);

  setupCopyButtons();
  setupCopyInputs();
}

function replacePlaceholders(code, config) {
  const appId = config?.appId || 'YOUR_APP_ID';
  const apiKey = config?.maskedApiKey || 'YOUR_API_KEY';
  return code.replace(/\{\{APP_ID\}\}/g, appId).replace(/\{\{API_KEY\}\}/g, apiKey);
}

function renderCodeBlock(targetId, language, code) {
  const container = document.getElementById(targetId);
  if (!container) return;

  container.innerHTML = `
    <div class="code-block">
      <div class="code-header">
        <span class="code-lang">${language}</span>
        <button class="copy-btn" data-code="${escapeHtml(code.trim())}">Copy</button>
      </div>
      <pre><code>${escapeHtml(code.trim())}</code></pre>
    </div>
  `;
}

function renderTitledBlock(targetId, title, language, code) {
  const container = document.getElementById(targetId);
  if (!container) return;

  container.innerHTML = `
    <div style="margin-bottom: 1rem; font-weight: 600;">${escapeHtml(title)}</div>
    <div class="code-block">
      <div class="code-header">
        <span class="code-lang">${language}</span>
        <button class="copy-btn" data-code="${escapeHtml(code.trim())}">Copy</button>
      </div>
      <pre><code>${escapeHtml(code.trim())}</code></pre>
    </div>
  `;
}

function setNote(targetId, text) {
  const el = document.getElementById(targetId);
  if (!el) return;
  el.textContent = text;
}

function setupStepControls() {
  const prevBtn = document.getElementById('prev-step');
  const nextBtn = document.getElementById('next-step');

  if (prevBtn) {
    prevBtn.addEventListener('click', (e) => {
      e.preventDefault();
      setStep(Math.max(1, currentStep - 1));
    });
  }

  if (nextBtn) {
    nextBtn.addEventListener('click', (e) => {
      e.preventDefault();
      setStep(Math.min(4, currentStep + 1));
    });
  }
}

function setStep(step) {
  currentStep = step;

  const steps = document.querySelectorAll('.setup-step');
  steps.forEach(section => {
    const sectionStep = Number(section.getAttribute('data-step'));
    section.classList.toggle('active', sectionStep === step);
  });

  const stepDots = document.querySelectorAll('.progress-steps .step');
  stepDots.forEach(dot => {
    const dotStep = Number(dot.getAttribute('data-step'));
    dot.classList.toggle('active', dotStep === step);
    dot.classList.toggle('completed', dotStep < step);
  });

  const progressFill = document.getElementById('progress-line-fill');
  if (progressFill) {
    const percent = ((step - 1) / 3) * 100;
    progressFill.style.width = `${percent}%`;
  }

  const prevBtn = document.getElementById('prev-step');
  const nextBtn = document.getElementById('next-step');

  if (prevBtn) {
    prevBtn.disabled = step === 1;
  }

  if (nextBtn) {
    nextBtn.disabled = step === 4;
    nextBtn.textContent = step === 4 ? 'Done' : 'Next →';
  }

  const container = document.querySelector('.setup-container');
  if (container) {
    container.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

function setupCopyButtons() {
  const copyButtons = document.querySelectorAll('.copy-btn:not([data-copy-target]):not([data-skip-copy])');

  copyButtons.forEach(button => {
    button.addEventListener('click', async (e) => {
      e.preventDefault();

      const code = button.getAttribute('data-code') ||
                   button.closest('.code-block')?.querySelector('code')?.textContent;

      if (!code) return;

      try {
        await navigator.clipboard.writeText(code);
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

function setupCopyInputs() {
  const copyButtons = document.querySelectorAll('[data-copy-target]');
  copyButtons.forEach(button => {
    button.addEventListener('click', async (e) => {
      e.preventDefault();
      const targetId = button.getAttribute('data-copy-target');
      const input = targetId ? document.getElementById(targetId) : null;
      if (!input) return;

      try {
        await navigator.clipboard.writeText(input.value);
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

// Initialize on page load
document.addEventListener('DOMContentLoaded', initOnboarding);
