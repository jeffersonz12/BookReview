import * as api from "/js/api.js";
import { setCurrentUser, navigate, showToast, esc } from "/js/app.js";

export async function renderLogin(container) {
  container.innerHTML = `
    <div class="auth-page">
      <div class="auth-card card">
        <div class="card-header">
          <div class="auth-icon">📚</div>
          <h1>Welcome Back</h1>
          <p>Log in to continue reading and reviewing.</p>
        </div>
        <div class="card-body">
          <div id="auth-error" style="display:none" class="form-error" style="margin-bottom:1rem"></div>
          <form class="form-stack" id="login-form">
            <div class="form-group">
              <label class="form-label" for="username">Username</label>
              <input class="input" id="username" name="username" placeholder="Enter your username" autocomplete="username" required />
            </div>
            <div class="form-group">
              <label class="form-label" for="password">Password</label>
              <input class="input" id="password" name="password" type="password" placeholder="••••••••" autocomplete="current-password" required />
            </div>
            <div id="auth-error" class="form-error" style="display:none"></div>
            <button class="btn btn-primary btn-full" type="submit" id="submit-btn">Log in</button>
          </form>
        </div>
        <div class="card-footer" style="justify-content:center">
          <span class="text-sm text-muted">Don't have an account?
            <a href="#/register" class="text-sm" style="color:var(--primary);font-weight:500">Sign up</a>
          </span>
        </div>
      </div>
    </div>`;

  const form = document.getElementById("login-form");
  const errEl = document.getElementById("auth-error");
  const btn = document.getElementById("submit-btn");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    errEl.style.display = "none";
    btn.disabled = true;
    btn.textContent = "Logging in…";
    try {
      const { user } = await api.authLogin({
        username: form.username.value.trim(),
        password: form.password.value,
      });
      setCurrentUser(user);
      navigate("/");
    } catch (err) {
      errEl.textContent = err.message || "Invalid credentials.";
      errEl.style.display = "block";
      btn.disabled = false;
      btn.textContent = "Log in";
    }
  });
}

export async function renderRegister(container) {
  container.innerHTML = `
    <div class="auth-page">
      <div class="auth-card card">
        <div class="card-header">
          <div class="auth-icon">📖</div>
          <h1>Join the Library</h1>
          <p>Create an account to share your thoughts on books.</p>
        </div>
        <div class="card-body">
          <form class="form-stack" id="register-form">
            <div class="form-group">
              <label class="form-label" for="username">Username <span class="required">*</span></label>
              <input class="input" id="username" name="username" placeholder="student123" autocomplete="username" required minlength="2" />
            </div>
            <div class="form-group">
              <label class="form-label" for="displayName">Display Name</label>
              <input class="input" id="displayName" name="displayName" placeholder="Jane Doe" />
              <span class="form-hint">How you'll appear to others (optional)</span>
            </div>
            <div class="form-group">
              <label class="form-label" for="password">Password <span class="required">*</span></label>
              <input class="input" id="password" name="password" type="password" placeholder="••••••••" autocomplete="new-password" required minlength="6" />
            </div>
            <div id="auth-error" class="form-error" style="display:none"></div>
            <button class="btn btn-primary btn-full" type="submit" id="submit-btn">Create Account</button>
          </form>
        </div>
        <div class="card-footer" style="justify-content:center">
          <span class="text-sm text-muted">Already have an account?
            <a href="#/login" class="text-sm" style="color:var(--primary);font-weight:500">Log in</a>
          </span>
        </div>
      </div>
    </div>`;

  const form = document.getElementById("register-form");
  const errEl = document.getElementById("auth-error");
  const btn = document.getElementById("submit-btn");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    errEl.style.display = "none";
    btn.disabled = true;
    btn.textContent = "Creating account…";
    try {
      const { user } = await api.authRegister({
        username: form.username.value.trim(),
        displayName: form.displayName.value.trim() || undefined,
        password: form.password.value,
      });
      setCurrentUser(user);
      navigate("/");
    } catch (err) {
      errEl.textContent = err.message || "Failed to create account.";
      errEl.style.display = "block";
      btn.disabled = false;
      btn.textContent = "Create Account";
    }
  });
}