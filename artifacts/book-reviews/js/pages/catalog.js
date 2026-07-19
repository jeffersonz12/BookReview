import * as api from "/js/api.js";
import { currentUser, navigate, showToast, esc, starsHtml, debounce } from "/js/app.js";

export async function renderCatalog(container) {
  container.innerHTML = `
    <div class="page">
      <div class="container">
        <section class="hero">
          <h1>The Library</h1>
          <p>Explore books assigned in your classes, read what other students thought, and share your own reviews.</p>
          <div class="hero-controls">
            <div class="search-wrap" style="flex:1">
              <i class="search-icon">🔍</i>
              <input class="input" id="search-input" type="search" placeholder="Search by title or author…" />
            </div>
            <div id="class-filter-wrap"></div>
          </div>
        </section>

        <div class="books-header">
          <h2>📚 Book Catalog</h2>
          <span class="books-count" id="books-count"></span>
        </div>
        <div id="book-grid" class="book-grid">${skeletonBooks()}</div>
      </div>
    </div>`;

  let allBooks = [], classes = [], search = "", classId = "all";
  let favoriteIds = new Set(currentUser?.favoriteBookIds || []);

  async function load() {
    try {
      const promises = [api.listBooks(search ? { search } : {})];
      if (currentUser) promises.push(api.listClasses());
      const results = await Promise.all(promises);
      allBooks = results[0];
      classes = results[1] || [];
    } catch {
      allBooks = []; classes = [];
    }
    renderClassFilter();
    renderBooks();
  }

  function renderClassFilter() {
    const wrap = document.getElementById("class-filter-wrap");
    if (!wrap) return;
    if (!classes.length) { wrap.innerHTML = ""; return; }
    wrap.innerHTML = `
      <select class="select" id="class-filter" style="height:46px">
        <option value="all">All Classes</option>
        ${classes.map(c => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join("")}
      </select>`;
    document.getElementById("class-filter")?.addEventListener("change", (e) => {
      classId = e.target.value;
      renderBooks();
    });
  }

  function renderBooks() {
    const grid = document.getElementById("book-grid");
    const countEl = document.getElementById("books-count");
    if (!grid) return;

    let books = allBooks;
    if (classId !== "all") {
      books = books.filter(b => b.classIds?.includes(classId));
    }

    if (countEl) countEl.textContent = `${books.length} book${books.length !== 1 ? "s" : ""}`;

    if (!books.length) {
      grid.innerHTML = `
        <div class="empty-state" style="grid-column:1/-1;padding:3rem 0">
          <div class="empty-icon">📭</div>
          <h3>No books found</h3>
          <p>${search ? `No results for "${esc(search)}"` : "No books in this category yet."}</p>
        </div>`;
      return;
    }

    grid.innerHTML = books.map(b => bookCardHtml(b)).join("");
    attachCardListeners();
  }

  function bookCardHtml(b) {
    const isFav = currentUser && favoriteIds.has(b.id);
    return `
      <div class="book-card" data-id="${esc(b.id)}" tabindex="0" role="button" aria-label="${esc(b.title)}">
        <div class="book-cover">
          ${b.coverUrl
            ? `<img src="${esc(b.coverUrl)}" alt="${esc(b.title)}" loading="lazy" />`
            : `<span class="book-cover-icon">📖</span>`}
          ${b.isArchived ? `<span class="book-badge"><span class="badge badge-outline" style="font-size:.65rem;background:rgba(255,255,255,.85)">Hidden</span></span>` : ""}
          ${currentUser ? `<button class="fav-btn${isFav ? " favorited" : ""}" data-book-id="${esc(b.id)}" aria-label="${isFav ? "Remove from favorites" : "Add to favorites"}">${isFav ? "❤️" : "🤍"}</button>` : ""}
        </div>
        <div class="book-info">
          <div class="book-title">${esc(b.title)}</div>
          <div class="book-author">${esc(b.author)}</div>
          <div class="book-meta">
            <span class="book-rating">
              <span class="star filled">★</span>
              ${b.averageRating > 0 ? b.averageRating.toFixed(1) : "—"}
            </span>
            <span style="color:var(--muted);font-size:.75rem">${b.reviewCount} review${b.reviewCount !== 1 ? "s" : ""}</span>
          </div>
        </div>
      </div>`;
  }

  function attachCardListeners() {
    document.querySelectorAll(".book-card").forEach(card => {
      const navigate_ = () => navigate(`/books/${card.dataset.id}`);
      card.addEventListener("click", navigate_);
      card.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") navigate_(); });
    });

    if (!currentUser) return;

    document.querySelectorAll(".fav-btn").forEach(btn => {
      btn.addEventListener("click", async (e) => {
        e.stopPropagation();
        const bookId = btn.dataset.bookId;
        btn.disabled = true;
        try {
          const result = await api.toggleFavorite(bookId);
          if (result.favorited) favoriteIds.add(bookId);
          else favoriteIds.delete(bookId);
          btn.className = `fav-btn${result.favorited ? " favorited" : ""}`;
          btn.textContent = result.favorited ? "❤️" : "🤍";
          btn.setAttribute("aria-label", result.favorited ? "Remove from favorites" : "Add to favorites");
          if (currentUser) currentUser.favoriteBookIds = result.favoriteBookIds;
        } catch { showToast("Couldn't update favorites", "error"); }
        btn.disabled = false;
      });
    });
  }

  const doSearch = debounce(async (val) => {
    search = val;
    allBooks = await api.listBooks(val ? { search: val } : {}).catch(() => []);
    renderBooks();
  }, 350);

  document.getElementById("search-input").addEventListener("input", (e) => doSearch(e.target.value));

  load();
}

function skeletonBooks() {
  return Array.from({ length: 8 }, () => `
    <div class="skeleton-book">
      <div class="skeleton" style="aspect-ratio:2/3"></div>
      <div style="padding:.85rem">
        <div class="skeleton" style="height:.8rem;margin-bottom:.5rem;border-radius:4px"></div>
        <div class="skeleton" style="height:.7rem;width:60%;border-radius:4px"></div>
      </div>
    </div>`).join("");
}
