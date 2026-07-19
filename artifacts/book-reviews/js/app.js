import * as api from "/js/api.js";
import { renderLogin, renderRegister } from "/js/pages/auth.js";
import { renderCatalog } from "/js/pages/catalog.js";
import { renderBookDetail } from "/js/pages/book-detail.js";
import { renderProfile } from "/js/pages/profile.js";
import { renderAdmin } from "/js/pages/admin.js";
import { renderClasses } from "/js/pages/classes.js";

export let currentUser = null;
let unreadCount = 0;
let notifPollTimer = null;

export function setCurrentUser(u) {
  currentUser = u;
  unreadCount = 0;
  if (u && u.role !== "admin") startNotifPolling();
  else stopNotifPolling();
  renderNav();
}

const routes = [
  [/^(#\/?$|#\/catalog)/, () => renderCatalog(main())],
  [/^#\/login$/, () => renderLogin(main())],
  [/^#\/register$/, () => renderRegister(main())],
  [/^#\/books\/([^/]+)/, (m) => renderBookDetail(main(), m[1])],
  [/^#\/profile$/, () => renderProfile(main())],
  [/^#\/classes/, () => renderClasses(main())],
  [/^#\/admin/, () => renderAdmin(main(), window.location.hash)],
];

function main() { return document.getElementById("main"); }

async function route() {
  const hash = window.location.hash || "#/";
  for (const [pattern, fn] of routes) {
    const m = hash.match(pattern);
    if (m) { await fn(m); return; }
  }
  main().innerHTML = `<div class="page"><div class="container"><div class="empty-state">
    <div class="empty-icon">🔍</div><h3>Page not found</h3>
    <a href="#/" class="btn btn-primary mt-2">Go Home</a>
  </div></div></div>`;
}

export function navigate(path) { window.location.hash = path; }

export function showToast(message, type = "success") {
  const container = document.getElementById("toast-container");
  const toast = document.createElement("div");
  toast.className = `toast${type !== "success" ? ` toast-${type}` : ""}`;
  toast.textContent = message;
  container.appendChild(toast);
  requestAnimationFrame(() => { requestAnimationFrame(() => toast.classList.add("show")); });
  setTimeout(() => { toast.classList.remove("show"); setTimeout(() => toast.remove(), 350); }, 3200);
}

export function openModal(title, html, large = false) {
  document.getElementById("modal-title").textContent = title;
  document.getElementById("modal-content").innerHTML = html;
  const box = document.querySelector(".modal-box");
  box.classList.toggle("modal-lg", large);
  document.getElementById("modal-overlay").classList.remove("hidden");
}
export function closeModal() {
  document.getElementById("modal-overlay").classList.add("hidden");
}

export function showConfirm({ title = "Are you sure?", body = "", confirmLabel = "Confirm", cancelLabel = "Cancel", destructive = false } = {}) {
  return new Promise(resolve => {
    openModal(title, `
      <div class="form-stack">
        ${body ? `<p style="color:var(--muted);font-size:.9rem;line-height:1.65;white-space:pre-line">${esc(body)}</p>` : ""}
        <div style="display:flex;justify-content:flex-end;gap:.5rem;padding-top:.25rem">
          <button class="btn btn-ghost" id="confirm-cancel-btn">${esc(cancelLabel)}</button>
          <button class="btn ${destructive ? "btn-destructive" : "btn-primary"}" id="confirm-ok-btn">${esc(confirmLabel)}</button>
        </div>
      </div>`);
    document.getElementById("confirm-cancel-btn").addEventListener("click", () => { closeModal(); resolve(false); });
    document.getElementById("confirm-ok-btn").addEventListener("click", () => { closeModal(); resolve(true); });
  });
}

export function esc(str) {
  return String(str ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
export function starsHtml(rating, size = "sm") {
  const fs = size === "lg" ? "1.1rem" : ".85rem";
  let h = `<span class="stars" style="font-size:${fs}">`;
  for (let i = 1; i <= 5; i++) h += `<span class="star${i <= rating ? " filled" : ""}">★</span>`;
  return h + "</span>";
}
export function formatDate(iso) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
export function avatarInitial(name) { return (name || "?").charAt(0).toUpperCase(); }
export function debounce(fn, ms) {
  let t; return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}
export function requireAuth() {
  if (!currentUser) { navigate("/login"); return false; }
  return true;
}
export function requireAdmin() {
  if (!currentUser) { navigate("/login"); return false; }
  if (currentUser.role !== "admin") { navigate("/"); return false; }
  return true;
}

export function attachStarInput(container, onChange, initial = 0) {
  let selected = initial;
  const wrap = container.querySelector(".star-input");
  if (!wrap) return;
  const stars = wrap.querySelectorAll(".star");
  function render(hover) {
    stars.forEach((s, i) => {
      s.classList.toggle("filled", i < (hover ?? selected));
      s.classList.toggle("hovered", hover !== undefined && i < hover);
    });
  }
  render();
  stars.forEach((s, i) => {
    s.addEventListener("mouseenter", () => render(i + 1));
    s.addEventListener("mouseleave", () => render());
    s.addEventListener("click", () => { selected = i + 1; render(); onChange(selected); });
  });
}

function startNotifPolling() {
  stopNotifPolling();
  updateUnreadCount();
  notifPollTimer = setInterval(updateUnreadCount, 30000);
}

function stopNotifPolling() {
  if (notifPollTimer) { clearInterval(notifPollTimer); notifPollTimer = null; }
}

async function updateUnreadCount() {
  if (!currentUser || currentUser.role === "admin") return;
  try {
    const { count } = await api.getUnreadNotifCount();
    unreadCount = count;
    const badge = document.getElementById("notif-badge");
    if (badge) {
      badge.textContent = count > 9 ? "9+" : String(count);
      badge.style.display = count > 0 ? "" : "none";
    }
  } catch {}
}

async function toggleNotifDropdown() {
  const existing = document.getElementById("notif-dropdown-panel");
  if (existing) { existing.remove(); return; }

  const wrap = document.getElementById("nav-notif-wrap");
  if (!wrap) return;

  const panel = document.createElement("div");
  panel.className = "notif-dropdown";
  panel.id = "notif-dropdown-panel";
  panel.innerHTML = `
    <div class="notif-dropdown-header">
      <span>Notifications</span>
      <div class="spinner" style="width:14px;height:14px;border-width:2px;margin:0;flex-shrink:0"></div>
    </div>`;
  wrap.appendChild(panel);

  let notifs = [];
  try { notifs = await api.getNotifications(); } catch {}
  if (!document.getElementById("notif-dropdown-panel")) return;

  const hasUnread = notifs.some(n => !n.read);

  panel.innerHTML = `
    <div class="notif-dropdown-header">
      <span>Notifications</span>
      <div style="display:flex;gap:.5rem;align-items:center">
        ${hasUnread ? `<button class="notif-mark-all-btn" id="notif-mark-all-btn">Mark all read</button>` : ""}
        ${notifs.length ? `<button class="notif-mark-all-btn" id="notif-clear-all-btn" style="color:var(--muted)">Clear all</button>` : ""}
      </div>
    </div>
    <div class="notif-list" id="notif-list">
      ${notifs.length ? notifs.slice(0, 25).map(n => `
        <div class="notif-item${n.read ? "" : " unread"}" data-id="${esc(n.id)}" data-link="${esc(n.link || "")}">
          <div style="display:flex;align-items:flex-start;gap:.4rem">
            <div style="flex:1;min-width:0">
              <div class="notif-title">${esc(n.title)}</div>
              ${n.body ? `<div class="notif-body">${esc(n.body)}</div>` : ""}
              <div class="notif-time">${formatDate(n.createdAt)}</div>
            </div>
            <button class="notif-delete-btn" data-id="${esc(n.id)}" title="Delete" aria-label="Delete notification">×</button>
          </div>
        </div>`).join("") : `<div class="notif-empty">No notifications yet</div>`}
    </div>`;

  panel.querySelectorAll(".notif-item").forEach(item => {
    item.addEventListener("click", async (e) => {
      if (e.target.closest(".notif-delete-btn")) return;
      const { id, link } = item.dataset;
      panel.remove();
      try { await api.markNotifRead(id); } catch {}
      await updateUnreadCount();
      if (link) navigate(link.replace(/^#/, ""));
    });
  });

  panel.querySelectorAll(".notif-delete-btn").forEach(btn => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const id = btn.dataset.id;
      btn.disabled = true;
      try { await api.deleteNotif(id); } catch {}
      const item = panel.querySelector(`.notif-item[data-id="${id}"]`);
      item?.remove();
      await updateUnreadCount();
      const list = panel.querySelector(".notif-list");
      if (list && !list.querySelector(".notif-item")) {
        list.innerHTML = `<div class="notif-empty">No notifications yet</div>`;
        document.getElementById("notif-clear-all-btn")?.remove();
        document.getElementById("notif-mark-all-btn")?.remove();
      }
    });
  });

  document.getElementById("notif-mark-all-btn")?.addEventListener("click", async (e) => {
    e.stopPropagation();
    try { await api.markAllNotifsRead(); } catch {}
    unreadCount = 0;
    const badge = document.getElementById("notif-badge");
    if (badge) badge.style.display = "none";
    panel.remove();
  });

  document.getElementById("notif-clear-all-btn")?.addEventListener("click", async (e) => {
    e.stopPropagation();
    try { await api.deleteAllNotifs(); } catch {}
    unreadCount = 0;
    const badge = document.getElementById("notif-badge");
    if (badge) badge.style.display = "none";
    panel.remove();
  });

  function onOutside(e) {
    if (!wrap.contains(e.target)) {
      document.getElementById("notif-dropdown-panel")?.remove();
      document.removeEventListener("click", onOutside, true);
    }
  }
  setTimeout(() => document.addEventListener("click", onOutside, true), 0);
}

function renderNav() {
  const name = currentUser ? (currentUser.displayName || currentUser.username) : null;
  document.getElementById("nav").innerHTML = `
    <div class="nav-inner">
      <a href="#/" class="nav-brand">📚 Book Review</a>
      <div class="nav-links">
        ${currentUser ? `
          ${currentUser.role !== "admin" ? `
            <div class="nav-notif-wrap" id="nav-notif-wrap">
              <button class="nav-notif-btn" id="nav-notif-btn" title="Notifications" aria-label="Notifications">
                🔔
                <span class="nav-notif-badge" id="notif-badge" style="${unreadCount > 0 ? "" : "display:none"}">${unreadCount > 9 ? "9+" : unreadCount}</span>
              </button>
            </div>
          ` : ""}
          <div class="nav-user-menu" id="nav-user-menu">
            <button class="nav-user-btn" id="nav-user-btn" aria-haspopup="true" aria-expanded="false">
              ${esc(name)} <span class="nav-chevron">▾</span>
            </button>
            <div class="nav-dropdown" id="nav-dropdown" role="menu">
              <a href="#/profile" class="nav-dropdown-item" role="menuitem">👤 Profile</a>
              <a href="#/classes" class="nav-dropdown-item" role="menuitem">🏫 Classes</a>
              ${currentUser.role === "admin" ? `<a href="#/admin" class="nav-dropdown-item" role="menuitem">⚙️ Admin</a>` : ""}
              <div class="nav-dropdown-divider"></div>
              <button class="nav-dropdown-item danger" id="logout-btn" role="menuitem">🚪 Log out</button>
            </div>
          </div>
        ` : `
          <a href="#/login" class="btn btn-outline btn-sm">Log in</a>
          <a href="#/register" class="btn btn-primary btn-sm">Sign up</a>
        `}
      </div>
    </div>`;

  document.getElementById("nav-notif-btn")?.addEventListener("click", (e) => {
    e.stopPropagation();
    document.getElementById("nav-dropdown")?.classList.remove("open");
    toggleNotifDropdown();
  });

  const userBtn = document.getElementById("nav-user-btn");
  const userDropdown = document.getElementById("nav-dropdown");
  if (userBtn && userDropdown) {
    userBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      document.getElementById("notif-dropdown-panel")?.remove();
      const open = userDropdown.classList.toggle("open");
      userBtn.setAttribute("aria-expanded", open);
    });
  }

  document.addEventListener("click", () => {
    document.getElementById("nav-dropdown")?.classList.remove("open");
  });

  document.getElementById("logout-btn")?.addEventListener("click", async () => {
    try { await api.authLogout(); } catch {}
    setCurrentUser(null);
    navigate("/login");
  });
}

async function init() {
  try { currentUser = await api.authMe(); } catch { currentUser = null; }
  if (currentUser && currentUser.role !== "admin") startNotifPolling();
  renderNav();
  window.addEventListener("hashchange", route);
  route();
}

window.App = { closeModal };
init();
