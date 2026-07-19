import * as api from "/js/api.js";
import { currentUser, navigate, showToast, openModal, closeModal, showConfirm, esc, starsHtml, formatDate, avatarInitial, attachStarInput } from "/js/app.js";

export async function renderBookDetail(container, bookId) {
  container.innerHTML = `<div class="page"><div class="container"><div class="spinner"></div></div></div>`;

  let book, reviews, assignments = [], sortOrder = "newest";
  let isFav = new Set(currentUser?.favoriteBookIds || []).has(bookId);

  async function loadAll() {
    try {
      const promises = [api.getBook(bookId), api.listReviews(bookId, sortOrder)];
      if (currentUser) promises.push(api.getBookAssignments(bookId).catch(() => []));
      const results = await Promise.all(promises);
      book = results[0];
      reviews = results[1];
      assignments = results[2] || [];
    } catch {
      container.innerHTML = `<div class="page"><div class="container">
        <div class="empty-state">
          <div class="empty-icon">⚠️</div><h3>Book not found</h3>
          <a href="#/" class="btn btn-outline mt-2">Back to Catalog</a>
        </div></div></div>`;
      return;
    }
    render();
  }

  function render() {
    const hasReviewed = currentUser && reviews.some(r => r.userId === currentUser.id);
    const total = book.reviewCount || 1;
    const rb = book.ratingBreakdown || {};
    const bars = [
      { label: 5, count: rb.five || 0 },
      { label: 4, count: rb.four || 0 },
      { label: 3, count: rb.three || 0 },
      { label: 2, count: rb.two || 0 },
      { label: 1, count: rb.one || 0 },
    ];

    container.innerHTML = `
      <div class="page">
        <div class="container">
          <a href="#/" class="back-btn">← Back to Catalog</a>

          <div class="book-detail-grid">
            <div>
              <div class="book-detail-cover">
                ${book.coverUrl
                  ? `<img src="${esc(book.coverUrl)}" alt="${esc(book.title)}" />`
                  : `<span style="font-size:4rem;opacity:.2">📖</span>`}
              </div>
            </div>
            <div class="book-detail-meta">
              <div class="book-badges">
                ${book.classIds.length > 0 ? `<span class="badge badge-success">Assigned Reading</span>` : ""}
                ${book.isArchived ? `<span class="badge badge-outline">Hidden</span>` : ""}
                ${book.isBanned ? `<span class="badge badge-destructive">Banned</span>` : ""}
              </div>
              <h1>${esc(book.title)}</h1>
              <div style="display:flex;align-items:center;gap:.75rem;margin-bottom:1.25rem;flex-wrap:wrap">
                <div class="byline" style="margin-bottom:0">by ${esc(book.author)}</div>
                ${currentUser ? `
                  <button id="fav-detail-btn"
                    class="btn btn-sm${isFav ? " btn-destructive" : " btn-outline"}"
                    title="${isFav ? "Remove from favorites" : "Add to favorites"}">
                    ${isFav ? "❤️ Saved" : "🤍 Save"}
                  </button>` : `
                  <a href="#/login" class="btn btn-outline btn-sm">Log in to save</a>`}
              </div>
              <div class="rating-summary">
                <div class="rating-big">
                  <div class="score">${book.averageRating.toFixed(1)}</div>
                  <div class="label">avg · ${book.reviewCount} reviews</div>
                </div>
                <div class="rating-bars">
                  ${bars.map(row => `
                    <div class="rating-bar-row">
                      <span>${row.label}</span>
                      <div class="rating-bar-track">
                        <div class="rating-bar-fill" style="width:${((row.count / total) * 100).toFixed(0)}%"></div>
                      </div>
                      <span>${row.count}</span>
                    </div>`).join("")}
                </div>
              </div>
              ${book.description
                ? `<h3 class="card-title" style="margin-bottom:.5rem">About this book</h3>
                   <p class="book-description">${esc(book.description)}</p>`
                : `<p class="text-muted italic">No description available.</p>`}
            </div>
          </div>

          <div class="reviews-section">
            <div>
              <div class="reviews-header">
                <h2>Community Reviews</h2>
                <div class="flex gap-2" style="align-items:center">
                  <span class="text-sm text-muted">Sort:</span>
                  <select class="select" id="sort-select" style="height:34px;font-size:.825rem">
                    <option value="newest">Newest First</option>
                    <option value="highest">Highest Rating</option>
                    <option value="lowest">Lowest Rating</option>
                    <option value="helpful">Most Helpful</option>
                  </select>
                </div>
              </div>

              ${assignmentNoticesHtml(hasReviewed)}

              ${currentUser
                ? (!hasReviewed ? `
                    <div class="review-form-wrap" id="review-form-wrap">
                      <h3>Write a Review</h3>
                      ${reviewFormHtml()}
                    </div>` : `
                    <div class="info-notice" style="margin-bottom:1.25rem">
                      <span class="icon">ℹ️</span>
                      <div><strong>You've reviewed this book.</strong><br/>
                        <span class="text-muted text-sm">Your review appears below — you can edit or delete it.</span>
                      </div>
                    </div>`)
                : `<div class="info-notice" style="margin-bottom:1.25rem">
                    <span class="icon">📖</span>
                    <div><strong>Want to share your thoughts?</strong><br/>
                      <a href="#/login" style="color:var(--primary)">Log in</a> or
                      <a href="#/register" style="color:var(--primary)">sign up</a> to write a review.
                    </div>
                  </div>`}

              <div id="reviews-list">${reviewsHtml(reviews)}</div>
            </div>
            <div>
              <div class="card">
                <div class="card-header"><div class="card-title">Review Guidelines</div></div>
                <div class="card-body">
                  <ul class="guidelines-card" style="list-style:none">
                    <li>Be respectful of other readers</li>
                    <li>Hide spoilers using the spoiler toggle</li>
                    <li>Focus on your personal experience</li>
                    <li>Keep it relevant to the class</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>`;

    attachFavListener();
    attachReviewFormListeners();
    attachSortListener();
    attachReviewListeners();
  }

  function attachFavListener() {
    const btn = document.getElementById("fav-detail-btn");
    if (!btn) return;
    btn.addEventListener("click", async () => {
      btn.disabled = true;
      try {
        const result = await api.toggleFavorite(bookId);
        isFav = result.favorited;
        if (currentUser) currentUser.favoriteBookIds = result.favoriteBookIds;
        btn.className = `btn btn-sm${isFav ? " btn-destructive" : " btn-outline"}`;
        btn.textContent = isFav ? "❤️ Saved" : "🤍 Save";
        btn.title = isFav ? "Remove from favorites" : "Add to favorites";
      } catch { showToast("Couldn't update favorites", "error"); }
      btn.disabled = false;
    });
  }

  function assignmentNoticesHtml(hasReviewed) {
    if (!assignments.length) return "";
    const myReview = reviews.find(r => currentUser && r.userId === currentUser.id);
    const myWordCount = myReview ? myReview.text.trim().split(/\s+/).filter(Boolean).length : null;

    return assignments.map(a => {
      const parts = [];
      if (a.className) parts.push(`Class: <strong>${esc(a.className)}</strong>`);
      if (a.deadline) parts.push(`Due: <strong>${new Date(a.deadline).toLocaleDateString()}</strong>`);
      if (a.minWordCount) parts.push(`Min. words: <strong>${a.minWordCount}</strong>`);
      const belowWordCount = hasReviewed && a.minWordCount && myWordCount !== null && myWordCount < a.minWordCount;
      return `<div style="background:${belowWordCount ? "var(--warning-bg)" : "var(--success-bg)"};border:1px solid ${belowWordCount ? "rgba(251,191,36,.3)" : "rgba(74,222,128,.3)"};border-radius:var(--radius);padding:.75rem 1rem;margin-bottom:.75rem;font-size:.875rem">
        <div style="font-weight:600;margin-bottom:.3rem">${belowWordCount ? "⚠️" : "📋"} Assigned Reading</div>
        <div style="color:var(--muted)">${parts.join(" · ")}</div>
        ${belowWordCount ? `<div style="margin-top:.4rem;color:#92400e">Your review has ${myWordCount} word${myWordCount !== 1 ? "s" : ""} — needs at least ${a.minWordCount}. Please edit it below.</div>` : ""}
      </div>`;
    }).join("");
  }

  function reviewFormHtml(existing) {
    const r = existing || {};
    return `
      <div class="form-stack">
        <div class="form-group">
          <label class="form-label">Your Rating</label>
          <div class="star-input" id="star-input">
            ${[1,2,3,4,5].map(i => `<span class="star${i <= (r.rating||0) ? " filled" : ""}">★</span>`).join("")}
          </div>
          <input type="hidden" id="rating-val" value="${r.rating || 0}" />
          <span id="rating-err" class="form-hint" style="color:var(--destructive);display:none">Please select a rating</span>
        </div>
        <div class="form-group">
          <label class="form-label">Your Review</label>
          <textarea class="textarea" id="review-text" placeholder="What did you think? Share your thoughts…" style="min-height:110px">${esc(r.text || "")}</textarea>
          <span id="text-err" class="form-hint" style="color:var(--destructive);display:none">Review must be at least 10 characters</span>
        </div>
        <div class="toggle-row">
          <label class="toggle"><input type="checkbox" id="spoiler-toggle"${r.spoiler ? " checked" : ""}/><span class="toggle-slider"></span></label>
          <div>
            <div class="form-label">Contains Spoilers</div>
            <div class="text-xs text-muted">Hides the text behind a warning</div>
          </div>
          <div style="margin-left:auto;display:flex;gap:.5rem">
            ${existing ? `<button class="btn btn-ghost btn-sm" id="cancel-edit-btn">Cancel</button>` : ""}
            <button class="btn btn-primary btn-sm" id="submit-review-btn">${existing ? "Save Changes" : "Post Review"}</button>
          </div>
        </div>
        <div id="review-form-err" class="form-error" style="display:none"></div>
      </div>`;
  }

  function attachReviewFormListeners() {
    const wrap = document.getElementById("review-form-wrap");
    if (!wrap) return;
    const ratingInput = document.getElementById("rating-val");
    attachStarInput(wrap, (val) => { ratingInput.value = val; }, Number(ratingInput.value));

    document.getElementById("submit-review-btn")?.addEventListener("click", async () => {
      const rating = Number(document.getElementById("rating-val").value);
      const text = document.getElementById("review-text").value.trim();
      const spoiler = document.getElementById("spoiler-toggle").checked;
      let valid = true;
      if (!rating) { document.getElementById("rating-err").style.display = ""; valid = false; }
      else document.getElementById("rating-err").style.display = "none";
      if (text.length < 10) { document.getElementById("text-err").style.display = ""; valid = false; }
      else document.getElementById("text-err").style.display = "none";
      if (!valid) return;
      const btn = document.getElementById("submit-review-btn");
      btn.disabled = true; btn.textContent = "Posting…";
      try {
        await api.createReview(bookId, { rating, text, spoiler });
        showToast("Review posted!");
        reload();
      } catch (err) {
        document.getElementById("review-form-err").textContent = err.message;
        document.getElementById("review-form-err").style.display = "";
        btn.disabled = false; btn.textContent = "Post Review";
      }
    });
  }

  function attachSortListener() {
    document.getElementById("sort-select")?.addEventListener("change", async (e) => {
      sortOrder = e.target.value;
      document.getElementById("reviews-list").innerHTML = `<div class="spinner"></div>`;
      reviews = await api.listReviews(bookId, sortOrder);
      document.getElementById("reviews-list").innerHTML = reviewsHtml(reviews);
      attachReviewListeners();
    });
  }

  async function reload() {
    [book, reviews] = await Promise.all([api.getBook(bookId), api.listReviews(bookId, sortOrder)]);
    render();
  }

  function reviewsHtml(revs) {
    if (!revs.length) return `<div class="empty-state">
      <div class="empty-icon">💬</div><h3>No reviews yet</h3>
      <p>Be the first to share your thoughts!</p></div>`;
    return revs.map(r => singleReviewHtml(r)).join("");
  }

  function singleReviewHtml(r) {
    const isOwner = currentUser && r.userId === currentUser.id;
    const isAdmin = currentUser?.role === "admin";

    if (r.hidden && !isOwner && !isAdmin) return `
      <div class="review-card" style="opacity:.6">
        <div style="display:flex;align-items:center;gap:.75rem;padding:1rem">
          <span>🛡️</span><span class="text-sm italic text-muted">This review has been hidden by moderators.</span>
        </div>
      </div>`;

    return `
      <div class="review-card${r.flagged && !r.hidden ? " flagged" : ""}" data-review-id="${esc(r.id)}">
        <div class="review-header">
          <div class="review-user">
            <div class="avatar">${avatarInitial(r.displayName || r.username)}</div>
            <div>
              <div class="review-username">${esc(r.displayName || r.username)}
                ${isOwner ? `<span class="badge badge-outline" style="margin-left:.4rem;font-size:.7rem">You</span>` : ""}
              </div>
              <div class="review-date">${formatDate(r.createdAt)}${r.editCount > 0 ? " · ✏️ Edited" : ""}</div>
            </div>
          </div>
          <div style="display:flex;align-items:center;gap:.5rem;flex-wrap:wrap">
            ${starsHtml(r.rating)}
            ${r.flagged ? `<span class="badge badge-warning" style="font-size:.7rem">🚩 Flagged</span>` : ""}
            ${r.reportCount > 0 ? `<span class="badge badge-destructive" style="font-size:.7rem" title="${r.reportCount} pending report${r.reportCount > 1 ? "s" : ""}">⚠ ${r.reportCount}</span>` : ""}
            ${r.hidden ? `<span class="badge badge-outline" style="font-size:.7rem">Hidden</span>` : ""}
            ${currentUser ? `
            <div class="dropdown">
              <button class="btn btn-ghost btn-icon btn-sm review-menu-btn" data-id="${esc(r.id)}" title="Options">⋮</button>
              <div class="dropdown-menu">
                <button class="dropdown-item view-history-btn" data-id="${esc(r.id)}">📜 History${r.editCount > 0 ? ` (${r.editCount})` : ""}</button>
                ${isOwner ? `
                  <button class="dropdown-item edit-review-btn" data-id="${esc(r.id)}">✏️ Edit</button>
                  <button class="dropdown-item danger delete-review-btn" data-id="${esc(r.id)}">🗑️ Delete</button>
                ` : `
                  <button class="dropdown-item report-review-btn" data-id="${esc(r.id)}">🚩 Report</button>
                `}
              </div>
            </div>` : ""}
          </div>
        </div>
        ${r.flagged && isOwner ? `
          <div class="review-flag-notice">⚠️ <strong>Flagged for review</strong> — ${esc(r.flagReason || "Violates guidelines")}. Please edit your review to remove the flagged content.</div>` : ""}
        <div class="review-body">
          ${r.spoiler
            ? `<div class="spoiler-label">⚠️ Spoiler warning</div>
               <div class="spoiler-wrap"><div class="spoiler-hidden" data-revealed="false">${esc(r.text)}</div>
               <div style="margin-top:.4rem"><button class="btn btn-outline btn-sm reveal-spoiler-btn">Reveal Spoiler</button></div></div>`
            : `<div style="font-size:.9rem;line-height:1.65">${esc(r.text)}</div>`}
        </div>
        ${currentUser ? `
        <div class="review-footer">
          <button class="btn btn-ghost btn-sm helpful-btn${r.isHelpfulByMe ? " helpful-active" : ""}"
            data-id="${esc(r.id)}" ${isOwner ? "disabled" : ""}>
            👍 <span class="helpful-count">${r.helpfulCount}</span> Helpful
          </button>
        </div>` : ""}
      </div>`;
  }

  function openHistoryModal(id) {
    openModal("Edit History", `<div class="spinner"></div>`, true);
    api.getReviewHistory(id).then(history => {
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
              <p style="font-size:.85rem;color:var(--muted);margin:0;font-style:italic">${esc(h.text)}</p>
            </div>`).join("")
        : `<p class="text-muted text-sm" style="text-align:center;padding:1rem">No edit history for this review.</p>`;
    }).catch(() => {
      document.getElementById("modal-content").innerHTML = `<p class="form-error">Failed to load history.</p>`;
    });
  }

  function attachReviewListeners() {
    document.querySelectorAll(".review-menu-btn").forEach(btn => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const menu = btn.nextElementSibling;
        document.querySelectorAll(".dropdown-menu.open").forEach(m => { if (m !== menu) m.classList.remove("open"); });
        menu.classList.toggle("open");
      });
    });
    document.addEventListener("click", () => document.querySelectorAll(".dropdown-menu.open").forEach(m => m.classList.remove("open")));

    document.querySelectorAll(".view-history-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        document.querySelectorAll(".dropdown-menu.open").forEach(m => m.classList.remove("open"));
        openHistoryModal(btn.dataset.id);
      });
    });

    document.querySelectorAll(".reveal-spoiler-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        const hidden = btn.closest(".spoiler-wrap").querySelector(".spoiler-hidden");
        hidden.style.filter = "none"; hidden.style.color = "inherit"; hidden.style.cursor = "default";
        btn.style.display = "none";
      });
    });

    document.querySelectorAll(".helpful-btn:not([disabled])").forEach(btn => {
      btn.addEventListener("click", async () => {
        try {
          const { helpfulCount, isHelpfulByMe } = await api.toggleHelpful(btn.dataset.id);
          btn.querySelector(".helpful-count").textContent = helpfulCount;
          btn.classList.toggle("helpful-active", isHelpfulByMe);
        } catch {}
      });
    });

    document.querySelectorAll(".edit-review-btn").forEach(btn => {
      btn.addEventListener("click", async () => {
        document.querySelectorAll(".dropdown-menu.open").forEach(m => m.classList.remove("open"));
        const id = btn.dataset.id;
        const review = reviews.find(r => r.id === id);
        if (!review) return;
        const card = document.querySelector(`[data-review-id="${id}"]`);
        card.innerHTML = `<div style="padding:1.25rem">
          <div class="card-title" style="margin-bottom:1rem">Edit Review</div>
          ${reviewFormHtml(review)}
        </div>`;
        const ratingInput = card.querySelector("#rating-val");
        attachStarInput(card, (val) => { ratingInput.value = val; }, review.rating);
        card.querySelector("#cancel-edit-btn")?.addEventListener("click", () => { card.outerHTML = singleReviewHtml(review); attachReviewListeners(); });
        card.querySelector("#submit-review-btn")?.addEventListener("click", async () => {
          const rating = Number(card.querySelector("#rating-val").value);
          const text = card.querySelector("#review-text").value.trim();
          const spoiler = card.querySelector("#spoiler-toggle").checked;
          if (!rating || text.length < 10) return;
          const saveBtn = card.querySelector("#submit-review-btn");
          saveBtn.disabled = true; saveBtn.textContent = "Saving…";
          try {
            await api.updateReview(id, { rating, text, spoiler });
            showToast("Review updated!");
            reload();
          } catch (err) {
            card.querySelector("#review-form-err").textContent = err.message;
            card.querySelector("#review-form-err").style.display = "";
            saveBtn.disabled = false; saveBtn.textContent = "Save Changes";
          }
        });
      });
    });

    document.querySelectorAll(".delete-review-btn").forEach(btn => {
      btn.addEventListener("click", async () => {
        document.querySelectorAll(".dropdown-menu.open").forEach(m => m.classList.remove("open"));
        if (!await showConfirm({ title: "Delete Review?", body: "A snapshot will be saved in history. This cannot be undone.", confirmLabel: "Delete", destructive: true })) return;
        try { await api.deleteReview(btn.dataset.id); showToast("Review deleted"); reload(); }
        catch (err) { showToast(err.message, "error"); }
      });
    });

    document.querySelectorAll(".report-review-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        document.querySelectorAll(".dropdown-menu.open").forEach(m => m.classList.remove("open"));
        const id = btn.dataset.id;
        openModal("Report Review", `
          <div class="form-stack">
            <p class="text-sm text-muted">Why are you reporting this review? Moderators will review your report.</p>
            <div class="form-group">
              <textarea class="textarea" id="report-reason" placeholder="Contains inappropriate content, harassment, spoilers without warning, etc." style="min-height:100px"></textarea>
            </div>
            <div style="display:flex;justify-content:flex-end;gap:.5rem">
              <button class="btn btn-ghost" onclick="App.closeModal()">Cancel</button>
              <button class="btn btn-destructive" id="submit-report-btn">Submit Report</button>
            </div>
          </div>`);
        document.getElementById("submit-report-btn")?.addEventListener("click", async () => {
          const reason = document.getElementById("report-reason").value.trim();
          if (!reason) return;
          try { await api.reportReview(id, { reason }); showToast("Report submitted. Thank you!"); closeModal(); }
          catch (err) { showToast(err.message, "error"); }
        });
      });
    });
  }

  loadAll();
}
