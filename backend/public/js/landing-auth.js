const modal = document.getElementById('auth-modal');
const modalTabs = document.querySelectorAll('.modal-tab');
const loginForm = document.getElementById('login-form');
const signupForm = document.getElementById('signup-form');
const loginError = document.getElementById('login-error');
const signupError = document.getElementById('signup-error');
const loginSubmit = document.getElementById('login-submit');
const signupSubmit = document.getElementById('signup-submit');

function openAuthModal(mode) {
  if (!modal) return;
  modal.classList.add('active');
  switchTab(mode || 'login');
}

function closeAuthModal() {
  if (!modal) return;
  modal.classList.remove('active');
}

function switchTab(mode) {
  modalTabs.forEach((tab) => {
    tab.classList.toggle('active', tab.dataset.tab === mode);
  });
  if (loginForm) loginForm.classList.toggle('active', mode === 'login');
  if (signupForm) signupForm.classList.toggle('active', mode === 'signup');
  if (loginError) loginError.classList.remove('show');
  if (signupError) signupError.classList.remove('show');
}

document.querySelectorAll('.auth-trigger').forEach((trigger) => {
  trigger.addEventListener('click', (event) => {
    event.preventDefault();
    openAuthModal(trigger.dataset.auth);
  });
});

modalTabs.forEach((tab) => {
  tab.addEventListener('click', () => switchTab(tab.dataset.tab));
});

const closeButton = document.getElementById('close-auth-modal');
if (closeButton) {
  closeButton.addEventListener('click', closeAuthModal);
}

if (modal) {
  modal.addEventListener('click', (event) => {
    if (event.target === modal) {
      closeAuthModal();
    }
  });
}

if (loginForm) {
  loginForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (loginError) loginError.classList.remove('show');
    if (loginSubmit) {
      loginSubmit.disabled = true;
      loginSubmit.textContent = 'Signing in...';
    }

    const email = document.getElementById('login-email')?.value.trim();
    const password = document.getElementById('login-password')?.value;

    try {
      await login(email, password);
      window.location.href = '/admin/dashboard.html';
    } catch (error) {
      if (loginError) {
        loginError.textContent = error.message || 'Login failed';
        loginError.classList.add('show');
      }
    } finally {
      if (loginSubmit) {
        loginSubmit.disabled = false;
        loginSubmit.textContent = 'Sign in';
      }
    }
  });
}

if (signupForm) {
  signupForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (signupError) signupError.classList.remove('show');
    if (signupSubmit) {
      signupSubmit.disabled = true;
      signupSubmit.textContent = 'Creating...';
    }

    const email = document.getElementById('signup-email')?.value.trim();
    const password = document.getElementById('signup-password')?.value;
    const appName = document.getElementById('signup-app-name')?.value.trim();

    try {
      const response = await fetch('/admin/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, appName }),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Signup failed' }));
        throw new Error(error.error || error.message || 'Signup failed');
      }

      await login(email, password);
      window.location.href = '/admin/dashboard.html';
    } catch (error) {
      if (signupError) {
        signupError.textContent = error.message || 'Signup failed';
        signupError.classList.add('show');
      }
    } finally {
      if (signupSubmit) {
        signupSubmit.disabled = false;
        signupSubmit.textContent = 'Create admin account';
      }
    }
  });
}
