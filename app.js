const state = {
  sections: [],
  activeView: "sections",
  activeSection: null,
  query: "",
  saved: new Set(JSON.parse(localStorage.getItem("immunology.saved") || "[]")),
};

const TOP_LEVEL_TITLES = new Set([
  "I. IMMUNOLOGY: TWO CONNECTED SYSTEMS",
  "II. ORIGIN OF WHITE BLOOD CELLS (LEUKOCYTES)",
  "III. COMMON WHITE BLOOD CELL COUNTS (WBCs) IN BLOOD",
  "IV. INNATE IMMUNE SYSTEM",
  "V. ADAPTIVE IMMUNE SYSTEM",
  "VI. IMMUNE LIGANDS",
  "VII. IMMUNE RECEPTORS",
  "VIII. ADAPTIVE IMMUNE MEMORY",
  "IX. INTESTINAL IMMUNITY",
  "X. AUTOIMMUNITY",
  "XI. ALLERGIC AND HYPERSENSITIVITY REACTION TYPES",
  "XII. VACCINES",
  "XIII. COVID-19",
  "XIV. HIV",
  "XV. CANCER IMMUNOLOGY",
  "XVI. IMMUNOTHERAPY",
]);

const els = {
  status: document.querySelector("#contentStatus"),
  search: document.querySelector("#searchInput"),
  clearSearch: document.querySelector("#clearSearch"),
  tabs: [...document.querySelectorAll(".tab")],
  views: {
    sections: document.querySelector("#sectionsView"),
    search: document.querySelector("#searchView"),
    saved: document.querySelector("#savedView"),
  },
  sectionGrid: document.querySelector("#sectionGrid"),
  searchResults: document.querySelector("#searchResults"),
  savedGrid: document.querySelector("#savedGrid"),
  savedEmpty: document.querySelector("#savedEmpty"),
  reader: document.querySelector("#reader"),
  readerKicker: document.querySelector("#readerKicker"),
  readerHeading: document.querySelector("#readerHeading"),
  readerContent: document.querySelector("#readerContent"),
  backButton: document.querySelector("#backButton"),
  saveButton: document.querySelector("#saveButton"),
  themeToggle: document.querySelector("#themeToggle"),
};

init();

async function init() {
  restoreTheme();
  wireEvents();
  await loadContent();
  renderAll();
  registerServiceWorker();
}

function wireEvents() {
  els.search.addEventListener("input", (event) => {
    state.query = event.target.value.trim();
    if (state.query) setView("search");
    renderSearch();
  });

  els.clearSearch.addEventListener("click", () => {
    state.query = "";
    els.search.value = "";
    renderSearch();
    setView("sections");
  });

  els.tabs.forEach((tab) => {
    tab.addEventListener("click", () => setView(tab.dataset.view));
  });

  els.backButton.addEventListener("click", closeReader);
  els.saveButton.addEventListener("click", toggleSaved);
  els.themeToggle.addEventListener("click", toggleTheme);

  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeReader();
  });
}

async function loadContent() {
  try {
    let text = window.IMMUNOLOGY_SOURCE || "";
    if (!text) {
      const response = await fetch("immunology_summary.txt", { cache: "no-cache" });
      if (!response.ok) throw new Error(`Content request failed: ${response.status}`);
      text = await response.text();
    }
    state.sections = parseSections(text);
    els.status.textContent = `${state.sections.length} sections loaded`;
  } catch (error) {
    els.status.textContent = "Could not load immunology_summary.txt";
    els.sectionGrid.innerHTML = `<div class="empty-state"><h2>Content unavailable</h2><p>${escapeHtml(error.message)}</p></div>`;
  }
}

function parseSections(text) {
  const normalized = text.replace(/\r\n/g, "\n").trim();
  const pattern = /^(I|II|III|IV|V|VI|VII|VIII|IX|X|XI|XII|XIII|XIV|XV|XVI)\.\s+(.+)$/gm;
  const matches = [...normalized.matchAll(pattern)].filter((match) => {
    return TOP_LEVEL_TITLES.has(match[0].trim());
  });

  return matches.map((match, index) => {
    const start = match.index;
    const end = matches[index + 1]?.index ?? normalized.length;
    const raw = normalized.slice(start, end).trim();
    const id = slugify(`${match[1]} ${match[2]}`);
    const lines = raw.split("\n");
    const title = lines.shift().trim();
    const body = lines.join("\n").trim();
    return {
      id,
      number: match[1],
      name: match[2],
      title,
      body,
      summary: makeSummary(body),
      wordCount: body.split(/\s+/).filter(Boolean).length,
    };
  });
}

function makeSummary(body) {
  const firstLines = body
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !line.startsWith("-") && !line.endsWith(":"));
  return firstLines.slice(0, 2).join(" ").slice(0, 190);
}

function renderAll() {
  renderSections();
  renderSaved();
  renderSearch();
}

function renderSections() {
  els.sectionGrid.innerHTML = state.sections.map(sectionCard).join("");
  wireSectionButtons(els.sectionGrid);
}

function renderSaved() {
  const savedSections = state.sections.filter((section) => state.saved.has(section.id));
  els.savedEmpty.hidden = savedSections.length > 0;
  els.savedGrid.innerHTML = savedSections.map(sectionCard).join("");
  wireSectionButtons(els.savedGrid);
}

function renderSearch() {
  const query = state.query.toLowerCase();
  if (!query) {
    els.searchResults.innerHTML =
      '<div class="empty-state"><h2>Search the notes</h2><p>Try “IL-12”, “BCR”, “complement”, or “CAR-T”.</p></div>';
    return;
  }

  const results = state.sections
    .map((section) => {
      const haystack = `${section.title}\n${section.body}`.toLowerCase();
      const score = countMatches(haystack, query);
      return { section, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);

  els.status.textContent = `${results.length} result${results.length === 1 ? "" : "s"}`;

  if (!results.length) {
    els.searchResults.innerHTML =
      '<div class="empty-state"><h2>No matches</h2><p>Try a cell type, cytokine, receptor, disease, or therapy name.</p></div>';
    return;
  }

  els.searchResults.innerHTML = results
    .map(({ section, score }) => {
      const snippet = makeSnippet(section.body, query);
      return `
        <button class="result-card" type="button" data-section="${section.id}">
          <h3>${highlight(section.title, state.query)}</h3>
          <p>${highlight(snippet, state.query)}</p>
          <p class="card-meta">${score} match${score === 1 ? "" : "es"}</p>
        </button>
      `;
    })
    .join("");

  wireSectionButtons(els.searchResults);
}

function sectionCard(section) {
  const saved = state.saved.has(section.id);
  return `
    <button class="section-card" type="button" data-section="${section.id}">
      <div class="card-meta">
        <span>Section ${section.number}</span>
        <span class="${saved ? "saved-dot" : ""}">${saved ? "Saved" : `${section.wordCount} words`}</span>
      </div>
      <h2>${escapeHtml(section.name)}</h2>
      <p>${escapeHtml(section.summary || "Open this section to read the notes.")}</p>
    </button>
  `;
}

function wireSectionButtons(container) {
  [...container.querySelectorAll("[data-section]")].forEach((button) => {
    button.addEventListener("click", () => openSection(button.dataset.section));
  });
}

function openSection(id) {
  const section = state.sections.find((item) => item.id === id);
  if (!section) return;
  state.activeSection = section;
  els.readerKicker.textContent = `Section ${section.number}`;
  els.readerHeading.textContent = section.name;
  els.readerContent.innerHTML = renderMarkdownish(section.body, state.query);
  updateSaveButton();
  els.reader.classList.add("is-open");
  document.body.style.overflow = "hidden";
}

function closeReader() {
  els.reader.classList.remove("is-open");
  document.body.style.overflow = "";
}

function toggleSaved() {
  if (!state.activeSection) return;
  const id = state.activeSection.id;
  if (state.saved.has(id)) state.saved.delete(id);
  else state.saved.add(id);
  localStorage.setItem("immunology.saved", JSON.stringify([...state.saved]));
  updateSaveButton();
  renderSections();
  renderSaved();
}

function updateSaveButton() {
  const saved = state.activeSection && state.saved.has(state.activeSection.id);
  els.saveButton.querySelector("span").textContent = saved ? "★" : "☆";
  els.saveButton.setAttribute("aria-label", saved ? "Remove saved section" : "Save section");
}

function setView(view) {
  state.activeView = view;
  els.tabs.forEach((tab) => tab.classList.toggle("is-active", tab.dataset.view === view));
  Object.entries(els.views).forEach(([key, element]) => {
    element.classList.toggle("is-active", key === view);
  });
  if (view === "saved") renderSaved();
}

function renderMarkdownish(text, query = "") {
  const lines = text.split("\n");
  const html = [];
  let listOpen = false;

  const closeList = () => {
    if (listOpen) {
      html.push("</ul>");
      listOpen = false;
    }
  };

  lines.forEach((raw) => {
    const line = raw.trim();
    if (!line) {
      closeList();
      return;
    }

    if (/^-{5,}$/.test(line)) {
      closeList();
      html.push("<hr />");
      return;
    }

    if (/^[A-Z]\.\s+/.test(line)) {
      closeList();
      html.push(`<h3>${formatInline(line, query)}</h3>`);
      return;
    }

    if (/^(\d+\.|[a-z]\d*\.|[a-z]\.)\s+/.test(line)) {
      closeList();
      html.push(`<h4>${formatInline(line, query)}</h4>`);
      return;
    }

    if (line.startsWith("-") || line.startsWith("→") || line.startsWith("->")) {
      if (!listOpen) {
        html.push("<ul>");
        listOpen = true;
      }
      html.push(`<li>${formatInline(line.replace(/^(-|→|->)\s*/, ""), query)}</li>`);
      return;
    }

    closeList();

    if (line.startsWith("*")) {
      html.push(`<p class="note">${formatInline(line.replace(/^\*\s*/, ""), query)}</p>`);
      return;
    }

    html.push(`<p>${formatInline(line, query)}</p>`);
  });

  closeList();
  return html.join("");
}

function makeSnippet(body, query) {
  const plain = body.replace(/\s+/g, " ");
  const index = plain.toLowerCase().indexOf(query.toLowerCase());
  if (index < 0) return plain.slice(0, 180);
  const start = Math.max(0, index - 70);
  const end = Math.min(plain.length, index + 130);
  return `${start > 0 ? "..." : ""}${plain.slice(start, end)}${end < plain.length ? "..." : ""}`;
}

function countMatches(text, query) {
  return text.split(query).length - 1;
}

function highlight(text, query) {
  if (!query) return escapeHtml(text);
  const escaped = escapeRegExp(query);
  return escapeHtml(text).replace(new RegExp(escaped, "gi"), (match) => `<mark>${match}</mark>`);
}

function formatInline(text, query) {
  return highlight(text, query);
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function restoreTheme() {
  const theme = localStorage.getItem("immunology.theme") || "light";
  document.documentElement.dataset.theme = theme;
}

function toggleTheme() {
  const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = next;
  localStorage.setItem("immunology.theme", next);
}

function registerServiceWorker() {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("service-worker.js").catch(() => {});
  }
}
