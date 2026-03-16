function createAuthModal() {
  if (document.getElementById('authModal')) return;

  const modal = document.createElement('div');
  modal.id = 'authModal';
  modal.innerHTML = `
    <div class="auth-overlay" onclick="closeAuthModal()"></div>
    <div class="auth-dialog">
      <button class="auth-close" onclick="closeAuthModal()">&times;</button>

      <div id="authFormView">
        <div class="auth-header">
          <h2 id="authTitle">Sign In</h2>
          <p id="authSubtitle">Access your VideoClipFlow account</p>
        </div>
        <button class="auth-google-btn" onclick="handleGoogleSignIn()">
          <svg width="18" height="18" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>
          Continue with Google
        </button>
        <div class="auth-divider">
          <span>or use email</span>
        </div>
        <form id="authForm" onsubmit="handleAuth(event)">
          <div class="auth-field">
            <label for="authEmail">Email</label>
            <input type="email" id="authEmail" placeholder="you@email.com" required autocomplete="email">
          </div>
          <div class="auth-field">
            <label for="authPassword">Password</label>
            <input type="password" id="authPassword" placeholder="At least 6 characters" required minlength="6" autocomplete="current-password">
          </div>
          <p id="authError" class="auth-error" style="display:none"></p>
          <button type="submit" class="auth-submit" id="authSubmitBtn">Sign In</button>
        </form>
        <div class="auth-switch">
          <span id="authSwitchText">Don't have an account?</span>
          <button onclick="toggleAuthMode()" id="authSwitchBtn">Sign Up</button>
        </div>
      </div>

      <div id="authConfirmView" style="display:none; text-align:center;">
        <div style="font-size:2.5rem; margin-bottom:16px;">&#9993;</div>
        <h2 style="font-size:1.3rem; font-weight:800; margin-bottom:8px;">Check your email</h2>
        <p id="confirmEmail" style="color:var(--text-muted); font-size:0.95rem; margin-bottom:20px;"></p>
        <div style="background:var(--bg); border:1px solid var(--border); border-radius:8px; padding:16px; margin-bottom:20px; text-align:left;">
          <p style="font-size:0.85rem; color:var(--text-muted); line-height:1.6;">
            <strong style="color:var(--text);">1.</strong> Open the email from VideoClipFlow<br>
            <strong style="color:var(--text);">2.</strong> Click the confirmation link<br>
            <strong style="color:var(--text);">3.</strong> Come back here and sign in
          </p>
        </div>
        <button class="auth-submit" onclick="showSignInAfterConfirm()">I've Confirmed — Sign In</button>
        <p style="font-size:0.8rem; color:var(--text-muted); margin-top:12px;">
          Didn't get it? Check spam, or
          <button onclick="resendConfirmation()" id="resendBtn" style="background:none; border:none; color:var(--primary); font-weight:700; cursor:pointer; font-family:var(--font); font-size:0.8rem;">resend email</button>
        </p>
      </div>

    </div>
  `;
  document.body.appendChild(modal);
}

let authMode = 'signin';
let pendingEmail = '';

function openAuthModal(mode, reason) {
  createAuthModal();
  authMode = mode || 'signin';
  showFormView();
  updateAuthUI(reason);
  document.getElementById('authModal').classList.add('open');
  document.getElementById('authEmail').focus();
}

function closeAuthModal() {
  const modal = document.getElementById('authModal');
  if (modal) modal.classList.remove('open');
}

function showFormView() {
  document.getElementById('authFormView').style.display = '';
  document.getElementById('authConfirmView').style.display = 'none';
}

function showConfirmView(email) {
  document.getElementById('authFormView').style.display = 'none';
  document.getElementById('authConfirmView').style.display = '';
  document.getElementById('confirmEmail').innerHTML =
    'We sent a confirmation link to<br><strong style="color:var(--text);">' + escapeHtmlModal(email) + '</strong>';
}

function showSignInAfterConfirm() {
  authMode = 'signin';
  showFormView();
  updateAuthUI();
  const emailInput = document.getElementById('authEmail');
  if (pendingEmail) emailInput.value = pendingEmail;
  document.getElementById('authPassword').value = '';
  document.getElementById('authPassword').focus();
}

function toggleAuthMode() {
  authMode = authMode === 'signin' ? 'signup' : 'signin';
  showFormView();
  updateAuthUI();
}

function updateAuthUI(reason) {
  const title = document.getElementById('authTitle');
  const subtitle = document.getElementById('authSubtitle');
  const submitBtn = document.getElementById('authSubmitBtn');
  const switchText = document.getElementById('authSwitchText');
  const switchBtn = document.getElementById('authSwitchBtn');
  const errorEl = document.getElementById('authError');

  errorEl.style.display = 'none';

  if (authMode === 'signin') {
    title.textContent = 'Sign In';
    subtitle.textContent = 'Access your VideoClipFlow account';
    submitBtn.textContent = 'Sign In';
    switchText.textContent = "Don't have an account?";
    switchBtn.textContent = 'Sign Up';
  } else {
    title.textContent = 'Quick Sign Up';
    subtitle.textContent = reason === 'free_try'
      ? 'Create a free account to use your free extraction'
      : 'Start extracting content in seconds';
    submitBtn.textContent = 'Create Account';
    switchText.textContent = 'Already have an account?';
    switchBtn.textContent = 'Sign In';
  }
}

async function handleAuth(e) {
  e.preventDefault();
  const email = document.getElementById('authEmail').value.trim();
  const password = document.getElementById('authPassword').value;
  const submitBtn = document.getElementById('authSubmitBtn');
  const errorEl = document.getElementById('authError');

  submitBtn.disabled = true;
  submitBtn.textContent = authMode === 'signin' ? 'Signing in...' : 'Creating account...';
  errorEl.style.display = 'none';

  if (authMode === 'signup' && typeof validateEmail === 'function') {
    const check = validateEmail(email);
    if (!check.valid) {
      errorEl.textContent = check.reason;
      errorEl.style.display = 'block';
      submitBtn.disabled = false;
      submitBtn.textContent = 'Create Account';
      return;
    }
  }

  try {
    if (authMode === 'signup') {
      const data = await signUp(email, password);
      pendingEmail = email;

      if (data.user && data.user.email_confirmed_at && !data.session) {
        // Auto-confirmed but no session — sign in automatically
        await signIn(email, password);
        closeAuthModal();
        if (typeof onAuthComplete === 'function') onAuthComplete();
        return;
      }

      if (data.user && !data.session && !data.user.email_confirmed_at) {
        // Email confirmation required
        showConfirmView(email);
        submitBtn.disabled = false;
        submitBtn.textContent = 'Create Account';
        return;
      }

      if (data.session) {
        currentUser = data.session.user;
      }
      closeAuthModal();
      if (typeof onAuthComplete === 'function') onAuthComplete();
    } else {
      await signIn(email, password);
      closeAuthModal();
      if (typeof onAuthComplete === 'function') onAuthComplete();
    }
  } catch (err) {
    errorEl.textContent = err.message || 'Something went wrong';
    errorEl.style.display = 'block';
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = authMode === 'signin' ? 'Sign In' : 'Create Account';
  }
}

async function resendConfirmation() {
  if (!pendingEmail || !sbClient) return;
  const btn = document.getElementById('resendBtn');
  btn.textContent = 'Sending...';
  try {
    await sbClient.auth.resend({ type: 'signup', email: pendingEmail });
    btn.textContent = 'Sent!';
    setTimeout(() => { btn.textContent = 'resend email'; }, 3000);
  } catch (err) {
    btn.textContent = 'Failed — try again';
    setTimeout(() => { btn.textContent = 'resend email'; }, 3000);
  }
}

async function handleGoogleSignIn() {
  try {
    await signInWithGoogle();
  } catch (err) {
    const errorEl = document.getElementById('authError');
    if (errorEl) {
      errorEl.textContent = err.message || 'Google sign-in failed';
      errorEl.style.display = 'block';
    }
  }
}

function escapeHtmlModal(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
