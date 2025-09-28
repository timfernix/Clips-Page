const API_ENDPOINT = "http://localhost:8787/api/clips";

const state = {
  clips: [],
  loading: true,
  error: null,
  search: "",
  champion: "all",
  role: "all",
  category: "all",
  tags: new Set(),
  favoritesOnly: false,
  sort: "newest",
  startMuted: false
};

const elements = {
  clipsGrid: document.getElementById("clips-grid"),
  clipsCount: document.getElementById("clips-count"),
  emptyState: document.getElementById("empty-state"),
  searchInput: document.getElementById("search"),
  championFilter: document.getElementById("champion-filter"),
  roleFilter: document.getElementById("role-filter"),
  categoryFilter: document.getElementById("category-filter"),
  sortFilter: document.getElementById("sort-filter"),
  tagFilter: document.getElementById("tag-filter"),
  favoritesToggle: document.getElementById("favorites-toggle"),
  muteToggle: document.getElementById("mute-toggle"),
  themeToggle: document.getElementById("theme-toggle"),
  scrollTop: document.getElementById("scroll-top"),
  addClipBtn: document.getElementById("add-clip-btn"),
  addClipDialog: document.getElementById("add-clip-dialog"),
  filtersForm: document.getElementById("filters-form")
};

const THEME_KEY = "summoner-clips-theme";
const MUTE_KEY = "summoner-clips-muted";

function formatDate(dateString) {
  const date = new Date(dateString);
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric"
  }).format(date);
}

function coerceTags(rawTags) {
  if (!rawTags) {
    return [];
  }

  if (Array.isArray(rawTags)) {
    return rawTags.map(String).map((tag) => tag.trim()).filter(Boolean);
  }

  if (typeof rawTags === "string") {
    const trimmed = rawTags.trim();
    if (!trimmed) {
      return [];
    }

    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed.map(String).map((tag) => tag.trim()).filter(Boolean);
      }
    } catch (error) {
    }

    return trimmed
      .split(/[,;|]/)
      .map((tag) => tag.trim())
      .filter(Boolean);
  }

  if (typeof rawTags === "object") {
    const values = Object.values(rawTags);
    return values
      .flatMap((value) => (Array.isArray(value) ? value : [value]))
      .map(String)
      .map((tag) => tag.trim())
      .filter(Boolean);
  }

  return [];
}

function normalizeClip(raw) {
  if (!raw) {
    return null;
  }

  const idCandidate =
    raw.uuid ||
    raw.id ||
    raw.clip_id ||
    (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `clip-${Date.now()}-${Math.random().toString(16).slice(2)}`);

  const recordedAtSource = raw.recorded_at ?? raw.recordedAt ?? raw.recorded_at_utc;
  const recordedAt = recordedAtSource ? new Date(recordedAtSource) : new Date();

  return {
    id: String(idCandidate),
    title: raw.title ?? "Untitled highlight",
    champion: raw.champion ?? raw.hero ?? "Unknown Champion",
    role: raw.role ?? raw.lane ?? "Unknown role",
    category: raw.category ?? raw.play_type ?? "General",
    tags: coerceTags(raw.tags),
    videoUrl: raw.videoUrl ?? raw.video_url ?? raw.video ?? "",
    thumbnailUrl: raw.thumbnailUrl ?? raw.thumbnail_url ?? raw.thumbnail ?? "",
    favorite:
      raw.favorite === true ||
      raw.favorite === 1 ||
      raw.favorite === "1" ||
      raw.favorite === "true",
    recordedAt: recordedAt.toISOString(),
    notes: raw.notes ?? raw.description ?? ""
  };
}

function normalizeClipsPayload(payload) {
  const data = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.clips)
    ? payload.clips
    : Array.isArray(payload?.data)
    ? payload.data
    : [];

  return data
    .map((item) => normalizeClip(item))
    .filter((clip) => clip && clip.videoUrl);
}

async function loadClips() {
  state.loading = true;
  state.error = null;
  render();

  try {
    const response = await fetch(API_ENDPOINT, {
      headers: { Accept: "application/json" }
    });

    if (!response.ok) {
      throw new Error(`Request failed with status ${response.status}`);
    }

    const payload = await response.json();
    state.clips = normalizeClipsPayload(payload);
    state.error = null;
  } catch (error) {
    console.error("Failed to load clips", error);
    state.error =
      "Unable to load clips from your API. Update the MySQL connection and API endpoint, then refresh.";
    state.clips = [];
  } finally {
    state.loading = false;
    hydrateFilters();
    render();
  }
}

function populateSelect(selectEl, values, stateKey) {
  while (selectEl.options.length > 1) {
    selectEl.remove(1);
  }

  const fragment = document.createDocumentFragment();
  values.forEach((value) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value;
    fragment.appendChild(option);
  });
  selectEl.appendChild(fragment);

  if (values.includes(selectEl.value)) {
    return;
  }

  selectEl.value = "all";
  if (stateKey) {
    state[stateKey] = "all";
  }
}

function getUnique(field) {
  return Array.from(new Set(state.clips.map((clip) => clip[field] || "Unknown"))).sort(
    (a, b) => a.localeCompare(b)
  );
}

function buildTagFilters() {
  const tags = Array.from(new Set(state.clips.flatMap((clip) => clip.tags || []))).sort(
    (a, b) => a.localeCompare(b)
  );
  state.tags.forEach((tag) => {
    if (!tags.includes(tag)) {
      state.tags.delete(tag);
    }
  });
  const fragment = document.createDocumentFragment();
  elements.tagFilter.innerHTML = "";

  if (tags.length === 0) {
    const placeholder = document.createElement("p");
    placeholder.className = "tag-filter__empty";
    placeholder.textContent = "Tags will appear after your clips load.";
    elements.tagFilter.appendChild(placeholder);
    return;
  }

  tags.forEach((tag) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "tag-chip";
    button.textContent = tag;
    button.dataset.tag = tag;
    button.dataset.active = state.tags.has(tag) ? "true" : "false";
    button.addEventListener("click", () => {
      if (state.tags.has(tag)) {
        state.tags.delete(tag);
        button.dataset.active = "false";
      } else {
        state.tags.add(tag);
        button.dataset.active = "true";
      }
      render();
    });
    fragment.appendChild(button);
  });
  elements.tagFilter.appendChild(fragment);
}

function hydrateFilters() {
  populateSelect(elements.championFilter, getUnique("champion"), "champion");
  populateSelect(elements.roleFilter, getUnique("role"), "role");
  populateSelect(elements.categoryFilter, getUnique("category"), "category");
  buildTagFilters();
}

function applyFilters(data) {
  const dataset = Array.isArray(data) ? data : [];
  return dataset
    .filter((clip) => {
      const { search, champion, role, category, tags, favoritesOnly } = state;
      const haystack = `${clip.title ?? ""} ${clip.champion ?? ""} ${clip.notes ?? ""}`.toLowerCase();
      const matchesSearch = !search || haystack.includes(search.toLowerCase());
      const matchesChampion = champion === "all" || clip.champion === champion;
      const matchesRole = role === "all" || clip.role === role;
      const matchesCategory = category === "all" || clip.category === category;
      const clipTags = Array.isArray(clip.tags) ? clip.tags : [];
      const matchesTags =
        tags.size === 0 || Array.from(tags).every((tag) => clipTags.includes(tag));
      const matchesFavorites = !favoritesOnly || clip.favorite;
      return (
        matchesSearch &&
          matchesChampion &&
          matchesRole &&
          matchesCategory &&
          matchesTags &&
          matchesFavorites
      );
    })
    .sort((a, b) => {
      switch (state.sort) {
        case "oldest":
          return new Date(a.recordedAt) - new Date(b.recordedAt);
        case "champion":
          return a.champion.localeCompare(b.champion);
        case "newest":
        default:
          return new Date(b.recordedAt) - new Date(a.recordedAt);
      }
    });
}

function createClipCard(clip) {
  const card = document.createElement("article");
  card.className = "clip-card reveal";
  card.tabIndex = 0;

  const mediaWrapper = document.createElement("div");
  mediaWrapper.className = "clip-media";

  const video = document.createElement("video");
  video.src = clip.videoUrl;
  video.controls = true;
  video.preload = "metadata";
  if (clip.thumbnailUrl) {
    video.poster = clip.thumbnailUrl;
  }
  video.playsInline = true;
  video.dataset.clipId = clip.id;
  if (state.startMuted) {
    video.muted = true;
    video.setAttribute("muted", "");
  } else {
    video.muted = false;
    video.removeAttribute("muted");
  }
  video.addEventListener("play", () => pauseOtherVideos(clip.id));

  const body = document.createElement("div");
  body.className = "clip-card__body";

  const header = document.createElement("header");
  header.innerHTML = `<h3>${clip.title}</h3>`;

  const meta = document.createElement("div");
  meta.className = "clip-card__meta";
  meta.innerHTML = `
    <span>🛡️ ${clip.role}</span>
    <span>🏷️ ${clip.category}</span>
    <span>📅 ${formatDate(clip.recordedAt)}</span>
  `;

  const note = document.createElement("p");
  note.className = "clip-note";
  if (clip.notes) {
    note.textContent = clip.notes;
  } else {
    note.textContent = "Add notes in your database to surface more context here.";
    note.classList.add("clip-note--placeholder");
  }

  const tags = document.createElement("div");
  tags.className = "tag-list";
  clip.tags.forEach((tag) => {
    const pill = document.createElement("span");
    pill.className = "tag-pill";
    pill.textContent = tag;
    tags.appendChild(pill);
  });

  const actions = document.createElement("div");
  actions.className = "clip-actions";

  const favoriteBtn = document.createElement("button");
  favoriteBtn.type = "button";
  favoriteBtn.innerHTML = clip.favorite ? "★ Favorited" : "☆ Mark favorite";
  favoriteBtn.addEventListener("click", () => {
    clip.favorite = !clip.favorite;
    favoriteBtn.innerHTML = clip.favorite ? "★ Favorited" : "☆ Mark favorite";
    render();
  });

  const copyBtn = document.createElement("button");
  copyBtn.type = "button";
  copyBtn.textContent = "Copy clip ID";
  copyBtn.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(clip.id);
      copyBtn.textContent = "Copied!";
      setTimeout(() => (copyBtn.textContent = "Copy clip ID"), 1500);
    } catch (error) {
      console.error("Clipboard copy failed", error);
      copyBtn.textContent = "Copy failed";
    }
  });

  actions.append(favoriteBtn, copyBtn);

  body.append(header, meta, note, tags, actions);

  mediaWrapper.appendChild(video);
  card.append(mediaWrapper, body);

  return card;
}

function pauseOtherVideos(activeId) {
  document.querySelectorAll("video[data-clip-id]").forEach((video) => {
    if (video.dataset.clipId !== activeId) {
      video.pause();
    }
  });
}

function render() {
  if (state.loading) {
    elements.clipsGrid.innerHTML = "";
    elements.clipsCount.textContent = "Loading clips…";
    updateEmptyState(0);
    return;
  }

  const filtered = applyFilters(state.clips);
  elements.clipsGrid.innerHTML = "";
  const fragment = document.createDocumentFragment();
  filtered.forEach((clip) => {
    fragment.appendChild(createClipCard(clip));
  });
  elements.clipsGrid.appendChild(fragment);

  elements.clipsCount.textContent = `${filtered.length} clip${filtered.length === 1 ? "" : "s"}`;
  updateEmptyState(filtered.length);
  revealCards();
}

const defaultEmptyMessage = elements.emptyState.textContent.trim();

function updateEmptyState(visibleCount) {
  if (state.loading) {
    elements.emptyState.hidden = false;
    elements.emptyState.textContent = "Loading clips from your database…";
    return;
  }

  if (state.error) {
    elements.emptyState.hidden = false;
    elements.emptyState.textContent = state.error;
    return;
  }

  if (visibleCount === 0) {
    elements.emptyState.hidden = false;
    elements.emptyState.textContent = defaultEmptyMessage;
  } else {
    elements.emptyState.hidden = true;
    elements.emptyState.textContent = defaultEmptyMessage;
  }
}

function revealCards() {
  const observer = new IntersectionObserver(
    (entries, obs) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          obs.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.15 }
  );

  document.querySelectorAll(".clip-card.reveal").forEach((card) => observer.observe(card));
}

function handleThemeInit() {
  const stored = localStorage.getItem(THEME_KEY);
  if (stored) {
    document.documentElement.dataset.theme = stored;
  } else {
    document.documentElement.dataset.theme = "dark";
  }
  updateThemeButton();
}

function updateThemeButton() {
  const isDark = document.documentElement.dataset.theme !== "light";
  elements.themeToggle.querySelector(".theme-toggle__icon").textContent = isDark ? "🌙" : "☀️";
  document.body.classList.toggle("theme-dark", isDark);
}

function bindEvents() {
  elements.searchInput.addEventListener("input", (event) => {
    state.search = event.target.value.trim();
    render();
  });

  elements.championFilter.addEventListener("change", (event) => {
    state.champion = event.target.value;
    render();
  });

  elements.roleFilter.addEventListener("change", (event) => {
    state.role = event.target.value;
    render();
  });

  elements.categoryFilter.addEventListener("change", (event) => {
    state.category = event.target.value;
    render();
  });

  elements.sortFilter.addEventListener("change", (event) => {
    state.sort = event.target.value;
    render();
  });

  elements.favoritesToggle.addEventListener("change", (event) => {
    state.favoritesOnly = event.target.checked;
    render();
  });

  elements.muteToggle.addEventListener("change", (event) => {
    state.startMuted = event.target.checked;
    localStorage.setItem(MUTE_KEY, state.startMuted ? "true" : "false");
    document.querySelectorAll("video[data-clip-id]").forEach((video) => {
      video.muted = state.startMuted;
    });
  });

  elements.filtersForm.addEventListener("reset", () => {
    setTimeout(() => {
      state.search = "";
      state.champion = "all";
      state.role = "all";
      state.category = "all";
      state.tags.clear();
      state.favoritesOnly = false;
      state.sort = "newest";
      elements.tagFilter.querySelectorAll(".tag-chip").forEach((chip) => {
        chip.dataset.active = "false";
      });
      render();
    }, 0);
  });

  elements.themeToggle.addEventListener("click", () => {
    const current = document.documentElement.dataset.theme;
    const next = current === "light" ? "dark" : "light";
    document.documentElement.dataset.theme = next;
    localStorage.setItem(THEME_KEY, next);
    updateThemeButton();
  });

  elements.scrollTop.addEventListener("click", () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  });

  window.addEventListener("scroll", () => {
    const isVisible = window.scrollY > 280;
    elements.scrollTop.dataset.visible = isVisible ? "true" : "false";
  });

  elements.addClipBtn.addEventListener("click", () => {
    if (typeof elements.addClipDialog.showModal === "function") {
      elements.addClipDialog.showModal();
    } else {
      alert("Use the provided schema to add clips from your database tool.");
    }
  });
}

function restorePreferences() {
  const muted = localStorage.getItem(MUTE_KEY);
  if (muted === "true") {
    state.startMuted = true;
    elements.muteToggle.checked = true;
  }
}

function init() {
  handleThemeInit();
  restorePreferences();
  bindEvents();
  render();
  loadClips();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}