import * as api from "/js/api.js";
import { currentUser, navigate, showToast, openModal, closeModal, showConfirm, esc, starsHtml, formatDate, avatarInitial, debounce } from "/js/app.js";

export async function renderClasses(container) {
  if (!currentUser) { navigate("/login"); return; }
  if (currentUser.role === "admin") {
    await renderAdminClasses(container);
  } else {
    await renderStudentClasses(container);
  }
}

async function renderAdminClasses(container) {
  let classes = [], selectedClassId = null, assignments = [], selectedAssignmentId = null;
  let studentsOpen = false, students = [];
  let bookSource = "catalog";
  let selectedBookId = null, selectedBookTitle = null;
  let olQuery = "", olResults = [], olLoading = false;

  container.innerHTML = `
    <div class="page">
      <div class="container">
        <div class="admin-layout">
          <aside class="admin-sidebar">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.75rem">
              <h3 style="margin:0">Classes</h3>
              <button class="btn btn-primary btn-sm" id="create-class-btn">+ New</button>
            </div>
            <div id="class-nav-list"><div class="spinner" style="padding:1rem"></div></div>
          </aside>
          <div id="class-main-panel">
            <div class="empty-state" style="padding:5rem 0">
              <div class="empty-icon">🏫</div>
              <h3>Select a class</h3>
              <p>Choose a class from the sidebar or create a new one.</p>
            </div>
          </div>
        </div>
      </div>
    </div>`;

  document.getElementById("create-class-btn").addEventListener("click", () => showClassModal(null, loadClasses));

  async function loadClasses() {
    classes = await api.listClasses().catch(() => []);
    renderSidebar();
    if (selectedClassId) {
      if (classes.find(c => c.id === selectedClassId)) await loadClassDetail(selectedClassId);
      else { selectedClassId = null; resetMainPanel(); }
    }
  }

  function resetMainPanel() {
    const panel = document.getElementById("class-main-panel");
    if (panel) panel.innerHTML = `<div class="empty-state" style="padding:5rem 0"><div class="empty-icon">🏫</div><h3>Select a class</h3><p>Choose a class from the sidebar or create a new one.</p></div>`;
  }

  function renderSidebar() {
    const nav = document.getElementById("class-nav-list");
    if (!nav) return;
    nav.innerHTML = classes.length
      ? classes.map(c => `
          <div style="display:flex;align-items:flex-start;gap:.2rem;margin-bottom:.3rem">
            <button class="admin-nav-link${c.id === selectedClassId ? " active" : ""}" data-id="${esc(c.id)}" style="flex:1;min-width:0;text-align:left;flex-direction:column;align-items:flex-start;gap:.1rem;overflow:hidden">
              <span style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;width:100%">${esc(c.name)}</span>
              <span class="text-xs text-muted" style="font-weight:400;white-space:nowrap">${c.studentCount} student${c.studentCount !== 1 ? "s" : ""}</span>
            </button>
            <button class="btn btn-ghost btn-sm edit-class-btn" data-id="${esc(c.id)}" style="padding:.3rem .4rem;flex-shrink:0" title="Edit">✏️</button>
            <button class="btn btn-ghost btn-sm delete-class-btn" data-id="${esc(c.id)}" style="padding:.3rem .4rem;flex-shrink:0;color:var(--destructive)" title="Delete">🗑</button>
          </div>`).join("")
      : `<p class="text-xs text-muted" style="padding:.5rem">No classes yet.</p>`;

    nav.querySelectorAll(".admin-nav-link").forEach(btn => {
      btn.addEventListener("click", () => {
        if (selectedClassId !== btn.dataset.id) {
          studentsOpen = false; students = [];
          bookSource = "catalog"; selectedBookId = null; selectedBookTitle = null;
          olQuery = ""; olResults = [];
        }
        selectedClassId = btn.dataset.id;
        selectedAssignmentId = null;
        renderSidebar();
        loadClassDetail(selectedClassId);
      });
    });
    nav.querySelectorAll(".edit-class-btn").forEach(btn => {
      btn.addEventListener("click", e => { e.stopPropagation(); showClassModal(classes.find(c => c.id === btn.dataset.id), loadClasses); });
    });
    nav.querySelectorAll(".delete-class-btn").forEach(btn => {
      btn.addEventListener("click", async e => {
        e.stopPropagation();
        const cls = classes.find(c => c.id === btn.dataset.id);
        if (!await showConfirm({ title: `Delete "${cls?.name || "this class"}"?`, body: "Students and books won't be deleted.", confirmLabel: "Delete Class", destructive: true })) return;
        try {
          await api.deleteClass(btn.dataset.id);
          showToast("Class deleted");
          if (selectedClassId === btn.dataset.id) { selectedClassId = null; resetMainPanel(); }
          await loadClasses();
        } catch (err) { showToast(err.message, "error"); }
      });
    });
  }

  async function loadClassDetail(classId) {
    const panel = document.getElementById("class-main-panel");
    if (!panel) return;
    panel.innerHTML = `<div class="spinner"></div>`;
    assignments = await api.listAssignments(classId).catch(() => []);
    await renderClassDetail(classId);
  }

  async function renderClassDetail(classId) {
    const cls = classes.find(c => c.id === classId);
    const panel = document.getElementById("class-main-panel");
    if (!panel || !cls) return;

    const allBooks = await api.listBooks({ includeArchived: false }).catch(() => []);
    const unassigned = allBooks.filter(b => !b.isBanned && !assignments.some(a => a.bookId === b.id));
    const otherClasses = classes.filter(c => c.id !== classId);

    panel.innerHTML = `
      <div class="page-header" style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:.75rem;margin-bottom:1.5rem">
        <div>
          <h1 style="font-family:var(--font-serif);font-size:1.5rem;font-weight:700">${esc(cls.name)}</h1>
          ${cls.description ? `<p style="color:var(--muted);margin-top:.15rem">${esc(cls.description)}</p>` : ""}
        </div>
        <div style="display:flex;gap:.5rem;align-items:center;flex-wrap:wrap">
          <code style="background:var(--bg);border:1px solid var(--border);padding:.3rem .75rem;border-radius:6px;letter-spacing:.12em;font-weight:700;color:var(--primary)">${esc(cls.code)}</code>
          <span class="badge badge-secondary">${cls.studentCount} student${cls.studentCount !== 1 ? "s" : ""}</span>
        </div>
      </div>

      <div class="card" style="margin-bottom:1.5rem">
        <div class="card-header" style="background:var(--bg);display:flex;justify-content:space-between;align-items:center;cursor:pointer" id="students-toggle">
          <div class="card-title">👥 Students <span class="badge badge-secondary" style="margin-left:.4rem">${cls.studentCount}</span></div>
          <span style="color:var(--muted);font-size:.8rem">${studentsOpen ? "▲ Hide" : "▼ Show"}</span>
        </div>
        <div id="students-panel" style="${studentsOpen ? "" : "display:none"}">
          ${studentsOpen ? renderStudentsList() : ""}
        </div>
      </div>

      <div class="card" style="margin-bottom:1.5rem">
        <div class="card-header" style="background:var(--bg)">
          <div class="card-title">📋 Assignments</div>
        </div>
        <div id="assignments-list">
          ${assignments.length
            ? assignments.map(a => renderAssignmentRow(a)).join("")
            : `<div style="padding:1.25rem 1.5rem;color:var(--muted);font-size:.875rem;font-style:italic;text-align:center">No assignments yet. Add one below.</div>`}
        </div>
        <div id="assign-form-section"></div>
      </div>`;

    renderAssignmentForm(classId, unassigned, otherClasses);
    attachAssignmentHandlers(classId, unassigned, otherClasses);

    document.getElementById("students-toggle")?.addEventListener("click", async () => {
      studentsOpen = !studentsOpen;
      const chevron = document.querySelector("#students-toggle span:last-child");
      if (chevron) chevron.textContent = studentsOpen ? "▲ Hide" : "▼ Show";
      const panel = document.getElementById("students-panel");
      if (!panel) return;
      if (studentsOpen) {
        panel.style.display = "";
        panel.innerHTML = `<div class="spinner" style="padding:1rem"></div>`;
        students = await api.getClassStudents(classId).catch(() => []);
        panel.innerHTML = renderStudentsList();
        attachStudentHandlers(classId);
      } else {
        panel.style.display = "none";
      }
    });

    if (studentsOpen) attachStudentHandlers(classId);
  }

  function renderStudentsList() {
    if (!students.length) return `<div style="padding:1.25rem;text-align:center;color:var(--muted);font-size:.875rem;font-style:italic">No students enrolled yet.</div>`;
    return `<div class="table-wrap">
      <table>
        <thead><tr><th>Student</th><th>Username</th><th>Name Status</th><th style="text-align:right">Actions</th></tr></thead>
        <tbody>
          ${students.map(s => `
            <tr>
              <td>
                <div style="display:flex;align-items:center;gap:.5rem">
                  <div class="avatar" style="width:28px;height:28px;font-size:.75rem;border-width:1px;flex-shrink:0">${avatarInitial(s.displayName || s.username)}</div>
                  <div style="font-weight:600;font-size:.875rem">${esc(s.displayName || s.username)}</div>
                </div>
              </td>
              <td class="text-sm text-muted">@${esc(s.username)}</td>
              <td>${s.nameForcedBy ? `<span class="badge badge-warning" style="font-size:.75rem">🔒 Admin-set</span>` : `<span class="badge badge-outline" style="font-size:.75rem">Self-set</span>`}</td>
              <td style="text-align:right">
                <button class="btn btn-ghost btn-sm force-rename-btn" data-id="${esc(s.id)}" data-name="${esc(s.displayName || "")}">✏️ Rename</button>
              </td>
            </tr>`).join("")}
        </tbody>
      </table>
    </div>`;
  }

  function attachStudentHandlers(classId) {
    document.querySelectorAll(".force-rename-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        const userId = btn.dataset.id;
        openModal("Force Rename Student", `
          <form class="form-stack" id="rename-form">
            <div class="form-group">
              <label class="form-label">New Display Name <span class="required">*</span></label>
              <input class="input" name="displayName" value="${esc(btn.dataset.name)}" placeholder="Full name shown to the class" required autofocus/>
              <div class="form-hint">This will lock the student's display name — they won't be able to change it themselves.</div>
            </div>
            <div id="rename-err" class="form-error" style="display:none"></div>
            <div style="display:flex;justify-content:flex-end;gap:.5rem">
              <button type="button" class="btn btn-ghost" onclick="App.closeModal()">Cancel</button>
              <button type="submit" class="btn btn-primary">Set Name</button>
            </div>
          </form>`);
        document.getElementById("rename-form").addEventListener("submit", async e => {
          e.preventDefault();
          const displayName = new FormData(e.target).get("displayName").trim();
          const b2 = e.target.querySelector("[type=submit]");
          b2.disabled = true; b2.textContent = "Saving…";
          try {
            await api.adminForceRename(userId, displayName);
            showToast("Name updated and locked!"); closeModal();
            students = await api.getClassStudents(classId).catch(() => []);
            const panel = document.getElementById("students-panel");
            if (panel) { panel.innerHTML = renderStudentsList(); attachStudentHandlers(classId); }
          } catch (err) {
            document.getElementById("rename-err").textContent = err.message;
            document.getElementById("rename-err").style.display = "";
            b2.disabled = false; b2.textContent = "Set Name";
          }
        });
      });
    });
  }

  function renderAssignmentRow(a) {
    const isPast = a.deadline && new Date(a.deadline) < new Date();
    return `
      <div data-assignment-id="${esc(a.id)}" style="padding:.9rem 1.25rem;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:.75rem">
        <div style="flex:1;min-width:0">
          <div style="font-weight:600;font-size:.9rem">${esc(a.bookTitle || "Unknown book")}</div>
          <div class="text-xs text-muted" style="margin-top:.2rem;display:flex;gap:.75rem;flex-wrap:wrap">
            ${a.deadline ? `<span ${isPast ? 'style="color:var(--destructive)"' : ""}>${isPast ? "Was due" : "Due"} ${new Date(a.deadline).toLocaleDateString()}</span>` : "<span>No deadline</span>"}
            ${a.minWordCount ? `<span>✍️ ${a.minWordCount} words min</span>` : ""}
            ${a.maxGrade != null ? `<span>🏅 Max grade: ${a.maxGrade}</span>` : ""}
          </div>
        </div>
        <button class="btn btn-outline btn-sm grade-students-btn" data-id="${esc(a.id)}" title="Grade students">📝 Grade Students</button>
        <button class="btn btn-ghost btn-sm edit-assignment-btn" data-id="${esc(a.id)}" data-deadline="${a.deadline ? a.deadline.split("T")[0] : ""}" data-wordcount="${a.minWordCount ?? ""}" data-maxgrade="${a.maxGrade ?? ""}" title="Edit">✏️</button>
        <button class="btn btn-ghost btn-sm delete-assignment-btn" data-id="${esc(a.id)}" style="color:var(--destructive)" title="Remove">🗑</button>
      </div>`;
  }

  function renderAssignmentForm(classId, unassigned, otherClasses) {
    const formSection = document.getElementById("assign-form-section");
    if (!formSection) return;

    formSection.innerHTML = `
      <div style="border-top:2px dashed var(--border);padding:1.25rem">
        <div style="font-weight:600;font-size:.875rem;margin-bottom:.75rem;color:var(--muted)">＋ Add Assignment</div>
        <div class="form-stack" id="new-assignment-form">
          <div class="form-group">
            <label class="form-label">Book <span class="required">*</span></label>
            <div style="display:flex;gap:.4rem;margin-bottom:.5rem">
              <button type="button" class="btn btn-sm ${bookSource === "catalog" ? "btn-primary" : "btn-outline"}" id="bsrc-catalog">📚 Catalog</button>
              <button type="button" class="btn btn-sm ${bookSource === "ol" ? "btn-primary" : "btn-outline"}" id="bsrc-ol">🔍 Open Library</button>
            </div>
            ${bookSource === "catalog" ? `
              <select class="select" id="book-select">
                <option value="">— Select a book —</option>
                ${unassigned.map(b => `<option value="${esc(b.id)}">${esc(b.title)} — ${esc(b.author)}</option>`).join("")}
              </select>
              ${unassigned.length === 0 ? `<div class="text-xs text-muted" style="margin-top:.3rem">All active books are already assigned.</div>` : ""}
            ` : `
              <div class="search-wrap">
                <i class="search-icon">🔍</i>
                <input class="input" id="ol-assign-q" placeholder="Search by title or author…" value="${esc(olQuery)}" autocomplete="off"/>
              </div>
              ${selectedBookId ? `
                <div style="display:flex;align-items:center;gap:.5rem;padding:.5rem .75rem;background:var(--success-bg);border:1px solid #bbf7d0;border-radius:var(--radius);font-size:.85rem;margin-top:.4rem">
                  ✅ <strong>${esc(selectedBookTitle || "Book selected")}</strong>
                  <button type="button" id="clear-ol-book" class="btn btn-ghost btn-sm" style="margin-left:auto;padding:.1rem .35rem">✕</button>
                </div>` : ""}
              <div id="ol-assign-results" style="max-height:200px;overflow-y:auto;margin-top:.4rem">
                ${!olQuery || olQuery.length < 2 ? ""
                  : olLoading ? `<div class="spinner" style="padding:.5rem"></div>`
                  : !olResults.length ? `<p class="text-sm text-muted" style="padding:.5rem;text-align:center">No results for "${esc(olQuery)}"</p>`
                  : olResults.map(r => `
                    <div class="ol-result-item" style="display:flex;align-items:center;gap:.6rem;padding:.55rem .75rem;border:1px solid var(--border);border-radius:var(--radius);margin-bottom:.35rem;cursor:pointer"
                      data-key="${esc(r.openLibKey)}" data-title="${esc(r.title)}" data-author="${esc(r.author)}" data-cover="${esc(r.coverUrl||"")}">
                      <div style="width:26px;height:35px;flex-shrink:0;border-radius:3px;overflow:hidden;border:1px solid var(--border);background:var(--bg);display:flex;align-items:center;justify-content:center;font-size:.65rem">
                        ${r.coverUrl ? `<img src="${esc(r.coverUrl)}" style="width:100%;height:100%;object-fit:cover"/>` : "📖"}
                      </div>
                      <div style="flex:1;min-width:0">
                        <div style="font-size:.85rem;font-weight:600;overflow:hidden;white-space:nowrap;text-overflow:ellipsis">${esc(r.title)}</div>
                        <div class="text-xs text-muted">by ${esc(r.author)}</div>
                      </div>
                    </div>`).join("")}
              </div>
            `}
          </div>
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">Deadline (Optional)</label>
              <input class="input" id="assign-deadline" type="date"/>
            </div>
            <div class="form-group">
              <label class="form-label">Min. Word Count (Optional)</label>
              <input class="input" id="assign-wordcount" type="number" min="1" placeholder="e.g. 200"/>
            </div>
            <div class="form-group">
              <label class="form-label">Max Grade (Optional)</label>
              <input class="input" id="assign-maxgrade" type="number" min="0" placeholder="e.g. 100"/>
            </div>
          </div>
          ${otherClasses.length ? `
            <div class="form-group">
              <label class="form-label">Also assign to:</label>
              <div style="display:flex;flex-direction:column;gap:.3rem;padding:.5rem .65rem;background:var(--bg);border:1px solid var(--border);border-radius:var(--radius);max-height:130px;overflow-y:auto">
                ${otherClasses.map(c => `
                  <label style="display:flex;align-items:center;gap:.5rem;font-size:.85rem;cursor:pointer;padding:.1rem 0">
                    <input type="checkbox" class="extra-class-cb" value="${esc(c.id)}" style="width:14px;height:14px;cursor:pointer"/>
                    ${esc(c.name)}
                  </label>`).join("")}
              </div>
            </div>` : ""}
          <div id="assignment-err" class="form-error" style="display:none"></div>
          <button type="button" class="btn btn-primary btn-sm" id="add-assign-btn" ${bookSource === "catalog" && unassigned.length === 0 ? "disabled" : ""}>Add Assignment</button>
        </div>
      </div>`;

    document.getElementById("bsrc-catalog")?.addEventListener("click", () => {
      bookSource = "catalog"; selectedBookId = null; selectedBookTitle = null; olQuery = ""; olResults = [];
      renderAssignmentForm(classId, unassigned, otherClasses);
    });
    document.getElementById("bsrc-ol")?.addEventListener("click", () => {
      bookSource = "ol"; renderAssignmentForm(classId, unassigned, otherClasses);
      document.getElementById("ol-assign-q")?.focus();
    });

    const olInput = document.getElementById("ol-assign-q");
    if (olInput) {
      const doOlSearch = debounce(async (q) => {
        olQuery = q;
        if (q.length < 2) { olResults = []; renderAssignmentForm(classId, unassigned, otherClasses); return; }
        olLoading = true; renderAssignmentForm(classId, unassigned, otherClasses);
        olResults = await api.searchOpenLib(q).catch(() => []);
        olLoading = false; renderAssignmentForm(classId, unassigned, otherClasses);
        const inp = document.getElementById("ol-assign-q");
        if (inp) { inp.focus(); inp.setSelectionRange(inp.value.length, inp.value.length); }
      }, 500);
      olInput.addEventListener("input", e => doOlSearch(e.target.value));
    }

    document.querySelectorAll(".ol-result-item").forEach(item => {
      item.addEventListener("click", async () => {
        item.style.opacity = ".5"; item.style.pointerEvents = "none";
        try {
          const book = await api.addBook({ title: item.dataset.title, author: item.dataset.author, coverUrl: item.dataset.cover || null, openLibKey: item.dataset.key });
          selectedBookId = book.id; selectedBookTitle = book.title;
          olResults = []; olQuery = ""; renderAssignmentForm(classId, unassigned, otherClasses);
        } catch (err) {
          showToast("Failed to add book: " + err.message, "error");
          item.style.opacity = ""; item.style.pointerEvents = "";
        }
      });
    });
    document.getElementById("clear-ol-book")?.addEventListener("click", () => {
      selectedBookId = null; selectedBookTitle = null; renderAssignmentForm(classId, unassigned, otherClasses);
    });

    document.getElementById("add-assign-btn")?.addEventListener("click", async () => {
      const errEl = document.getElementById("assignment-err");
      errEl.style.display = "none";
      const bookId = bookSource === "catalog"
        ? (document.getElementById("book-select")?.value || "")
        : (selectedBookId || "");
      if (!bookId) {
        errEl.textContent = bookSource === "catalog" ? "Please select a book" : "Please search and select a book from Open Library";
        errEl.style.display = ""; return;
      }
      const deadline = document.getElementById("assign-deadline")?.value || null;
      const minWordCountVal = document.getElementById("assign-wordcount")?.value || null;
      const maxGradeVal = document.getElementById("assign-maxgrade")?.value || null;
      const extraIds = [...document.querySelectorAll(".extra-class-cb:checked")].map(cb => cb.value);
      const btn = document.getElementById("add-assign-btn");
      btn.disabled = true; btn.textContent = "Adding…";
      try {
        const result = await api.createAssignment(classId, {
          bookId, deadline,
          minWordCount: minWordCountVal ? Number(minWordCountVal) : null,
          maxGrade: maxGradeVal ? Number(maxGradeVal) : null,
          additionalClassIds: extraIds,
        });
        showToast("Assignment added!");
        if (result.additionalAssignments?.length) showToast(`Also assigned to ${result.additionalAssignments.length} other class${result.additionalAssignments.length > 1 ? "es" : ""}`);
        assignments = await api.listAssignments(classId).catch(() => []);
        selectedBookId = null; selectedBookTitle = null; bookSource = "catalog"; olQuery = ""; olResults = [];
        await renderClassDetail(classId);
      } catch (err) {
        errEl.textContent = err.message; errEl.style.display = "";
        btn.disabled = false; btn.textContent = "Add Assignment";
      }
    });
  }

  function attachAssignmentHandlers(classId, unassigned, otherClasses) {
    document.querySelectorAll(".grade-students-btn").forEach(btn => {
      btn.addEventListener("click", async () => {
        const id = btn.dataset.id;
        const a = assignments.find(x => x.id === id);
        openModal(`Grade: ${esc(a?.bookTitle || "Assignment")}`, `<div class="spinner"></div>`, true);
        const subs = await api.getSubmissions(id).catch(() => []);
        renderGradingModal(id, a, subs);
      });
    });

    document.querySelectorAll(".delete-assignment-btn").forEach(btn => {
      btn.addEventListener("click", async () => {
        const a = assignments.find(x => x.id === btn.dataset.id);
        if (!await showConfirm({ title: `Remove "${a?.bookTitle || "this assignment"}"?`, body: "This will remove the assignment from the class.", confirmLabel: "Remove", destructive: true })) return;
        try {
          await api.deleteAssignment(btn.dataset.id);
          showToast("Assignment removed");
          assignments = await api.listAssignments(classId).catch(() => []);
          await renderClassDetail(classId);
        } catch (err) { showToast(err.message, "error"); }
      });
    });

    document.querySelectorAll(".edit-assignment-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        const id = btn.dataset.id;
        const a = assignments.find(x => x.id === id);
        openModal(`Edit: ${esc(a?.bookTitle || "Assignment")}`, `
          <form class="form-stack" id="edit-assign-form">
            <div class="form-row">
              <div class="form-group">
                <label class="form-label">Deadline</label>
                <input class="input" type="date" name="deadline" value="${esc(btn.dataset.deadline)}"/>
              </div>
              <div class="form-group">
                <label class="form-label">Min. Word Count</label>
                <input class="input" type="number" name="minWordCount" value="${esc(btn.dataset.wordcount)}" placeholder="None" min="1"/>
              </div>
              <div class="form-group">
                <label class="form-label">Max Grade</label>
                <input class="input" type="number" name="maxGrade" value="${esc(btn.dataset.maxgrade)}" placeholder="None" min="0"/>
              </div>
            </div>
            <div id="edit-assign-err" class="form-error" style="display:none"></div>
            <div style="display:flex;justify-content:flex-end;gap:.5rem">
              <button type="button" class="btn btn-ghost" onclick="App.closeModal()">Cancel</button>
              <button type="submit" class="btn btn-primary">Save</button>
            </div>
          </form>`);
        document.getElementById("edit-assign-form").addEventListener("submit", async e => {
          e.preventDefault();
          const fd = new FormData(e.target);
          const b2 = e.target.querySelector("[type=submit]");
          b2.disabled = true; b2.textContent = "Saving…";
          try {
            await api.updateAssignment(id, {
              deadline: fd.get("deadline") || null,
              minWordCount: fd.get("minWordCount") ? Number(fd.get("minWordCount")) : null,
              maxGrade: fd.get("maxGrade") ? Number(fd.get("maxGrade")) : null,
            });
            showToast("Assignment updated"); closeModal();
            assignments = await api.listAssignments(classId).catch(() => []);
            await renderClassDetail(classId);
          } catch (err) {
            document.getElementById("edit-assign-err").textContent = err.message;
            document.getElementById("edit-assign-err").style.display = "";
            b2.disabled = false; b2.textContent = "Save";
          }
        });
      });
    });
  }

  function renderGradingModal(assignmentId, a, subs) {
    const content = document.getElementById("modal-content");
    if (!content) return;

    if (!subs.length) {
      content.innerHTML = `<div class="empty-state"><div class="empty-icon">👥</div><h3>No students enrolled</h3></div>`;
      return;
    }

    content.innerHTML = `
      <div style="margin-bottom:1rem;font-size:.875rem;color:var(--muted)">
        ${subs.filter(s => s.grade).length} of ${subs.length} students graded
        ${a?.minWordCount ? ` · Min. ${a.minWordCount} words` : ""}
        ${a?.maxGrade != null ? ` · Max grade: <strong style="color:var(--text)">${a.maxGrade}</strong>` : ""}
        ${a?.deadline ? ` · Due ${new Date(a.deadline).toLocaleDateString()}` : ""}
      </div>
      <div style="display:flex;flex-direction:column;gap:.75rem" id="grading-rows">
        ${subs.map(s => gradingRowHtml(s, a)).join("")}
      </div>`;

    content.querySelectorAll(".grade-input-area").forEach(area => {
      area.querySelectorAll(".save-grade-btn").forEach(btn => {
        btn.addEventListener("click", async () => {
          const row = btn.closest("[data-student-id]");
          const grade = row.querySelector(".grade-input")?.value.trim() || null;
          const feedback = row.querySelector(".feedback-input")?.value.trim() || null;

          if (grade && a?.maxGrade != null) {
            const numGrade = parseFloat(grade);
            if (!isNaN(numGrade) && numGrade > a.maxGrade) {
              if (!await showConfirm({ title: "Grade Exceeds Maximum", body: `${numGrade} exceeds the maximum grade of ${a.maxGrade}. Save anyway?`, confirmLabel: "Save Anyway" })) return;
            }
          }

          btn.disabled = true; btn.textContent = "Saving…";
          try {
            await api.saveGrade(assignmentId, btn.dataset.student, { grade, feedback });
            showToast("Grade saved");
            const subs2 = await api.getSubmissions(assignmentId).catch(() => []);
            renderGradingModal(assignmentId, a, subs2);
          } catch (err) { showToast(err.message, "error"); btn.disabled = false; btn.textContent = "Save"; }
        });
      });

      area.querySelectorAll(".edit-grade-btn").forEach(btn => {
        btn.addEventListener("click", () => {
          const row = btn.closest("[data-student-id]");
          const gradeDisplay = row.querySelector(".grade-display");
          const gradeForm = row.querySelector(".grade-form");
          gradeDisplay.style.display = "none";
          gradeForm.style.display = "";
          gradeForm.querySelector(".grade-input")?.focus();
        });
      });
    });
  }

  function gradingRowHtml(s, a) {
    const { student: st, review, meetsWordCount, grade } = s;
    const isPast = a?.deadline && new Date(a.deadline) < new Date();

    let statusBadge;
    if (grade?.grade) statusBadge = `<span class="badge badge-success">✓ ${esc(grade.grade)}</span>`;
    else if (!review) statusBadge = `<span class="badge badge-outline">No review yet</span>`;
    else if (meetsWordCount === false) statusBadge = `<span class="badge badge-warning">⚠️ Too short</span>`;
    else statusBadge = `<span class="badge badge-secondary">Submitted</span>`;

    return `
      <div data-student-id="${esc(st.id)}" style="border:1px solid var(--border);border-radius:var(--radius);overflow:hidden">
        <div style="padding:.75rem 1rem;background:var(--bg);display:flex;align-items:center;gap:.75rem;flex-wrap:wrap">
          <div class="avatar" style="width:32px;height:32px;font-size:.85rem;border-width:1px;flex-shrink:0">${avatarInitial(st.displayName || st.username)}</div>
          <div style="flex:1;min-width:0">
            <div style="font-weight:600;font-size:.875rem">${esc(st.displayName || st.username)}</div>
            <div class="text-xs text-muted">@${esc(st.username)}</div>
          </div>
          ${statusBadge}
          ${review ? starsHtml(review.rating) : ""}
          ${review ? `<span class="badge badge-secondary" style="font-size:.75rem">${review.wordCount} words</span>` : ""}
        </div>

        ${review ? `
          <div style="padding:.6rem 1rem;border-top:1px solid var(--border);font-size:.82rem;line-height:1.55;color:var(--muted);${review.spoiler ? "font-style:italic" : ""}">
            ${review.spoiler ? "⚠️ [Spoiler] " : ""}${esc(review.text.length > 300 ? review.text.slice(0, 300) + "…" : review.text)}
          </div>` : ""}

        <div class="grade-input-area" style="padding:.75rem 1rem;border-top:1px solid var(--border)">
          ${grade?.grade ? `
            <div class="grade-display" style="display:flex;align-items:center;gap:.75rem;flex-wrap:wrap">
              <div>
                <span class="text-xs text-muted">Grade:</span>
                <strong style="font-size:1.1rem;margin-left:.3rem">${esc(grade.grade)}</strong>
              </div>
              ${grade.feedback ? `<div style="flex:1;font-size:.82rem;color:var(--muted);font-style:italic">"${esc(grade.feedback)}"</div>` : ""}
              <button class="btn btn-ghost btn-sm edit-grade-btn" title="Edit grade">✏️ Edit</button>
            </div>
            <div class="grade-form" style="display:none">
              ${gradeFormHtml(st.id, grade, a?.maxGrade)}
            </div>
          ` : `
            <div class="grade-form">
              ${gradeFormHtml(st.id, grade, a?.maxGrade)}
            </div>
          `}
        </div>
      </div>`;
  }

  function gradeFormHtml(studentId, existing, maxGrade) {
    return `
      <div style="display:flex;gap:.6rem;flex-wrap:wrap;align-items:flex-end">
        <div class="form-group" style="width:130px">
          <label class="form-label" style="font-size:.75rem">Grade${maxGrade != null ? ` <span class="text-muted" style="font-weight:400">(max ${maxGrade})</span>` : ""}</label>
          <input class="input grade-input" style="height:34px;font-size:.85rem" placeholder="A, 85, etc." value="${esc(existing?.grade || "")}"/>
        </div>
        <div class="form-group" style="flex:1;min-width:180px">
          <label class="form-label" style="font-size:.75rem">Feedback (optional)</label>
          <input class="input feedback-input" style="height:34px;font-size:.85rem" placeholder="Keep it up, work on…" value="${esc(existing?.feedback || "")}"/>
        </div>
        <button class="btn btn-primary btn-sm save-grade-btn" data-student="${esc(studentId)}" style="flex-shrink:0">${existing?.grade ? "Update" : "Save"}</button>
      </div>`;
  }

  loadClasses();
}

function showClassModal(existing, onSuccess) {
  const c = existing || {};
  openModal(existing ? "Edit Class" : "Create New Class", `
    <form class="form-stack" id="class-form">
      <div class="form-group">
        <label class="form-label">Class Name <span class="required">*</span></label>
        <input class="input" name="name" value="${esc(c.name||"")}" placeholder="e.g. AP English Lit P3" required/>
      </div>
      <div class="form-group">
        <label class="form-label">Description (Optional)</label>
        <textarea class="textarea" name="description" style="min-height:70px">${esc(c.description||"")}</textarea>
      </div>
      <div id="class-err" class="form-error" style="display:none"></div>
      <div style="display:flex;justify-content:flex-end;gap:.5rem">
        <button type="button" class="btn btn-ghost" onclick="App.closeModal()">Cancel</button>
        <button type="submit" class="btn btn-primary">${existing ? "Save Changes" : "Create Class"}</button>
      </div>
    </form>`);

  document.getElementById("class-form").addEventListener("submit", async e => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const btn = e.target.querySelector("[type=submit]");
    btn.disabled = true; btn.textContent = "Saving…";
    try {
      if (existing) await api.updateClass(existing.id, { name: fd.get("name"), description: fd.get("description") || null });
      else await api.createClass({ name: fd.get("name"), description: fd.get("description") || null });
      showToast(existing ? "Class updated" : "Class created");
      onSuccess(); closeModal();
    } catch (err) {
      document.getElementById("class-err").textContent = err.message;
      document.getElementById("class-err").style.display = "";
      btn.disabled = false; btn.textContent = existing ? "Save Changes" : "Create Class";
    }
  });
}

async function renderStudentClasses(container) {
  let classes = [], selectedClassId = null, progress = [], filterTab = "all";

  container.innerHTML = `
    <div class="page">
      <div class="container">
        <div class="admin-layout">
          <aside class="admin-sidebar">
            <h3 style="margin-bottom:.75rem">My Classes</h3>
            <div id="class-nav-list"><div class="spinner" style="padding:1rem"></div></div>
            <hr class="divider" style="margin:.85rem 0"/>
            <div style="font-size:.75rem;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:.07em;margin-bottom:.5rem">Join a Class</div>
            <form id="join-form-sidebar">
              <div style="display:flex;gap:.35rem;margin-bottom:.35rem">
                <input class="input" id="join-code-input" placeholder="Class code" style="height:32px;font-size:.8rem;letter-spacing:.04em;text-transform:uppercase;flex:1" maxlength="6"/>
                <button type="submit" class="btn btn-primary btn-sm">Join</button>
              </div>
              <div id="join-err-sidebar" class="form-error" style="display:none;font-size:.75rem"></div>
            </form>
          </aside>
          <div id="class-main-panel">
            <div class="empty-state" style="padding:5rem 0">
              <div class="empty-icon">📚</div>
              <h3>Select a class</h3>
              <p>Choose a class to view your assignments and grades.</p>
            </div>
          </div>
        </div>
      </div>
    </div>`;

  async function load() {
    classes = await api.listClasses().catch(() => []);
    renderSidebar();
    if (selectedClassId) loadClassDetail(selectedClassId);
  }

  function renderSidebar() {
    const nav = document.getElementById("class-nav-list");
    if (!nav) return;
    nav.innerHTML = classes.length
      ? classes.map(c => `
          <button class="admin-nav-link${c.id === selectedClassId ? " active" : ""}" data-id="${esc(c.id)}" style="display:flex;justify-content:space-between;align-items:center;gap:.5rem">
            <span style="text-align:left">${esc(c.name)}</span>
            <button class="btn btn-ghost btn-sm leave-btn" data-id="${esc(c.id)}" style="padding:.2rem .4rem;flex-shrink:0;font-size:.8rem" title="Leave class">↩</button>
          </button>`).join("")
      : `<p class="text-xs text-muted" style="padding:.5rem">You haven't joined any classes yet.</p>`;

    nav.querySelectorAll(".admin-nav-link").forEach(btn => {
      btn.addEventListener("click", e => {
        if (e.target.closest(".leave-btn")) return;
        selectedClassId = btn.dataset.id;
        filterTab = "all";
        renderSidebar();
        loadClassDetail(selectedClassId);
      });
    });

    nav.querySelectorAll(".leave-btn").forEach(btn => {
      btn.addEventListener("click", async e => {
        e.stopPropagation();
        const cls = classes.find(c => c.id === btn.dataset.id);
        if (!await showConfirm({ title: `Leave "${cls?.name || "this class"}"?`, body: "You can rejoin later with the class code.", confirmLabel: "Leave Class", destructive: true })) return;
        try {
          await api.leaveClass(btn.dataset.id);
          showToast("Left class");
          if (selectedClassId === btn.dataset.id) {
            selectedClassId = null;
            document.getElementById("class-main-panel").innerHTML = `<div class="empty-state" style="padding:5rem 0"><div class="empty-icon">📚</div><h3>Select a class</h3><p>Choose a class to view your assignments and grades.</p></div>`;
          }
          await load();
        } catch (err) { showToast(err.message, "error"); }
      });
    });
  }

  async function loadClassDetail(classId) {
    const panel = document.getElementById("class-main-panel");
    if (!panel) return;
    panel.innerHTML = `<div class="spinner"></div>`;
    progress = await api.getClassProgress(classId).catch(() => []);
    renderClassDetail(classId);
  }

  function matchesTab(item, tab) {
    const { review, meetsWordCount, grade } = item;
    if (tab === "all") return true;
    if (tab === "graded") return !!grade?.grade;
    if (tab === "complete") return !!review && (meetsWordCount === null || meetsWordCount === true) && !grade?.grade;
    if (tab === "incomplete") return !review || (meetsWordCount === false && !grade?.grade);
    return true;
  }

  function renderClassDetail(classId) {
    const cls = classes.find(c => c.id === classId);
    const panel = document.getElementById("class-main-panel");
    if (!panel || !cls) return;

    const filtered = progress.filter(item => matchesTab(item, filterTab));

    panel.innerHTML = `
      <div style="margin-bottom:1.5rem">
        <h1 style="font-family:var(--font-serif);font-size:1.5rem;font-weight:700">${esc(cls.name)}</h1>
        ${cls.description ? `<p style="color:var(--muted);margin-top:.15rem">${esc(cls.description)}</p>` : ""}
      </div>

      <div class="pill-tabs" style="margin-bottom:1.25rem">
        ${["all","incomplete","complete","graded"].map(t => {
          const count = progress.filter(i => matchesTab(i, t)).length;
          const label = t === "all" ? "All" : t === "incomplete" ? "Incomplete" : t === "complete" ? "Complete" : "Graded";
          return `<button class="pill-tab${filterTab === t ? " active" : ""}" data-tab="${t}">${label} <span style="opacity:.65;font-size:.75rem">${count}</span></button>`;
        }).join("")}
      </div>

      ${!progress.length ? `
        <div class="card"><div class="empty-state">
          <div class="empty-icon">📋</div><h3>No assignments yet</h3>
          <p>Your teacher hasn't added any assignments to this class yet.</p>
        </div></div>`
      : filtered.length
        ? filtered.map(item => renderProgressCard(item)).join("")
        : `<div class="empty-state"><div class="empty-icon">✅</div><h3>Nothing here</h3><p>No assignments match this filter.</p></div>`}`;

    panel.querySelectorAll(".pill-tab").forEach(btn => {
      btn.addEventListener("click", () => { filterTab = btn.dataset.tab; renderClassDetail(classId); });
    });
  }

  function renderProgressCard(item) {
    const { assignment: a, review, meetsWordCount, grade } = item;
    const isPast = a.deadline && new Date(a.deadline) < new Date();
    let statusBadge;
    if (grade?.grade) statusBadge = `<span class="badge badge-success">✓ Graded: ${esc(grade.grade)}</span>`;
    else if (!review) statusBadge = `<span class="badge badge-outline">No review yet</span>`;
    else if (meetsWordCount === false) statusBadge = `<span class="badge badge-warning">⚠️ Too short</span>`;
    else statusBadge = `<span class="badge badge-secondary">Submitted</span>`;

    return `
      <div class="card" style="margin-bottom:1rem">
        <div style="padding:1.25rem;display:flex;align-items:center;gap:1rem;flex-wrap:wrap">
          <div style="flex:1;min-width:0">
            <a href="#/books/${esc(a.bookId)}" style="font-weight:600;font-size:.95rem;color:var(--primary);text-decoration:none">${esc(a.bookTitle || "Unknown book")}</a>
            <div class="text-xs text-muted" style="margin-top:.2rem">by ${esc(a.bookAuthor || "")}</div>
          </div>
          ${statusBadge}
        </div>

        <div style="padding:.6rem 1.25rem;border-top:1px solid var(--border);display:flex;flex-wrap:wrap;gap:1.5rem">
          <div>
            <div class="text-xs text-muted" style="margin-bottom:.2rem">Deadline</div>
            <div class="text-sm${isPast && !review ? ' style="color:var(--destructive)"' : ''}">
              ${a.deadline ? new Date(a.deadline).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "None"}
              ${isPast && a.deadline ? " (past)" : ""}
            </div>
          </div>
          ${a.minWordCount ? `<div>
            <div class="text-xs text-muted" style="margin-bottom:.2rem">Min. words</div>
            <div class="text-sm">${a.minWordCount}${review ? ` (yours: ${review.wordCount})` : ""}</div>
          </div>` : ""}
          ${review ? `<div>
            <div class="text-xs text-muted" style="margin-bottom:.2rem">Your rating</div>
            <div>${starsHtml(review.rating)}</div>
          </div>` : ""}
          <div>
            <div class="text-xs text-muted" style="margin-bottom:.2rem">Grade</div>
            <div class="text-sm">${grade?.grade ? `<span style="font-weight:700;font-size:1rem">${esc(grade.grade)}</span>` : `<span class="text-muted">Not graded yet</span>`}</div>
          </div>
          ${grade?.feedback ? `<div style="flex:1;min-width:200px">
            <div class="text-xs text-muted" style="margin-bottom:.2rem">Feedback</div>
            <div class="text-sm" style="font-style:italic">"${esc(grade.feedback)}"</div>
          </div>` : ""}
        </div>

        ${review ? `
          <div style="padding:.75rem 1.25rem;border-top:1px solid var(--border);background:var(--bg)">
            <div class="text-xs text-muted" style="text-transform:uppercase;letter-spacing:.06em;font-weight:600;margin-bottom:.4rem">Your Review</div>
            ${review.spoiler ? `<div class="text-xs" style="color:var(--warning);margin-bottom:.3rem">⚠️ Contains spoilers</div>` : ""}
            <p style="font-size:.85rem;line-height:1.6;color:var(--text);margin:0">${esc(review.text)}</p>
            <a href="#/books/${esc(a.bookId)}" class="btn btn-ghost btn-sm" style="margin-top:.5rem;padding:.25rem 0;color:var(--primary)">Edit review →</a>
          </div>` : `
          <div style="padding:.6rem 1.25rem;border-top:1px solid var(--border)">
            <a href="#/books/${esc(a.bookId)}" class="btn btn-primary btn-sm">Write a Review →</a>
          </div>`}
      </div>`;
  }

  document.getElementById("join-form-sidebar").addEventListener("submit", async e => {
    e.preventDefault();
    const code = document.getElementById("join-code-input").value.trim();
    const errEl = document.getElementById("join-err-sidebar");
    errEl.style.display = "none";
    const btn = e.target.querySelector("[type=submit]");
    btn.disabled = true; btn.textContent = "…";
    try {
      await api.joinClass(code);
      showToast("Joined class!");
      document.getElementById("join-code-input").value = "";
      await load();
    } catch (err) {
      errEl.textContent = err.message || "Invalid code";
      errEl.style.display = "";
    }
    btn.disabled = false; btn.textContent = "Join";
  });

  load();
}
