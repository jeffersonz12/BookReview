import * as api from "/js/api.js";
import { currentUser, navigate, showToast, openModal, closeModal, showConfirm, esc, starsHtml, formatDate, avatarInitial, debounce, attachStarInput } from "/js/app.js";

const SECTIONS = [
  { hash: "#/admin",                 label: "📊 Dashboard",        fn: renderDashboard },
  { hash: "#/admin/books",           label: "📚 Books",             fn: renderBooks },
  { hash: "#/admin/reviews",         label: "💬 Reviews",           fn: renderReviews },
  { hash: "#/admin/deleted-reviews", label: "🗑️ Deleted Reviews",   fn: renderDeletedReviews },
  { hash: "#/admin/reports",         label: "🚩 Reports",           fn: renderReports },
  { hash: "#/admin/filter-words",    label: "🛡️ Filter Words",      fn: renderFilterWords },
  { hash: "#/admin/users",           label: "👥 Users",             fn: renderUsers },
];

export async function renderAdmin(container, hash) {
  if (!currentUser || currentUser.role !== "admin") { navigate("/"); return; }
  const section = SECTIONS.find(s => hash === s.hash) || SECTIONS[0];

  container.innerHTML = `
    <div class="page">
      <div class="container">
        <div class="admin-layout">
          <aside class="admin-sidebar">
            <h3>Admin Panel</h3>
            ${SECTIONS.map(s => `
              <button class="admin-nav-link${s.hash === section.hash ? " active" : ""}" data-hash="${esc(s.hash)}">${s.label}</button>
            `).join("")}
          </aside>
          <div id="admin-content"><div class="spinner"></div></div>
        </div>
      </div>
    </div>`;

  document.querySelectorAll(".admin-nav-link").forEach(btn => {
    btn.addEventListener("click", () => { navigate(btn.dataset.hash.replace(/^#/, "")); });
  });

  await section.fn(document.getElementById("admin-content"));
}

async function renderDashboard(el) {
  el.innerHTML = `<div class="spinner"></div>`;
  const stats = await api.adminStats().catch(() => null);
  if (!stats) { el.innerHTML = `<div class="form-error">Failed to load stats</div>`; return; }

  const cards = [
    { label: "Total Books", value: stats.totalBooks, icon: "📚", color: "rgba(59,130,246,.1)", link: "#/admin/books" },
    { label: "Total Reviews", value: stats.totalReviews, icon: "💬", color: "rgba(34,197,94,.1)", link: "#/admin/reviews" },
    { label: "Total Students", value: stats.totalStudents, icon: "👩‍🎓", color: "rgba(168,85,247,.1)", link: "#/admin/users" },
    { label: "Active Classes", value: stats.totalClasses, icon: "🏫", color: "rgba(245,158,11,.1)", link: "#/classes" },
    { label: "Flagged Reviews", value: stats.flaggedReviews, icon: "🚩", color: "rgba(249,115,22,.1)", link: "#/admin/reports" },
    { label: "Pending Reports", value: stats.pendingReports, icon: "⚠️", color: "rgba(239,68,68,.1)", link: "#/admin/reports" },
  ];

  el.innerHTML = `
    <div>
      <div class="page-header"><h1>Admin Dashboard</h1><p>Overview of classroom activity and moderation tasks.</p></div>
      <div class="admin-stat-grid">
        ${cards.map(c => `
          <a href="${c.link}" class="card stat-card" style="cursor:pointer;text-decoration:none">
            <div><div class="stat-value">${c.value}</div><div class="stat-label">${c.label}</div></div>
            <div class="stat-icon" style="background:${c.color}">${c.icon}</div>
          </a>`).join("")}
      </div>
      <div class="card">
        <div class="card-header" style="display:flex;justify-content:space-between;align-items:center;background:var(--bg)">
          <div><div class="card-title">Recent Reviews</div><div class="card-desc">The latest reviews across all books.</div></div>
          <a href="#/admin/reviews" style="font-size:.875rem;color:var(--primary)">View All</a>
        </div>
        <div>
          ${stats.recentReviews.length ? stats.recentReviews.map(r => `
            <div style="padding:.85rem 1.25rem;border-top:1px solid var(--border);display:flex;gap:1rem">
              <div style="flex:1;min-width:0">
                <div style="display:flex;align-items:center;gap:.5rem;margin-bottom:.2rem">
                  <strong class="text-sm">${esc(r.bookTitle)}</strong>
                  <span class="text-muted text-xs">— ${esc(r.displayName || r.username)}</span>
                  ${r.flagged ? `<span class="badge badge-warning">Flagged</span>` : ""}
                  ${r.reportCount > 0 ? `<span class="badge badge-destructive">⚠ ${r.reportCount}</span>` : ""}
                </div>
                <p class="text-sm text-muted" style="overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical">${esc(r.text)}</p>
              </div>
              <span class="text-xs text-muted" style="white-space:nowrap;flex-shrink:0">${formatDate(r.createdAt)}</span>
            </div>`).join("")
          : `<div class="table-empty">No recent reviews found.</div>`}
        </div>
      </div>
    </div>`;
}

async function renderBooks(el) {
  el.innerHTML = `<div class="spinner"></div>`;
  let books = [], search = "", filter = "active";

  async function load() {
    books = await api.adminListBooks().catch(() => []);
    render();
  }

  function filtered() {
    return books.filter(b => {
      const q = search.toLowerCase();
      const ms = !q || b.title.toLowerCase().includes(q) || b.author.toLowerCase().includes(q);
      if (!ms) return false;
      if (filter === "active") return !b.isArchived && !b.isBanned;
      if (filter === "hidden") return b.isArchived && !b.isBanned;
      if (filter === "banned") return b.isBanned;
      return true;
    });
  }

  function render() {
    const list = filtered();
    el.innerHTML = `
      <div>
        <div class="page-header" style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:1rem">
          <div><h1>Book Catalog</h1><p>Manage the global library available to students.</p></div>
          <button class="btn btn-primary" id="add-book-btn">+ Add Book</button>
        </div>
        <div class="card">
          <div class="filter-bar">
            <div class="search-wrap" style="flex:1;max-width:280px">
              <i class="search-icon">🔍</i>
              <input class="input" id="book-search" placeholder="Search books…" value="${esc(search)}" style="height:36px" />
            </div>
            <select class="select" id="book-filter" style="height:36px">
              <option value="all"${filter==="all"?" selected":""}>All Books</option>
              <option value="active"${filter==="active"?" selected":""}>Active</option>
              <option value="hidden"${filter==="hidden"?" selected":""}>Hidden</option>
              <option value="banned"${filter==="banned"?" selected":""}>Banned</option>
            </select>
            <span class="text-sm text-muted">${list.length} books</span>
          </div>
          <div class="table-wrap">
            <table>
              <thead><tr>
                <th>Cover</th><th>Title & Author</th><th>Stats</th><th>Status</th><th style="text-align:right">Actions</th>
              </tr></thead>
              <tbody>
                ${list.length ? list.map(b => `
                  <tr style="${b.isBanned ? "opacity:.65" : b.isArchived ? "opacity:.8" : ""}">
                    <td><div style="width:32px;height:44px;background:var(--bg);border:1px solid var(--border);border-radius:4px;overflow:hidden;display:flex;align-items:center;justify-content:center">
                      ${b.coverUrl ? `<img src="${esc(b.coverUrl)}" style="width:100%;height:100%;object-fit:cover" />` : "📖"}
                    </div></td>
                    <td><div style="font-weight:600">${esc(b.title)}</div><div class="text-xs text-muted">${esc(b.author)}</div></td>
                    <td><div class="text-sm">${b.averageRating.toFixed(1)} ★</div><div class="text-xs text-muted">${b.reviewCount} reviews</div></td>
                    <td>
                      ${b.isBanned ? `<span class="badge badge-destructive">🚫 Banned</span>`
                        : b.isArchived ? `<span class="badge badge-warning">🙈 Hidden</span>`
                        : `<span class="badge badge-success">Active</span>`}
                    </td>
                    <td style="text-align:right;white-space:nowrap">
                      ${b.isBanned ? `
                        <button class="btn btn-ghost btn-sm unban-btn" data-id="${esc(b.id)}">✓ Unban</button>
                      ` : `
                        <button class="btn btn-ghost btn-sm toggle-hide-btn" data-id="${esc(b.id)}" data-archived="${b.isArchived}">
                          ${b.isArchived ? "👁 Show" : "🙈 Hide"}
                        </button>
                        <button class="btn btn-ghost btn-sm ban-btn" data-id="${esc(b.id)}" style="color:var(--destructive)">🚫 Ban</button>
                      `}
                      <button class="btn btn-ghost btn-sm wipe-book-btn" data-id="${esc(b.id)}" data-title="${esc(b.title)}" style="color:var(--destructive)" title="Wipe all reviews for this book">🧹 Wipe</button>
                      <button class="btn btn-ghost btn-sm remove-book-btn" data-id="${esc(b.id)}" data-title="${esc(b.title)}" style="color:var(--destructive)" title="Remove from catalog permanently">🗑 Remove</button>
                    </td>
                  </tr>`).join("")
                : `<tr><td colspan="5" class="table-empty">No books found.</td></tr>`}
              </tbody>
            </table>
          </div>
        </div>
      </div>`;

    const doSearch = debounce(v => { search = v; render(); }, 300);
    el.querySelector("#book-search").addEventListener("input", e => doSearch(e.target.value));
    el.querySelector("#book-filter").addEventListener("change", e => { filter = e.target.value; render(); });

    el.querySelectorAll(".toggle-hide-btn").forEach(btn => {
      btn.addEventListener("click", async () => {
        try { await api.adminHideBook(btn.dataset.id); showToast(btn.dataset.archived === "true" ? "Book shown" : "Book hidden"); load(); }
        catch (err) { showToast(err.message, "error"); }
      });
    });
    el.querySelectorAll(".ban-btn").forEach(btn => {
      btn.addEventListener("click", async () => {
        if (!await showConfirm({ title: "Ban Book?", body: "This book will be invisible to all users, including search results.\n\nUse Hide if you only want to remove it from the catalog browse.", confirmLabel: "Ban Book", destructive: true })) return;
        try { await api.adminBanBook(btn.dataset.id); showToast("Book banned"); load(); }
        catch (err) { showToast(err.message, "error"); }
      });
    });
    el.querySelectorAll(".unban-btn").forEach(btn => {
      btn.addEventListener("click", async () => {
        try { await api.adminBanBook(btn.dataset.id); showToast("Book unbanned"); load(); }
        catch (err) { showToast(err.message, "error"); }
      });
    });
    el.querySelectorAll(".wipe-book-btn").forEach(btn => {
      btn.addEventListener("click", async () => {
        const title = btn.dataset.title;
        if (!await showConfirm({ title: `Wipe data for "${title}"?`, body: "This will permanently delete every review, rating, and edit history for this book. The book itself will remain in the catalog.\n\nThis cannot be undone.", confirmLabel: "Wipe Data", destructive: true })) return;
        try { await api.adminWipeBookData(btn.dataset.id); showToast("Book data wiped"); load(); }
        catch (err) { showToast(err.message, "error"); }
      });
    });
    el.querySelectorAll(".remove-book-btn").forEach(btn => {
      btn.addEventListener("click", async () => {
        const title = btn.dataset.title;
        if (!await showConfirm({ title: `Remove "${title}"?`, body: "The book record will be deleted but any existing reviews will be kept in the database.\n\nThis cannot be undone.", confirmLabel: "Remove Book", destructive: true })) return;
        try { await api.adminRemoveBook(btn.dataset.id); showToast("Book removed from catalog"); load(); }
        catch (err) { showToast(err.message, "error"); }
      });
    });

    el.querySelector("#add-book-btn").addEventListener("click", () => showAddBookModal(load));
  }

  load();
}

function showAddBookModal(onSuccess) {
  let method = "search", olQuery = "", olResults = [], olLoading = false;
  let existingBooks = [];
  api.adminListBooks().then(b => { existingBooks = b; }).catch(() => {});

  function modalHtml() {
    return `
      <div style="display:flex;gap:.5rem;border-bottom:1px solid var(--border);padding-bottom:1rem;margin-bottom:1rem">
        <button class="btn ${method==="search"?"btn-primary":"btn-outline"} btn-sm" id="tab-search">Search Open Library</button>
        <button class="btn ${method==="manual"?"btn-primary":"btn-outline"} btn-sm" id="tab-manual">Add Manually</button>
      </div>
      ${method === "search" ? `
        <div class="form-stack">
          <div class="search-wrap">
            <i class="search-icon">🔍</i>
            <input class="input" id="ol-search" placeholder="Search by title, author…" value="${esc(olQuery)}" />
          </div>
          <div id="ol-results" style="max-height:360px;overflow-y:auto">
            ${olQuery.length < 3
              ? `<p class="text-sm text-muted" style="text-align:center;padding:2rem">Type at least 3 characters…</p>`
              : olLoading ? `<div class="spinner"></div>`
              : olResults.length ? olResults.map(r => {
                  const added = existingBooks.some(b => b.openLibKey === r.openLibKey);
                  return `<div style="display:flex;gap:.75rem;padding:.75rem;border:1px solid var(--border);border-radius:var(--radius);margin-bottom:.5rem">
                    <div style="width:40px;height:56px;background:var(--bg);border-radius:4px;overflow:hidden;flex-shrink:0;display:flex;align-items:center;justify-content:center">
                      ${r.coverUrl ? `<img src="${esc(r.coverUrl)}" style="width:100%;height:100%;object-fit:cover"/>` : "📖"}
                    </div>
                    <div style="flex:1;min-width:0">
                      <div style="font-weight:600;font-size:.875rem">${esc(r.title)}</div>
                      <div class="text-xs text-muted">by ${esc(r.author)}</div>
                    </div>
                    <div style="display:flex;align-items:center">
                      ${added ? `<button class="btn btn-outline btn-sm" disabled>✓ Added</button>`
                        : `<button class="btn btn-primary btn-sm add-ol-btn" data-key="${esc(r.openLibKey)}" data-title="${esc(r.title)}" data-author="${esc(r.author)}" data-cover="${esc(r.coverUrl||"")}">Add</button>`}
                    </div>
                  </div>`;
                }).join("")
              : `<p class="text-sm text-muted" style="text-align:center;padding:2rem">No results for "${esc(olQuery)}"</p>`}
          </div>
        </div>` : `
        <form class="form-stack" id="manual-book-form">
          <div class="form-group"><label class="form-label">Title <span class="required">*</span></label><input class="input" name="title" required/></div>
          <div class="form-group"><label class="form-label">Author <span class="required">*</span></label><input class="input" name="author" required/></div>
          <div class="form-group"><label class="form-label">Cover Image URL</label><input class="input" name="coverUrl" placeholder="https://…" type="url"/></div>
          <div class="form-group"><label class="form-label">Description</label><textarea class="textarea" name="description" style="min-height:80px"></textarea></div>
          <div id="manual-err" class="form-error" style="display:none"></div>
          <button type="submit" class="btn btn-primary">Add Book</button>
        </form>`}`;
  }

  function rerender() { document.getElementById("modal-content").innerHTML = modalHtml(); attachHandlers(); }

  function attachHandlers() {
    document.getElementById("tab-search")?.addEventListener("click", () => { method = "search"; rerender(); });
    document.getElementById("tab-manual")?.addEventListener("click", () => { method = "manual"; rerender(); });

    const olInput = document.getElementById("ol-search");
    if (olInput) {
      const doSearch = debounce(async (q) => {
        olQuery = q;
        if (q.length < 3) { olLoading = false; rerender(); return; }
        olLoading = true; rerender();
        olResults = await api.searchOpenLib(q).catch(() => []);
        olLoading = false; rerender();
      }, 400);
      olInput.addEventListener("input", e => doSearch(e.target.value));
      olInput.focus();

      document.querySelectorAll(".add-ol-btn").forEach(btn => {
        btn.addEventListener("click", async () => {
          btn.disabled = true; btn.textContent = "Adding…";
          try {
            await api.addBook({ title: btn.dataset.title, author: btn.dataset.author, coverUrl: btn.dataset.cover || null, openLibKey: btn.dataset.key });
            showToast("Book added!"); onSuccess(); closeModal();
          } catch (err) { showToast(err.message, "error"); btn.disabled = false; btn.textContent = "Add"; }
        });
      });
    }

    document.getElementById("manual-book-form")?.addEventListener("submit", async e => {
      e.preventDefault();
      const fd = new FormData(e.target);
      try {
        await api.addBook({ title: fd.get("title"), author: fd.get("author"), coverUrl: fd.get("coverUrl") || null, description: fd.get("description") || null });
        showToast("Book added!"); onSuccess(); closeModal();
      } catch (err) { document.getElementById("manual-err").textContent = err.message; document.getElementById("manual-err").style.display = ""; }
    });
  }

  openModal("Add a Book", modalHtml(), true);
  attachHandlers();
}

async function renderReviews(el) {
  el.innerHTML = `<div class="spinner"></div>`;
  let reviews = [], search = "", filter = "all";

  async function load() {
    const params = {};
    if (filter === "flagged") params.flagged = "true";
    else if (filter === "hidden") params.hidden = "true";
    reviews = await api.adminReviews(params).catch(() => []);
    render();
  }

  function filtered() {
    if (!search) return reviews;
    const q = search.toLowerCase();
    return reviews.filter(r => r.bookTitle.toLowerCase().includes(q) || r.username.toLowerCase().includes(q) || r.text.toLowerCase().includes(q));
  }

  function render() {
    const list = filtered();
    el.innerHTML = `
      <div>
        <div class="page-header"><h1>Review Moderation</h1><p>Manage and moderate all student reviews.</p></div>
        <div class="card">
          <div class="filter-bar">
            <div class="search-wrap" style="flex:1;max-width:280px">
              <i class="search-icon">🔍</i>
              <input class="input" id="rev-search" placeholder="Search reviews…" value="${esc(search)}" style="height:36px"/>
            </div>
            <select class="select" id="rev-filter" style="height:36px">
              <option value="all"${filter==="all"?" selected":""}>All Reviews</option>
              <option value="flagged"${filter==="flagged"?" selected":""}>Flagged Only</option>
              <option value="hidden"${filter==="hidden"?" selected":""}>Hidden Only</option>
            </select>
            <span class="text-sm text-muted">${list.length} reviews</span>
          </div>
          <div class="table-wrap">
            <table>
              <thead><tr>
                <th>Book & Reviewer</th><th>Review</th><th>Rating</th><th>Status</th><th style="text-align:right">Actions</th>
              </tr></thead>
              <tbody>
                ${list.length ? list.map(r => `
                  <tr>
                    <td style="min-width:160px">
                      <a href="#/books/${esc(r.bookId)}" class="text-sm" style="color:var(--primary);font-weight:500">${esc(r.bookTitle)}</a>
                      <div class="text-xs text-muted">by ${esc(r.displayName || r.username)}</div>
                    </td>
                    <td style="max-width:260px">
                      <div class="text-sm" style="overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical">${esc(r.text)}</div>
                      <div class="text-xs text-muted mt-1">${formatDate(r.createdAt)}${r.editCount > 0 ? " · edited" : ""}</div>
                    </td>
                    <td>${starsHtml(r.rating)}</td>
                    <td>
                      ${r.hidden ? `<span class="badge badge-outline">Hidden</span>`
                        : r.flagged ? `<span class="badge badge-warning">Flagged</span>`
                        : `<span class="badge badge-success">Visible</span>`}
                      ${r.reportCount > 0 ? `<div class="text-xs" style="color:var(--destructive);margin-top:.3rem">⚠ ${r.reportCount} reports</div>` : ""}
                    </td>
                    <td style="text-align:right;white-space:nowrap">
                      <button class="btn btn-ghost btn-sm view-history-btn" data-id="${esc(r.id)}" title="View edit history">📜</button>
                      <button class="btn btn-ghost btn-sm force-edit-btn" data-id="${esc(r.id)}" title="Force edit review">✏️</button>
                      <button class="btn btn-ghost btn-sm toggle-vis-btn" data-id="${esc(r.id)}" data-hidden="${r.hidden}" title="${r.hidden ? "Show review" : "Hide review"}">
                        ${r.hidden ? "👁" : "🙈"}
                      </button>
                      <button class="btn btn-ghost btn-sm delete-rev-btn" data-id="${esc(r.id)}" style="color:var(--destructive)" title="Delete review">🗑</button>
                    </td>
                  </tr>`).join("")
                : `<tr><td colspan="5" class="table-empty">No reviews found.</td></tr>`}
              </tbody>
            </table>
          </div>
        </div>
      </div>`;

    const doSearch = debounce(v => { search = v; render(); }, 300);
    el.querySelector("#rev-search").addEventListener("input", e => doSearch(e.target.value));
    el.querySelector("#rev-filter").addEventListener("change", async e => { filter = e.target.value; await load(); });

    el.querySelectorAll(".view-history-btn").forEach(btn => {
      btn.addEventListener("click", async () => {
        openModal("Edit History", `<div class="spinner"></div>`, true);
        const history = await api.getReviewHistory(btn.dataset.id).catch(() => []);
        document.getElementById("modal-content").innerHTML = history.length
          ? history.map((h, i) => `
              <div style="padding:.75rem;border:1px solid var(--border);border-radius:var(--radius);${i < history.length-1 ? "margin-bottom:.6rem" : ""}${h.deleted ? ";background:var(--destructive-bg);border-color:rgba(220,38,38,.2)" : ""}">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.4rem;flex-wrap:wrap;gap:.4rem">
                  <div style="display:flex;align-items:center;gap:.5rem">
                    <span class="text-xs text-muted">Version ${history.length - i} — ${formatDate(h.editedAt)}</span>
                    ${h.deleted ? `<span class="badge badge-destructive" style="font-size:.7rem">Deleted</span>` : ""}
                  </div>
                  ${starsHtml(h.rating)}
                </div>
                <p style="font-size:.85rem;color:var(--muted);margin:0">${esc(h.text)}</p>
              </div>`).join("")
          : `<p class="text-muted text-sm" style="text-align:center;padding:1rem">No edit history for this review.</p>`;
      });
    });

    el.querySelectorAll(".force-edit-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        const id = btn.dataset.id;
        const review = reviews.find(r => r.id === id);
        if (!review) return;
        openModal("Force Edit Review", `
          <div class="form-stack" id="force-edit-form">
            <div class="info-notice">
              <span class="icon">ℹ️</span>
              <div class="text-sm">Admin edits are saved to revision history. If filtered words are removed, the review is automatically unflagged and reports are dismissed.</div>
            </div>
            <div class="form-group">
              <label class="form-label">Review Text</label>
              <textarea class="textarea" id="fe-text" style="min-height:120px">${esc(review.text)}</textarea>
            </div>
            <div class="form-group">
              <label class="form-label">Rating</label>
              <div class="star-input" id="fe-stars">
                ${[1,2,3,4,5].map(i => `<span class="star${i <= review.rating ? " filled" : ""}">★</span>`).join("")}
              </div>
              <input type="hidden" id="fe-rating" value="${review.rating}"/>
            </div>
            <div class="toggle-row">
              <label class="toggle"><input type="checkbox" id="fe-spoiler"${review.spoiler ? " checked" : ""}/><span class="toggle-slider"></span></label>
              <div><div class="form-label">Contains Spoilers</div></div>
            </div>
            <div id="fe-err" class="form-error" style="display:none"></div>
            <div style="display:flex;justify-content:flex-end;gap:.5rem">
              <button type="button" class="btn btn-ghost" onclick="App.closeModal()">Cancel</button>
              <button type="button" class="btn btn-primary" id="fe-save-btn">Save Changes</button>
            </div>
          </div>`, true);

        attachStarInput(document.getElementById("modal-content"), v => { document.getElementById("fe-rating").value = v; }, review.rating);

        document.getElementById("fe-save-btn").addEventListener("click", async () => {
          const text = document.getElementById("fe-text").value.trim();
          const rating = Number(document.getElementById("fe-rating").value);
          const spoiler = document.getElementById("fe-spoiler").checked;
          if (!text || !rating) { document.getElementById("fe-err").textContent = "Text and rating are required"; document.getElementById("fe-err").style.display = ""; return; }
          const saveBtn = document.getElementById("fe-save-btn");
          saveBtn.disabled = true; saveBtn.textContent = "Saving…";
          try { await api.adminForceEditReview(id, { text, rating, spoiler }); showToast("Review updated"); closeModal(); load(); }
          catch (err) { document.getElementById("fe-err").textContent = err.message; document.getElementById("fe-err").style.display = ""; saveBtn.disabled = false; saveBtn.textContent = "Save Changes"; }
        });
      });
    });

    el.querySelectorAll(".toggle-vis-btn").forEach(btn => {
      btn.addEventListener("click", async () => {
        const hidden = btn.dataset.hidden === "true";
        try { await api.setReviewVisibility(btn.dataset.id, { hidden: !hidden }); showToast(!hidden ? "Review hidden" : "Review shown"); load(); }
        catch (err) { showToast(err.message, "error"); }
      });
    });

    el.querySelectorAll(".delete-rev-btn").forEach(btn => {
      btn.addEventListener("click", async () => {
        if (!await showConfirm({ title: "Delete Review?", body: "A snapshot will be saved in history. This cannot be undone.", confirmLabel: "Delete", destructive: true })) return;
        try { await api.adminDeleteReview(btn.dataset.id); showToast("Review deleted"); load(); }
        catch (err) { showToast(err.message, "error"); }
      });
    });
  }

  load();
}

async function renderDeletedReviews(el) {
  el.innerHTML = `<div class="spinner"></div>`;
  let reviews = [], search = "";

  const all = await api.adminDeletedReviews().catch(() => []);
  reviews = all;

  function filtered() {
    if (!search) return reviews;
    const q = search.toLowerCase();
    return reviews.filter(r =>
      r.bookTitle.toLowerCase().includes(q) ||
      r.username.toLowerCase().includes(q) ||
      r.text.toLowerCase().includes(q)
    );
  }

  function render() {
    const list = filtered();
    el.innerHTML = `
      <div>
        <div class="page-header">
          <h1>Deleted Reviews</h1>
          <p>Final snapshots of reviews that were deleted by students or admins.</p>
        </div>
        <div class="card">
          <div class="filter-bar">
            <div class="search-wrap" style="flex:1;max-width:280px">
              <i class="search-icon">🔍</i>
              <input class="input" id="del-search" placeholder="Search…" value="${esc(search)}" style="height:36px"/>
            </div>
            <span class="text-sm text-muted">${list.length} deleted review${list.length !== 1 ? "s" : ""}</span>
          </div>
          <div class="table-wrap">
            <table>
              <thead><tr>
                <th>Book & Reviewer</th><th>Review</th><th>Rating</th><th>Deleted</th><th style="text-align:right">History</th>
              </tr></thead>
              <tbody>
                ${list.length ? list.map(r => `
                  <tr>
                    <td style="min-width:160px">
                      <a href="#/books/${esc(r.bookId || "")}" class="text-sm" style="color:var(--primary);font-weight:500">${esc(r.bookTitle)}</a>
                      <div class="text-xs text-muted">by ${esc(r.displayName || r.username)}</div>
                    </td>
                    <td style="max-width:260px">
                      ${r.spoiler ? `<span class="badge badge-warning" style="font-size:.7rem;margin-bottom:.3rem">Spoiler</span><br>` : ""}
                      <div class="text-sm" style="overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;color:var(--muted);font-style:italic">${esc(r.text)}</div>
                    </td>
                    <td>${starsHtml(r.rating)}</td>
                    <td class="text-xs text-muted" style="white-space:nowrap">${formatDate(r.deletedAt)}</td>
                    <td style="text-align:right;white-space:nowrap">
                      <button class="btn btn-ghost btn-sm view-del-history-btn" data-id="${esc(r.reviewId)}" title="View full history">📜 History</button>
                      <button class="btn btn-ghost btn-sm perma-delete-btn" data-id="${esc(r.id)}" data-book="${esc(r.bookTitle)}" data-user="${esc(r.displayName || r.username)}" style="color:var(--destructive)" title="Permanently delete all history">🗑 Delete</button>
                    </td>
                  </tr>`).join("")
                : `<tr><td colspan="5" class="table-empty">No deleted reviews found.</td></tr>`}
              </tbody>
            </table>
          </div>
        </div>
      </div>`;

    const doSearch = debounce(v => { search = v; render(); }, 300);
    el.querySelector("#del-search").addEventListener("input", e => doSearch(e.target.value));

    el.querySelectorAll(".perma-delete-btn").forEach(btn => {
      btn.addEventListener("click", async () => {
        if (!await showConfirm({ title: "Permanently Delete History?", body: `Book: ${btn.dataset.book}\nBy: ${btn.dataset.user}\n\nEvery version snapshot will be wiped. This cannot be undone.`, confirmLabel: "Delete Forever", destructive: true })) return;
        try {
          await api.adminPermanentDeleteReview(btn.dataset.id);
          showToast("Review history permanently deleted");
          reviews = reviews.filter(r => r.id !== btn.dataset.id);
          render();
        } catch (err) { showToast(err.message, "error"); }
      });
    });

    el.querySelectorAll(".view-del-history-btn").forEach(btn => {
      btn.addEventListener("click", async () => {
        openModal("Review History", `<div class="spinner"></div>`, true);
        const history = await api.getReviewHistory(btn.dataset.id).catch(() => []);
        document.getElementById("modal-content").innerHTML = history.length
          ? history.map((h, i) => `
              <div style="padding:.75rem;border:1px solid var(--border);border-radius:var(--radius);${i < history.length - 1 ? "margin-bottom:.6rem" : ""}${h.deleted ? ";background:var(--destructive-bg);border-color:rgba(220,38,38,.2)" : ""}">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.4rem;flex-wrap:wrap;gap:.4rem">
                  <div style="display:flex;align-items:center;gap:.5rem">
                    <span class="text-xs text-muted">Version ${history.length - i} — ${formatDate(h.editedAt)}</span>
                    ${h.deleted ? `<span class="badge badge-destructive" style="font-size:.7rem">Deleted</span>` : ""}
                  </div>
                  ${starsHtml(h.rating)}
                </div>
                <p style="font-size:.85rem;color:var(--muted);margin:0;font-style:${h.deleted ? "italic" : "normal"}">${esc(h.text)}</p>
              </div>`).join("")
          : `<p class="text-muted text-sm" style="text-align:center;padding:1rem">No history available.</p>`;
      });
    });
  }

  render();
}

async function renderReports(el) {
  el.innerHTML = `<div class="spinner"></div>`;
  let activeTab = "manual";
  let manualReports = [], autoReports = [];

  async function load() {
    [manualReports, autoReports] = await Promise.all([
      api.adminReports().catch(() => []),
      api.adminAutoReports().catch(() => []),
    ]);
    render();
  }

  function render() {
    const pending = manualReports.filter(r => r.status === "pending");
    el.innerHTML = `
      <div>
        <div class="page-header" style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:1rem">
          <div><h1>Report Queue</h1><p>Review flagged and reported content.</p></div>
          <div style="display:flex;gap:.5rem">
            ${pending.length ? `<span class="badge badge-destructive" style="font-size:.85rem;padding:.3rem .85rem"><strong>${pending.length}</strong> manual</span>` : ""}
            ${autoReports.length ? `<span class="badge badge-warning" style="font-size:.85rem;padding:.3rem .85rem"><strong>${autoReports.length}</strong> auto-flagged</span>` : ""}
          </div>
        </div>
        <div class="tab-bar">
          <button class="tab-btn${activeTab === "manual" ? " active" : ""}" id="tab-manual">📋 Manual Reports ${pending.length ? `(${pending.length})` : ""}</button>
          <button class="tab-btn${activeTab === "auto" ? " active" : ""}" id="tab-auto">🔤 Auto-Flagged ${autoReports.length ? `(${autoReports.length})` : ""}</button>
        </div>
        <div id="report-tab-content">
          ${activeTab === "manual" ? renderManualReports(pending) : renderAutoReports(autoReports)}
        </div>
      </div>`;

    document.getElementById("tab-manual").addEventListener("click", () => { activeTab = "manual"; render(); });
    document.getElementById("tab-auto").addEventListener("click", () => { activeTab = "auto"; render(); });

    el.querySelectorAll(".handle-btn").forEach(btn => {
      btn.addEventListener("click", async () => {
        const action = btn.dataset.action;
        if (action === "delete_review" && !await showConfirm({ title: "Delete Review?", body: "A history snapshot will be saved. This cannot be undone.", confirmLabel: "Delete", destructive: true })) return;
        if (action === "hide_review" && !await showConfirm({ title: "Hide Review?", body: "This review will no longer be visible to students.", confirmLabel: "Hide" })) return;
        try {
          await api.handleReport(btn.dataset.id, { action });
          const msgs = { dismiss: "Report dismissed", hide_review: "Review hidden", delete_review: "Review deleted" };
          showToast(msgs[action]);
          await load();
        } catch (err) { showToast(err.message, "error"); }
      });
    });

    el.querySelectorAll(".dismiss-flag-btn").forEach(btn => {
      btn.addEventListener("click", async () => {
        if (!await showConfirm({ title: "Dismiss Auto-Flag?", body: "The review will no longer appear in the Auto-Flagged list. This does not edit the review content.", confirmLabel: "Dismiss Flag" })) return;
        try { await api.adminDismissFlag(btn.dataset.id); showToast("Flag dismissed"); await load(); }
        catch (err) { showToast(err.message, "error"); }
      });
    });
    el.querySelectorAll(".hide-flagged-btn").forEach(btn => {
      btn.addEventListener("click", async () => {
        if (!await showConfirm({ title: "Hide Review?", body: "This review will no longer be visible to students.", confirmLabel: "Hide" })) return;
        try { await api.setReviewVisibility(btn.dataset.id, { hidden: true }); showToast("Review hidden"); await load(); }
        catch (err) { showToast(err.message, "error"); }
      });
    });
    el.querySelectorAll(".delete-flagged-btn").forEach(btn => {
      btn.addEventListener("click", async () => {
        if (!await showConfirm({ title: "Delete Review?", body: "A history snapshot will be saved. This cannot be undone.", confirmLabel: "Delete", destructive: true })) return;
        try { await api.adminDeleteReview(btn.dataset.id); showToast("Review deleted"); await load(); }
        catch (err) { showToast(err.message, "error"); }
      });
    });
    el.querySelectorAll(".edit-flagged-btn").forEach(btn => {
      btn.addEventListener("click", async () => {
        const reviewId = btn.dataset.id;
        const r = autoReports.find(x => x.reviewId === reviewId);
        if (!r) return;
        openModal("Edit & Accept Review", `
          <div class="form-stack">
            <div class="info-notice">
              <span class="icon">💡</span>
              <div class="text-sm">Edit the review to remove the flagged content. If no filter words remain, the review will be automatically accepted and removed from this list.</div>
            </div>
            <div style="background:var(--warning-bg);border:1px solid #fde68a;border-radius:var(--radius);padding:.65rem .85rem;font-size:.85rem;color:#92400e">
              🚩 <strong>Flagged for:</strong> ${esc(r.reason)}
            </div>
            <div class="form-group">
              <label class="form-label">Review Text</label>
              <textarea class="textarea" id="ef-text" style="min-height:120px">${esc(r.reviewText)}</textarea>
            </div>
            <div id="ef-err" class="form-error" style="display:none"></div>
            <div style="display:flex;justify-content:flex-end;gap:.5rem">
              <button type="button" class="btn btn-ghost" onclick="App.closeModal()">Cancel</button>
              <button type="button" class="btn btn-primary" id="ef-save-btn">Save & Accept</button>
            </div>
          </div>`, true);
        document.getElementById("ef-save-btn")?.addEventListener("click", async () => {
          const text = document.getElementById("ef-text").value.trim();
          if (text.length < 10) { document.getElementById("ef-err").textContent = "Review must be at least 10 characters"; document.getElementById("ef-err").style.display = ""; return; }
          const b = document.getElementById("ef-save-btn");
          b.disabled = true; b.textContent = "Saving…";
          try {
            await api.adminForceEditReview(reviewId, { text });
            showToast("Review updated and accepted");
            closeModal(); await load();
          } catch (err) { document.getElementById("ef-err").textContent = err.message; document.getElementById("ef-err").style.display = ""; b.disabled = false; b.textContent = "Save & Accept"; }
        });
      });
    });
  }

  function renderManualReports(pending) {
    if (!pending.length) return `<div class="empty-state"><div class="empty-icon">✅</div><h3>All caught up!</h3><p>No pending manual reports.</p></div>`;
    return pending.map(r => `
      <div class="card report-card" data-report-id="${esc(r.id)}" style="margin-bottom:1rem">
        <div class="report-accent"></div>
        <div class="card-header" style="background:rgba(248,113,113,.08)">
          <div style="display:flex;justify-content:space-between;align-items:flex-start">
            <div>
              <div style="color:var(--destructive);font-weight:600;font-size:.9rem">🚩 Reported by ${esc(r.reportedByUsername)}</div>
              <div class="card-desc" style="margin-top:.25rem"><strong>${esc(r.bookTitle)}</strong> · ${formatDate(r.createdAt)}</div>
            </div>
          </div>
        </div>
        <div class="card-body">
          <div class="text-xs text-muted" style="text-transform:uppercase;letter-spacing:.06em;font-weight:600;margin-bottom:.5rem">Reason</div>
          <div class="report-reason">"${esc(r.reason)}"</div>
          <div class="text-xs text-muted" style="text-transform:uppercase;letter-spacing:.06em;font-weight:600;margin-bottom:.5rem">Review Content</div>
          <div class="report-text">${esc(r.reviewText)}</div>
        </div>
        <div class="card-footer">
          <button class="btn btn-outline btn-sm handle-btn" data-id="${esc(r.id)}" data-action="dismiss">✓ Dismiss</button>
          <button class="btn btn-warning btn-sm handle-btn" data-id="${esc(r.id)}" data-action="hide_review">🙈 Hide Review</button>
          <button class="btn btn-destructive btn-sm handle-btn" data-id="${esc(r.id)}" data-action="delete_review">🗑 Delete Review</button>
        </div>
      </div>`).join("");
  }

  function renderAutoReports(flagged) {
    if (!flagged.length) return `<div class="empty-state"><div class="empty-icon">✅</div><h3>No auto-flagged reviews!</h3><p>All reviews are clean.</p></div>`;
    return flagged.map(r => `
      <div class="card report-card" style="margin-bottom:1rem">
        <div class="report-accent" style="background:var(--warning)"></div>
        <div class="card-header" style="background:rgba(251,191,36,.08)">
          <div style="display:flex;justify-content:space-between;align-items:flex-start">
            <div>
              <div style="color:var(--warning);font-weight:600;font-size:.9rem">🔤 Auto-flagged</div>
              <div class="card-desc" style="margin-top:.25rem">
                <a href="#/books/${esc(r.bookId)}" style="color:var(--primary);font-weight:500">${esc(r.bookTitle)}</a>
                · by ${esc(r.displayName || r.username)} · ${formatDate(r.updatedAt)}
              </div>
            </div>
            ${r.hidden ? `<span class="badge badge-outline">Hidden</span>` : ""}
          </div>
        </div>
        <div class="card-body">
          <div class="text-xs text-muted" style="text-transform:uppercase;letter-spacing:.06em;font-weight:600;margin-bottom:.5rem">Flag Reason</div>
          <div style="background:var(--warning-bg);border:1px solid #fde68a;border-radius:var(--radius);padding:.6rem .85rem;font-size:.875rem;color:#92400e;margin-bottom:.85rem">${esc(r.reason)}</div>
          <div class="text-xs text-muted" style="text-transform:uppercase;letter-spacing:.06em;font-weight:600;margin-bottom:.5rem">Review Content</div>
          <div class="report-text">${esc(r.reviewText)}</div>
        </div>
        <div class="card-footer" style="justify-content:flex-start;gap:.5rem">
          <button class="btn btn-outline btn-sm dismiss-flag-btn" data-id="${esc(r.reviewId)}" title="Dismiss flag without editing">✓ Dismiss Flag</button>
          <button class="btn btn-primary btn-sm edit-flagged-btn" data-id="${esc(r.reviewId)}" title="Edit review to remove flagged content">✏️ Edit & Accept</button>
          ${!r.hidden ? `<button class="btn btn-warning btn-sm hide-flagged-btn" data-id="${esc(r.reviewId)}">🙈 Hide</button>` : ""}
          <button class="btn btn-destructive btn-sm delete-flagged-btn" data-id="${esc(r.reviewId)}">🗑 Delete</button>
        </div>
      </div>`).join("");
  }

  load();
}

async function renderFilterWords(el) {
  el.innerHTML = `<div class="spinner"></div>`;
  let words = [], wordSearch = "";

  const debouncedSave = debounce(async () => {
    try { await api.updateFilterWords({ words }); showToast("Filter list saved"); }
    catch (err) { showToast("Save failed: " + err.message, "error"); }
  }, 700);

  async function load() {
    const data = await api.getFilterWords().catch(() => ({ words: [] }));
    words = [...data.words];
    render();
  }

  function render() {
    const displayed = wordSearch
      ? words.filter(w => w.includes(wordSearch.toLowerCase()))
      : words;

    el.innerHTML = `
      <div style="max-width:680px">
        <div class="page-header"><h1>Auto-Filter Words</h1>
          <p>Reviews containing these words are automatically flagged. Changes save instantly.</p></div>
        <div class="card">
          <div class="card-header" style="background:rgba(251,191,36,.08)">
            <div class="card-title">🛡️ Restricted Vocabulary</div>
            <div class="card-desc">Matches are exact and case-insensitive. ${words.length} word${words.length !== 1 ? "s" : ""} in list.</div>
          </div>
          <div class="card-body">
            <form class="flex gap-2" id="add-word-form" style="margin-bottom:1.25rem">
              <input class="input" id="new-word-input" placeholder="Type a word and press Enter…" style="max-width:300px" autocomplete="off"/>
              <button type="submit" class="btn btn-outline btn-sm">+ Add</button>
            </form>
            <div class="search-wrap" style="margin-bottom:.85rem;max-width:280px">
              <i class="search-icon">🔍</i>
              <input class="input" id="word-search-input" placeholder="Search filter list…" value="${esc(wordSearch)}" style="height:34px"/>
            </div>
            <div class="text-xs text-muted" style="text-transform:uppercase;letter-spacing:.08em;font-weight:600;margin-bottom:.6rem">
              Current Filter List ${wordSearch ? `(${displayed.length} of ${words.length} shown)` : `(${words.length})`}
            </div>
            <div class="filter-tags" id="word-tags">
              ${displayed.length
                ? displayed.map(w => `
                  <div class="filter-tag">
                    <span>${esc(w)}</span>
                    <button data-word="${esc(w)}" class="remove-word-btn" title="Remove">✕</button>
                  </div>`).join("")
                : `<p class="text-sm text-muted italic">${wordSearch ? "No words match your search." : "The filter list is currently empty."}</p>`}
            </div>
          </div>
        </div>
      </div>`;

    el.querySelector("#add-word-form").addEventListener("submit", e => {
      e.preventDefault();
      const val = document.getElementById("new-word-input").value.trim().toLowerCase();
      if (!val || words.includes(val)) { showToast(words.includes(val) ? "Already in list" : "Type a word first", "warning"); return; }
      words.push(val);
      document.getElementById("new-word-input").value = "";
      debouncedSave();
      render();
    });

    el.querySelectorAll(".remove-word-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        words = words.filter(w => w !== btn.dataset.word);
        debouncedSave();
        render();
      });
    });

    el.querySelector("#word-search-input")?.addEventListener("input", e => { wordSearch = e.target.value.toLowerCase(); render(); });
  }

  load();
}

async function renderUsers(el) {
  el.innerHTML = `<div class="spinner"></div>`;
  let users = [], search = "";

  async function load() {
    users = await api.adminUsers().catch(() => []);
    render();
  }

  function filtered() {
    if (!search) return users;
    const q = search.toLowerCase();
    return users.filter(u => u.username.toLowerCase().includes(q) || (u.displayName && u.displayName.toLowerCase().includes(q)));
  }

  function render() {
    const list = filtered();
    el.innerHTML = `
      <div>
        <div class="page-header"><h1>User Management</h1><p>View all registered users, manage roles, rename, or delete accounts.</p></div>
        <div class="card">
          <div class="filter-bar" style="justify-content:space-between">
            <div class="search-wrap" style="max-width:280px;flex:1">
              <i class="search-icon">🔍</i>
              <input class="input" id="user-search" placeholder="Search users…" value="${esc(search)}" style="height:36px"/>
            </div>
            <span class="text-sm text-muted">${list.length} total</span>
          </div>
          <div class="table-wrap">
            <table>
              <thead><tr><th>User</th><th>Role</th><th>Name Status</th><th>Joined</th><th style="text-align:right">Actions</th></tr></thead>
              <tbody>
                ${list.length ? list.map(u => `
                  <tr>
                    <td>
                      <div style="display:flex;align-items:center;gap:.65rem">
                        <div class="avatar" style="width:32px;height:32px;font-size:.85rem;border-width:1px">${avatarInitial(u.displayName || u.username)}</div>
                        <div>
                          <div class="text-sm" style="font-weight:600">${esc(u.displayName || u.username)}</div>
                          <div class="text-xs text-muted">@${esc(u.username)}</div>
                        </div>
                      </div>
                    </td>
                    <td><span class="badge ${u.role === "admin" ? "badge-default" : "badge-secondary"}">${u.role.charAt(0).toUpperCase() + u.role.slice(1)}</span></td>
                    <td>${u.nameForcedBy ? `<span class="badge badge-warning" style="font-size:.75rem;white-space:nowrap;margin:0">🔒 Admin Set</span>` : `<span class="badge badge-outline" style="font-size:.75rem;white-space:nowrap;margin:0">Self Set</span>`}</td>
                    <td class="text-sm text-muted">${formatDate(u.createdAt)}</td>
                    <td style="text-align:right;white-space:nowrap">
                      <button class="btn btn-ghost btn-sm rename-btn" data-id="${esc(u.id)}" data-name="${esc(u.displayName||"")}">✏️ Rename</button>
                      <button class="btn btn-ghost btn-sm toggle-role-btn" data-id="${esc(u.id)}" data-role="${u.role}" data-username="${esc(u.username)}">
                        ${u.role === "admin" ? "↓ Demote" : "↑ Promote"}
                      </button>
                      ${u.role !== "admin" ? `<button class="btn btn-ghost btn-sm delete-user-btn" data-id="${esc(u.id)}" data-username="${esc(u.username)}" data-name="${esc(u.displayName || u.username)}" style="color:var(--destructive)">🗑 Delete</button>` : ""}
                    </td>
                  </tr>`).join("")
                : `<tr><td colspan="5" class="table-empty">No users found.</td></tr>`}
              </tbody>
            </table>
          </div>
        </div>
      </div>`;

    const doSearch = debounce(v => { search = v; render(); }, 300);
    el.querySelector("#user-search").addEventListener("input", e => doSearch(e.target.value));

    el.querySelectorAll(".rename-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        const userId = btn.dataset.id;
        const currentName = btn.dataset.name;
        openModal("Force Rename User", `
          <form class="form-stack" id="rename-form">
            <div class="form-group">
              <label class="form-label">New Display Name <span class="required">*</span></label>
              <input class="input" name="displayName" value="${esc(currentName)}" placeholder="Full name" required autofocus/>
              <div class="form-hint">This locks the name — the user won't be able to change it themselves.</div>
            </div>
            <div id="rename-err" class="form-error" style="display:none"></div>
            <div style="display:flex;justify-content:flex-end;gap:.5rem">
              <button type="button" class="btn btn-ghost" onclick="App.closeModal()">Cancel</button>
              <button type="submit" class="btn btn-primary">Set Name & Lock</button>
            </div>
          </form>`);
        document.getElementById("rename-form").addEventListener("submit", async e => {
          e.preventDefault();
          const fd = new FormData(e.target);
          const displayName = fd.get("displayName").trim();
          const b2 = e.target.querySelector("[type=submit]");
          b2.disabled = true; b2.textContent = "Saving…";
          try { await api.adminForceRename(userId, displayName); showToast("Name updated and locked!"); closeModal(); load(); }
          catch (err) { document.getElementById("rename-err").textContent = err.message; document.getElementById("rename-err").style.display = ""; b2.disabled = false; b2.textContent = "Set Name & Lock"; }
        });
      });
    });

    el.querySelectorAll(".toggle-role-btn").forEach(btn => {
      btn.addEventListener("click", async () => {
        const username = btn.dataset.username;
        const currentRole = btn.dataset.role;
        const newRole = currentRole === "admin" ? "student" : "admin";
        const confirmTitle = newRole === "admin" ? `Grant Admin: @${username}?` : `Revoke Admin: @${username}?`;
        const confirmBody = newRole === "admin"
          ? "This will give them full access to the Admin Panel, including user management, review moderation, and class administration."
          : "They will lose all admin access and return to a regular student account.";
        if (!await showConfirm({ title: confirmTitle, body: confirmBody, confirmLabel: newRole === "admin" ? "Grant Admin" : "Revoke Admin", destructive: newRole !== "admin" })) return;
        try { await api.updateUserRole(btn.dataset.id, { role: newRole }); showToast(`Role changed to ${newRole}`); load(); }
        catch (err) { showToast(err.message, "error"); }
      });
    });

    el.querySelectorAll(".delete-user-btn").forEach(btn => {
      btn.addEventListener("click", async () => {
        const username = btn.dataset.username;
        const name = btn.dataset.name;
        if (!await showConfirm({ title: `Delete ${name}?`, body: "This will:\n• Remove them from all classes\n• Delete all their reviews (history snapshots preserved)\n• Delete their account permanently\n\nThis cannot be undone.", confirmLabel: "Continue", destructive: true })) return;
        if (!await showConfirm({ title: "Final Confirmation", body: `Permanently delete @${username}? There is no undo.`, confirmLabel: "Delete User", destructive: true })) return;
        try { await api.adminDeleteUser(btn.dataset.id); showToast("User deleted"); load(); }
        catch (err) { showToast(err.message, "error"); }
      });
    });
  }

  load();
}
