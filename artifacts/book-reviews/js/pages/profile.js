import * as api from "/js/api.js";
import { currentUser, setCurrentUser, navigate, showToast, openModal, closeModal, esc, starsHtml, formatDate, avatarInitial, attachStarInput } from "/js/app.js";

export async function renderProfile(container) {
  if (!currentUser) { navigate("/login"); return; }

  container.innerHTML = `<div class="page"><div class="container"><div class="spinner"></div></div></div>`;

  let userData = null, myReviews = [], favorites = [];

  async function load() {
    try {
      [userData, myReviews] = await Promise.all([api.authMe(), api.getMyReviews()]);
      if (userData.favoriteBookIds?.length) {
        const results = await Promise.allSettled(userData.favoriteBookIds.map(id => api.getBook(id)));
        favorites = results.filter(r => r.status === "fulfilled").map(r => r.value);
      } else {
        favorites = [];
      }
    } catch {
      userData = currentUser; myReviews = []; favorites = [];
    }
    render();
  }

  function render() {
    const u = userData || currentUser;
    const roleTitleCase = u.role.charAt(0).toUpperCase() + u.role.slice(1);
    const nameLocked = !!u.nameForcedBy;

    container.innerHTML = `
      <div class="page">
        <div class="container">
          <div class="profile-grid">
            <div>
              <div class="card" style="overflow:hidden;margin-bottom:1.5rem">
                <div class="card-body" style="padding:1.5rem">
                  <div class="profile-card-top"></div>
                  <div class="avatar profile-avatar">${avatarInitial(u.displayName || u.username)}</div>
                  <div class="profile-name">${esc(u.displayName || u.username)}</div>
                  <div class="profile-username">@${esc(u.username)}</div>
                  <div class="profile-badges" style="margin-top:.5rem">
                    <span class="badge ${u.role === "admin" ? "badge-default" : "badge-secondary"}">${roleTitleCase}</span>
                    <span class="badge badge-outline">Joined ${formatDate(u.createdAt)}</span>
                  </div>
                  ${nameLocked
                    ? `<div style="margin-top:.85rem;padding:.5rem .75rem;background:var(--warning-bg);border:1px solid rgba(251,191,36,.3);border-radius:var(--radius);font-size:.8rem;color:var(--warning);text-align:center">🔒 Display name set by admin</div>`
                    : `<button class="btn btn-outline btn-sm btn-full" id="edit-profile-btn" style="margin-top:.85rem">✏️ Edit Profile</button>`}
                </div>
              </div>

              <div class="card">
                <div class="card-header" style="background:var(--bg)">
                  <div class="card-title">❤️ Favorite Books</div>
                </div>
                ${favorites.length
                  ? `<div style="padding:.5rem .75rem;display:flex;flex-direction:column;gap:.25rem">
                      ${favorites.map(b => `
                        <a href="#/books/${esc(b.id)}" style="display:flex;align-items:center;gap:.65rem;padding:.4rem .5rem;border-radius:var(--radius);text-decoration:none;color:inherit;transition:background .15s" class="fav-book-row">
                          <div style="width:28px;height:38px;flex-shrink:0;border-radius:3px;overflow:hidden;border:1px solid var(--border);background:var(--bg);display:flex;align-items:center;justify-content:center;font-size:.7rem">
                            ${b.coverUrl ? `<img src="${esc(b.coverUrl)}" style="width:100%;height:100%;object-fit:cover"/>` : "📖"}
                          </div>
                          <div style="min-width:0;flex:1">
                            <div style="font-size:.85rem;font-weight:600;overflow:hidden;white-space:nowrap;text-overflow:ellipsis">${esc(b.title)}</div>
                            <div style="font-size:.75rem;color:var(--muted);overflow:hidden;white-space:nowrap;text-overflow:ellipsis">${esc(b.author)}</div>
                          </div>
                        </a>`).join("")}
                    </div>`
                  : `<div class="empty-state" style="padding:1.75rem 1rem">
                      <div class="empty-icon" style="font-size:2rem">🤍</div>
                      <p style="font-size:.85rem">Tap ♡ on any book to save it here.</p>
                    </div>`}
              </div>
            </div>

            <div>
              <div class="card">
                <div class="card-header" style="background:var(--bg);display:flex;justify-content:space-between;align-items:center">
                  <div>
                    <div class="card-title">📖 My Reviews</div>
                    <div class="card-desc">${myReviews.length} review${myReviews.length !== 1 ? "s" : ""} total</div>
                  </div>
                  <a href="#/" class="btn btn-outline btn-sm">Browse Books</a>
                </div>
                ${myReviews.length
                  ? myReviews.map(r => reviewRowHtml(r)).join("")
                  : `<div class="empty-state" style="padding:3rem 1rem">
                      <div class="empty-icon">💬</div>
                      <h3>No reviews yet</h3>
                      <p>Browse books and share your thoughts!</p>
                    </div>`}
              </div>
            </div>
          </div>
        </div>
      </div>`;

    container.querySelectorAll(".fav-book-row").forEach(el => {
      el.addEventListener("mouseenter", () => el.style.background = "var(--bg)");
      el.addEventListener("mouseleave", () => el.style.background = "");
    });

    document.getElementById("edit-profile-btn")?.addEventListener("click", () => showEditProfileModal(u, load));
  }

  function reviewRowHtml(r) {
    return `
      <div style="padding:.85rem 1.25rem;border-top:1px solid var(--border)">
        <a href="#/books/${esc(r.bookId)}" style="font-weight:600;font-size:.9rem;color:var(--primary);text-decoration:none;display:block;margin-bottom:.25rem">${esc(r.bookTitle)}</a>
        <div class="text-xs text-muted" style="margin-bottom:.1rem">${esc(r.bookAuthor)}</div>
        <div style="display:flex;align-items:center;gap:.5rem;margin:.3rem 0">
          ${starsHtml(r.rating)}
          <span class="text-xs text-muted">${formatDate(r.createdAt)}</span>
          ${r.editCount > 0 ? `<span class="text-xs text-muted">· ✏️ edited</span>` : ""}
          ${r.hidden ? `<span class="badge badge-outline" style="font-size:.7rem">Hidden</span>` : ""}
          ${r.flagged && !r.hidden ? `<span class="badge badge-warning" style="font-size:.7rem">Flagged</span>` : ""}
        </div>
        <p style="font-size:.85rem;color:var(--muted);margin:0;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical">${esc(r.text)}</p>
      </div>`;
  }

  load();
}

function showEditProfileModal(user, onSuccess) {
  openModal("Edit Profile", `
    <form class="form-stack" id="profile-form">
      <div class="form-group">
        <label class="form-label">Display Name</label>
        <input class="input" name="displayName" value="${esc(user.displayName || "")}" placeholder="How your name appears to others" autocomplete="off"/>
        <div class="form-hint">Leave blank to use your username (@${esc(user.username)})</div>
      </div>
      <div id="profile-err" class="form-error" style="display:none"></div>
      <div style="display:flex;justify-content:flex-end;gap:.5rem">
        <button type="button" class="btn btn-ghost" onclick="App.closeModal()">Cancel</button>
        <button type="submit" class="btn btn-primary">Save Changes</button>
      </div>
    </form>`);

  document.getElementById("profile-form").addEventListener("submit", async e => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const btn = e.target.querySelector("[type=submit]");
    btn.disabled = true; btn.textContent = "Saving…";
    const errEl = document.getElementById("profile-err");
    errEl.style.display = "none";
    try {
      const updated = await api.updateProfile({ displayName: fd.get("displayName") || null });
      if (currentUser) {
        currentUser.displayName = updated.displayName;
        setCurrentUser({ ...currentUser, displayName: updated.displayName });
      }
      showToast("Profile updated!");
      closeModal();
      onSuccess();
    } catch (err) {
      errEl.textContent = err.message;
      errEl.style.display = "";
      btn.disabled = false; btn.textContent = "Save Changes";
    }
  });
}
