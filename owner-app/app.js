const apiOrigin = window.location.protocol === "file:" ? "http://127.0.0.1:8000" : "";
const ownerApiBase = `${apiOrigin}/api/owner`;
const authApiBase = `${apiOrigin}/api/auth`;
const ownerCachePrefix = "utsavOwnerPage:";
let ownerAuthRecoveryPromise = null;

function navigate(url) {
  if (window.location.pathname === url) return;
  window.location.replace(url);
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, {
    credentials: "include",
    headers: {
      "X-Utsav-Role": "owner",
      ...(options.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
      ...(options.headers || {}),
    },
    ...options,
  });
  if (!response.ok) {
    const error = new Error((await response.text()) || `Request failed: ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return response.json();
}

function setStatus(selector, message, isError = false) {
  const element = document.querySelector(selector);
  if (!element) return;
  element.textContent = message;
  element.classList.toggle("is-error", isError);
}

function ensureSessionBanner() {
  let banner = document.querySelector("[data-session-banner]");
  if (banner) return banner;
  banner = document.createElement("div");
  banner.className = "fa-session-banner";
  banner.setAttribute("data-session-banner", "true");
  banner.hidden = true;
  document.body.appendChild(banner);
  return banner;
}

function showSessionBanner(message, isError = false) {
  const banner = ensureSessionBanner();
  banner.textContent = message;
  banner.hidden = false;
  banner.classList.toggle("is-error", isError);
}

function hideSessionBanner() {
  const banner = document.querySelector("[data-session-banner]");
  if (!banner) return;
  banner.hidden = true;
  banner.textContent = "";
  banner.classList.remove("is-error");
}

function writeCache(key, value) {
  try {
    sessionStorage.setItem(`${ownerCachePrefix}${key}`, JSON.stringify(value));
  } catch {}
}

function readCache(key) {
  try {
    const raw = sessionStorage.getItem(`${ownerCachePrefix}${key}`);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function populateProfile(profile) {
  document.querySelectorAll("[data-owner-name]").forEach((el) => (el.textContent = profile.name || ""));
  document.querySelectorAll("[data-owner-title]").forEach((el) => (el.textContent = profile.title || ""));
  document.querySelectorAll("[data-owner-cluster]").forEach((el) => (el.textContent = profile.cluster || ""));
}

function renderKpis(container, items) {
  if (!container) return;
  container.innerHTML = items
    .map(
      (item) => `
        <article class="fa-kpi-card">
          <span>${item.label}</span>
          <strong>${item.value}</strong>
          <p>${item.note || ""}</p>
        </article>
      `
    )
    .join("");
}

function renderGrid(container, items) {
  if (!container) return;
  container.innerHTML = items
    .map(
      (item) => `
        <article class="fa-detail-card">
          <span>${item.label}</span>
          <strong>${item.value}</strong>
          <p>${item.note || ""}</p>
        </article>
      `
    )
    .join("");
}

function renderList(container, items) {
  if (!container) return;
  if (!items.length) {
    container.innerHTML = `<div class="fa-empty-state">Abhi koi record available nahi hai.</div>`;
    return;
  }
  container.innerHTML = items
    .map(
      (item) => `
        <div class="fa-list-row">
          <div>
            <span>${item.label}</span>
            ${item.note ? `<p>${item.note}</p>` : ""}
          </div>
          <strong>${item.value}</strong>
        </div>
      `
    )
    .join("");
}

function renderOwnerFarmerAccounts(container, items) {
  if (!container) return;
  if (!items.length) {
    container.innerHTML = `<div class="fa-empty-state">Abhi koi record available nahi hai.</div>`;
    return;
  }
  container.innerHTML = items
    .map(
      (item) => `
        <div class="fa-list-row">
          <div>
            <span>${item.label}</span>
            <p>${item.note || ""}</p>
          </div>
          <div class="fa-form-actions">
            <strong>${item.value}</strong>
            <button class="fa-secondary-btn" type="button" data-owner-edit-farmer="${encodeURIComponent(JSON.stringify(item))}">Edit</button>
          </div>
        </div>
      `
    )
    .join("");
}

function renderOwnerSaleRules(container, items) {
  if (!container) return;
  if (!items.length) {
    container.innerHTML = `<div class="fa-empty-state">Abhi koi trigger configured nahi hai.</div>`;
    return;
  }
  container.innerHTML = items
    .map(
      (item) => `
        <div class="fa-list-row">
          <div>
            <span>${item.label}</span>
            <p>${item.note || ""}</p>
          </div>
          <div class="fa-form-actions">
            <strong>${item.value}</strong>
            <button class="fa-secondary-btn" type="button" data-owner-edit-sale-rule="${encodeURIComponent(JSON.stringify(item))}">Edit Trigger</button>
          </div>
        </div>
      `
    )
    .join("");
}

function renderOwnerFarmDirectory(container, items) {
  if (!container) return;
  if (!items.length) {
    container.innerHTML = `<div class="fa-empty-state">Abhi koi record available nahi hai.</div>`;
    return;
  }
  container.innerHTML = items
    .map(
      (item) => `
        <article class="fa-detail-card owner-edit-card">
          <span>${item.label}</span>
          <strong>${item.value}</strong>
          <p>${item.note || ""}</p>
          <div class="owner-edit-card-actions">
            <button class="fa-secondary-btn" type="button" data-owner-edit-farm-card="${encodeURIComponent(JSON.stringify(item))}">Edit Farm</button>
            <button class="fa-secondary-btn" type="button" data-owner-edit-batch-card="${encodeURIComponent(JSON.stringify(item))}">Edit Batch</button>
          </div>
        </article>
      `
    )
    .join("");
}

function renderOwnerLatestEntries(container, items) {
  if (!container) return;
  if (!items.length) {
    container.innerHTML = `<div class="fa-empty-state">Abhi koi record available nahi hai.</div>`;
    return;
  }
  container.innerHTML = items
    .map(
      (item) => `
        <div class="fa-list-row owner-edit-row">
          <div>
            <span>${item.label}</span>
            ${item.note ? `<p>${item.note}</p>` : ""}
          </div>
          <div class="owner-edit-row-side">
            <strong>${item.value}</strong>
            <div class="owner-edit-row-actions">
              <button class="fa-secondary-btn" type="button" data-owner-edit-farm-card="${encodeURIComponent(JSON.stringify(item))}">Edit Farm</button>
              <button class="fa-secondary-btn" type="button" data-owner-edit-batch-card="${encodeURIComponent(JSON.stringify(item))}">Edit Batch</button>
            </div>
          </div>
        </div>
      `
    )
    .join("");
}

function renderDailyEntryHierarchy(container, farms) {
  const summary = document.querySelector("#owner-operations-daily-summary");
  const controls = document.querySelector("#owner-operations-daily-controls");
  if (!container) return;
  if (!farms?.length) {
    if (summary) summary.innerHTML = "";
    if (controls) controls.innerHTML = "";
    container.innerHTML = `<div class="fa-empty-state">Abhi koi record available nahi hai.</div>`;
    return;
  }

  const today = new Date().toISOString().slice(0, 10);
  const preparedFarms = farms.map((farm, index) => {
    const dailyGroups = farm.daily_groups || [];
    const latestGroup = dailyGroups[0] || null;
    const todayGroup = dailyGroups.find((group) => group.entry_date === today) || null;
    const pendingSheds = Math.max(0, (farm.shed_count || 0) - (todayGroup?.shed_count || 0));
    const watchCount = dailyGroups.reduce(
      (count, group) =>
        count +
        (group.rows || []).filter(
          (row) =>
            row.has_entry &&
            ((row.mortality || 0) > 0 ||
              (row.culls || 0) > 0 ||
              Boolean(row.issues) ||
              ["wet", "very wet"].includes((row.litter_condition || "").toLowerCase()))
        ).length,
      0
    );
    const totalReportedSheds = dailyGroups.reduce((count, group) => count + (group.shed_count || 0), 0);
    const farmKey = `farm-${index}-${farm.farmer_code || farm.farm_name || farm.farmer_name || "unknown"}`;
    const shedMap = new Map();
    dailyGroups.forEach((group) => {
      (group.rows || []).forEach((row) => {
        const key = row.shed_name || "Unknown shed";
        if (!shedMap.has(key)) {
          shedMap.set(key, {
            shed_name: key,
            entry_count: 0,
            latest_entry_date: "",
            latest_weight_g: 0,
            latest_mortality: 0,
            latest_litter: "",
            latest_photo_url: "",
            latest_photo_name: "",
            entries: [],
          });
        }
        const shedRecord = shedMap.get(key);
        if (row.has_entry) {
          shedRecord.entry_count += 1;
          if (!shedRecord.latest_entry_date) {
            shedRecord.latest_entry_date = group.entry_date;
            shedRecord.latest_weight_g = Number(row.avg_weight_g) || 0;
            shedRecord.latest_mortality = Number(row.mortality) || 0;
            shedRecord.latest_litter = row.litter_condition || "";
            shedRecord.latest_photo_url = row.litter_photo_url || "";
            shedRecord.latest_photo_name = row.litter_photo_name || "";
          }
          shedRecord.entries.push({
            entry_date: group.entry_date,
            ...row,
          });
        }
      });
    });
    const shedRecords = Array.from(shedMap.values()).sort((a, b) =>
      a.shed_name.localeCompare(b.shed_name, undefined, { numeric: true, sensitivity: "base" })
    );
    return {
      ...farm,
      farmKey,
      latestGroup,
      todayGroup,
      pendingSheds,
      watchCount,
      totalReportedSheds,
      historyDays: dailyGroups.length,
      shedRecords,
    };
  });

  const totalFarms = farms.length;
  const totalSheds = farms.reduce((count, farm) => count + (farm.shed_count || 0), 0);
  const totalEntries = farms.reduce(
    (count, farm) => count + (farm.daily_groups || []).reduce((dayCount, day) => dayCount + (day.shed_count || 0), 0),
    0
  );
  const activeBatches = farms.filter((farm) => farm.current_batch).length;

  if (summary) {
    summary.innerHTML = `
      <article>
        <span>Farms</span>
        <strong>${totalFarms}</strong>
      </article>
      <article>
        <span>Sheds</span>
        <strong>${totalSheds}</strong>
      </article>
      <article>
        <span>Daily entries</span>
        <strong>${totalEntries}</strong>
      </article>
      <article>
        <span>Active batches</span>
        <strong>${activeBatches}</strong>
      </article>
    `;
  }

  const state = {
    search: "",
    mode: "latest",
    selectedFarmKey: "",
    selectedShedName: "",
  };

  const filterLabels = {
    latest: "All active farms",
    today: "Today focus",
    pending: "Pending sheds",
    watch: "Watch list",
  };

  const getVisibleFarms = () => {
    const search = state.search.trim().toLowerCase();
    return preparedFarms.filter((farm) => {
      const haystack = [farm.farm_name, farm.farmer_name, farm.farmer_code, farm.cluster, farm.current_batch]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (search && !haystack.includes(search)) return false;
      if (state.mode === "today") return Boolean(farm.todayGroup) || farm.pendingSheds > 0;
      if (state.mode === "pending") return farm.pendingSheds > 0;
      if (state.mode === "watch") return farm.watchCount > 0;
      return true;
    });
  };

  const renderControls = (visibleFarms) => {
    if (!controls) return;
    const selectedFarm = preparedFarms.find((farm) => farm.farmKey === state.selectedFarmKey);
    const selectedShed = selectedFarm?.shedRecords.find((shed) => shed.shed_name === state.selectedShedName);

    if (!selectedFarm) {
      controls.innerHTML = `
        <div class="owner-daily-controls-bar">
          <label class="owner-daily-search">
            <span>Search farmer or farm</span>
            <input
              type="search"
              value="${state.search}"
              placeholder="Search by farm, farmer, code, cluster"
              data-owner-daily-search
            />
          </label>
          <div class="owner-daily-mode-group" role="tablist" aria-label="Daily entry filters">
            ${Object.entries(filterLabels)
              .map(
                ([mode, label]) => `
                  <button
                    type="button"
                    class="owner-daily-mode-chip ${state.mode === mode ? "is-active" : ""}"
                    data-owner-daily-mode="${mode}"
                  >
                    ${label}
                  </button>
                `
              )
              .join("")}
          </div>
          <div class="owner-daily-results">
            <strong>${visibleFarms.length}</strong>
            <span>farms visible</span>
          </div>
        </div>
      `;
      return;
    }

    controls.innerHTML = `
      <div class="owner-daily-pathbar">
        <div class="owner-daily-breadcrumbs">
          <button type="button" class="owner-daily-crumb ${selectedShed ? "" : "is-active"}" data-owner-back="farms">Farms</button>
          <span>/</span>
          <button type="button" class="owner-daily-crumb ${selectedFarm && !selectedShed ? "is-active" : ""}" data-owner-back="sheds">
            ${selectedFarm.farm_name || selectedFarm.farmer_name || "Selected farm"}
          </button>
          ${
            selectedShed
              ? `<span>/</span><span class="owner-daily-crumb is-active">${selectedShed.shed_name}</span>`
              : ""
          }
        </div>
        <div class="owner-daily-path-actions">
          ${
            selectedShed
              ? `<button type="button" class="fa-secondary-btn" data-owner-back="sheds">Back to sheds</button>`
              : `<button type="button" class="fa-secondary-btn" data-owner-back="farms">Back to farms</button>`
          }
        </div>
      </div>
    `;
  };

  const renderFarms = () => {
    const visibleFarms = getVisibleFarms();
    renderControls(visibleFarms);

    if (!visibleFarms.length) {
      container.innerHTML = `<div class="fa-empty-state">Search ya filter ke hisaab se koi farm match nahi hua.</div>`;
      return;
    }

    if (!state.selectedFarmKey) {
      container.innerHTML = `
        <div class="owner-daily-level-grid owner-daily-farm-grid">
          ${visibleFarms
            .map(
              (farm) => `
                <button type="button" class="owner-daily-level-card owner-daily-farm-card-button" data-owner-select-farm="${farm.farmKey}">
                  <div class="owner-daily-level-head">
                    <div>
                      <span>Farmer / Farm</span>
                      <h4>${farm.farm_name || "-"}</h4>
                      <p>${[farm.farmer_name, farm.farmer_code, farm.cluster].filter(Boolean).join(" • ")}</p>
                    </div>
                  </div>
                  <div class="owner-daily-level-meta">
                    <span>${farm.current_batch ? `Batch ${farm.current_batch}` : "No batch"}</span>
                    <span>${farm.shed_count || 0} sheds</span>
                    <span>${farm.historyDays} days</span>
                    <span>${farm.latest_entry_date ? `Latest ${farm.latest_entry_date}` : "No entry yet"}</span>
                  </div>
                </button>
              `
            )
            .join("")}
        </div>
      `;
      return;
    }

    const selectedFarm = preparedFarms.find((farm) => farm.farmKey === state.selectedFarmKey);
    if (!selectedFarm) {
      state.selectedFarmKey = "";
      state.selectedShedName = "";
      renderFarms();
      return;
    }

    if (!state.selectedShedName) {
      container.innerHTML = `
        <section class="owner-daily-focus-card">
          <div class="owner-hierarchy-farm-head owner-daily-static-head">
            <div class="owner-hierarchy-title">
              <span>Selected farm</span>
              <h4>${selectedFarm.farm_name || "-"}</h4>
              <p>${[selectedFarm.farmer_name, selectedFarm.farmer_code, selectedFarm.cluster].filter(Boolean).join(" • ")}</p>
            </div>
            <div class="owner-hierarchy-chip-row">
              <span class="owner-hierarchy-chip">${selectedFarm.current_batch ? `Batch ${selectedFarm.current_batch}` : "No batch"}</span>
              <span class="owner-hierarchy-chip">${selectedFarm.bird_age_days || 0} days</span>
              <span class="owner-hierarchy-chip">${selectedFarm.shed_count || 0} sheds</span>
            </div>
          </div>
          <div class="owner-daily-farm-meta">
            <article><span>History</span><strong>${selectedFarm.historyDays} days</strong></article>
            <article><span>Reported sheds</span><strong>${selectedFarm.totalReportedSheds}</strong></article>
            <article><span>Today status</span><strong>${selectedFarm.todayGroup ? `${selectedFarm.todayGroup.shed_count}/${selectedFarm.shed_count || 0}` : `0/${selectedFarm.shed_count || 0}`}</strong></article>
            <article><span>Watch items</span><strong>${selectedFarm.watchCount}</strong></article>
          </div>
        </section>
        <div class="owner-daily-level-grid owner-daily-shed-grid">
          ${selectedFarm.shedRecords
            .map(
              (shed) => `
                <button type="button" class="owner-daily-level-card owner-daily-shed-card" data-owner-select-shed="${shed.shed_name}">
                  <div class="owner-daily-level-head">
                    <div>
                      <span>Shed</span>
                      <h4>${shed.shed_name}</h4>
                      <p>${shed.entry_count ? `${shed.entry_count} reporting days` : "No entries yet"}</p>
                    </div>
                  </div>
                  <div class="owner-daily-level-meta">
                    <span>${shed.latest_entry_date ? `Latest ${shed.latest_entry_date}` : "No latest entry"}</span>
                    <span>${shed.latest_weight_g ? `${shed.latest_weight_g} g` : "No weight"}</span>
                    <span>${shed.latest_mortality ? `${shed.latest_mortality} mortality` : "No mortality"}</span>
                    <span>${shed.latest_litter || "No litter note"}</span>
                    ${shed.latest_photo_url ? `<span>Photo attached</span>` : ""}
                  </div>
                </button>
              `
            )
            .join("")}
        </div>
      `;
      return;
    }

    const selectedShed = selectedFarm.shedRecords.find((shed) => shed.shed_name === state.selectedShedName);
    if (!selectedShed) {
      state.selectedShedName = "";
      renderFarms();
      return;
    }

    container.innerHTML = `
      <section class="owner-daily-focus-card">
        <div class="owner-hierarchy-farm-head owner-daily-static-head">
          <div class="owner-hierarchy-title">
            <span>Shed history</span>
            <h4>${selectedShed.shed_name}</h4>
            <p>${[selectedFarm.farm_name, selectedFarm.farmer_name, selectedFarm.current_batch ? `Batch ${selectedFarm.current_batch}` : ""]
              .filter(Boolean)
              .join(" • ")}</p>
          </div>
          <div class="owner-hierarchy-chip-row">
            <span class="owner-hierarchy-chip">${selectedShed.entry_count} reported days</span>
            <span class="owner-hierarchy-chip">${selectedFarm.historyDays} cycle days</span>
            <span class="owner-hierarchy-chip owner-hierarchy-chip-muted">${selectedShed.latest_entry_date ? `Latest ${selectedShed.latest_entry_date}` : "No entry yet"}</span>
          </div>
        </div>
      </section>
      <div class="owner-daily-entry-list">
        ${
          selectedShed.entries.length
            ? selectedShed.entries
                .map(
                  (entry) => `
                    <article class="owner-daily-entry-card">
                      <div class="owner-daily-entry-head">
                        <div class="owner-hierarchy-title">
                          <span>Date</span>
                          <h5>${entry.entry_date}</h5>
                        </div>
                        <div class="owner-hierarchy-chip-row">
                          <span class="owner-hierarchy-chip owner-hierarchy-chip-dark">${entry.opening_birds} live</span>
                          <span class="owner-hierarchy-chip owner-hierarchy-chip-dark">${entry.avg_weight_g} g</span>
                          ${entry.litter_photo_url ? `<span class="owner-hierarchy-chip owner-hierarchy-chip-dark">Photo attached</span>` : ""}
                        </div>
                      </div>
                      ${
                        entry.litter_photo_url
                          ? `
                            <div class="owner-daily-entry-media owner-daily-entry-media-prominent">
                              <span class="owner-daily-entry-media-label">Litter photo</span>
                              <a class="owner-daily-entry-photo-link" href="${entry.litter_photo_url}" target="_blank" rel="noopener noreferrer">
                                <img src="${entry.litter_photo_url}" alt="${entry.litter_photo_name || "Litter photo"}" loading="lazy" />
                                <strong>Open full photo</strong>
                              </a>
                            </div>
                          `
                          : ""
                      }
                      <div class="owner-daily-entry-metrics">
                        <article><span>Mortality</span><strong>${entry.mortality}</strong></article>
                        <article><span>Culls</span><strong>${entry.culls}</strong></article>
                        <article><span>Feed</span><strong>${entry.feed_used_bags} bags</strong></article>
                        <article><span>Water</span><strong>${entry.water_liters} L</strong></article>
                        <article><span>Temp</span><strong>${entry.temperature_c} C</strong></article>
                        <article><span>Humidity</span><strong>${entry.humidity_pct}%</strong></article>
                        <article><span>Litter</span><strong>${entry.litter_condition || "-"}</strong></article>
                        <article><span>Uniformity</span><strong>${entry.uniformity_pct}%</strong></article>
                      </div>
                      ${
                        entry.litter_notes || entry.issues || entry.remarks
                          ? `<p class="owner-daily-entry-note">${[entry.litter_notes, entry.issues, entry.remarks].filter(Boolean).join(" • ")}</p>`
                          : ""
                      }
                    </article>
                  `
                )
                .join("")
            : `<div class="fa-empty-state">Is shed ke liye abhi koi dated entry available nahi hai.</div>`
        }
      </div>
    `;
  };

  renderFarms();

  if (controls) {
    controls.oninput = (event) => {
      const searchInput = event.target.closest("[data-owner-daily-search]");
      if (!searchInput) return;
      state.search = searchInput.value || "";
      renderFarms();
    };
    controls.onclick = (event) => {
      const modeButton = event.target.closest("[data-owner-daily-mode]");
      if (modeButton) {
        state.mode = modeButton.getAttribute("data-owner-daily-mode") || "latest";
        renderFarms();
        return;
      }
      const backButton = event.target.closest("[data-owner-back]");
      if (!backButton) return;
      const level = backButton.getAttribute("data-owner-back");
      if (level === "farms") {
        state.selectedFarmKey = "";
        state.selectedShedName = "";
      } else if (level === "sheds") {
        state.selectedShedName = "";
      }
      renderFarms();
    };
  }

  container.onclick = (event) => {
    const farmButton = event.target.closest("[data-owner-select-farm]");
    if (farmButton) {
      state.selectedFarmKey = farmButton.getAttribute("data-owner-select-farm") || "";
      state.selectedShedName = "";
      renderFarms();
      return;
    }
    const shedButton = event.target.closest("[data-owner-select-shed]");
    if (shedButton) {
      state.selectedShedName = shedButton.getAttribute("data-owner-select-shed") || "";
      renderFarms();
    }
  };

  container.onchange = null;
}

function renderDashboardData(data) {
  if (!data) return;
  populateProfile(data.profile);
  renderKpis(document.querySelector("#owner-kpis"), data.kpis);
  renderGrid(document.querySelector("#owner-farms"), data.farms);
  renderList(document.querySelector("#owner-priority"), data.priority);
  renderList(document.querySelector("#owner-field-activity"), data.field_activity);
  renderList(document.querySelector("#owner-latest-reporting"), data.latest_reporting);
  renderList(document.querySelector("#owner-feed-visibility"), data.feed_visibility);
  renderList(document.querySelector("#owner-health-watch"), data.health_watch);
  renderList(document.querySelector("#owner-uploads"), data.uploads);
}

function renderFarmsData(data) {
  if (!data) return;
  populateProfile(data.profile);
  renderOwnerFarmDirectory(document.querySelector("#owner-farms-directory"), data.farms);
  renderOwnerLatestEntries(document.querySelector("#owner-farms-latest-entries"), data.latest_entries);
  renderOwnerFarmerAccounts(document.querySelector("#owner-farmer-accounts"), data.farmer_accounts || []);
  renderList(document.querySelector("#owner-field-officers"), data.field_officers || []);
  populateFarmerSelect(data.farmer_accounts || []);
  syncSelectedFarmerMeta();
}

function renderOperationsData(data) {
  if (!data) return;
  populateProfile(data.profile);
  renderList(document.querySelector("#owner-operations-requests"), data.requests);
  renderList(document.querySelector("#owner-operations-photos"), data.photos);
  renderList(document.querySelector("#owner-operations-visits"), data.visits);
  renderList(document.querySelector("#owner-operations-daily-entries"), data.daily_entries);
  renderDailyEntryHierarchy(document.querySelector("#owner-operations-daily-hierarchy"), data.daily_entry_hierarchy);
}

function renderFinanceData(data) {
  if (!data) return;
  populateProfile(data.profile);
  renderKpis(document.querySelector("#owner-finance-kpis"), data.kpis);
  renderList(document.querySelector("#owner-finance-documents"), data.documents);
  renderList(document.querySelector("#owner-finance-inward"), data.feed_inward);
}

function renderOwnerPartyDirectory(container, items) {
  if (!container) return;
  if (!items.length) {
    container.innerHTML = `<div class="fa-empty-state">Abhi koi party contact add nahi hua hai.</div>`;
    return;
  }
  container.innerHTML = items
    .map(
      (item) => `
        <div class="fa-list-row owner-edit-row">
          <div>
            <span>${item.label}</span>
            <p>${item.note || ""}</p>
          </div>
          <div class="owner-edit-row-side">
            <strong>${item.value}</strong>
            <div class="owner-edit-row-actions">
              <button class="fa-secondary-btn" type="button" data-owner-edit-party="${encodeURIComponent(JSON.stringify(item))}">Edit Party</button>
            </div>
          </div>
        </div>
      `
    )
    .join("");
}

function renderSaleReadyQueue(container, items) {
  if (!container) return;
  if (!items.length) {
    container.innerHTML = `<div class="fa-empty-state">Abhi koi farm ready-weight trigger par nahi aaya hai.</div>`;
    return;
  }
  container.innerHTML = items
    .map(
      (item) => `
        <article class="owner-sale-card">
          <div class="owner-sale-card-head">
            <div>
              <span>${item.farm_name}</span>
              <strong>${item.value}</strong>
            </div>
            <div class="owner-sale-chip-row">
              <span class="owner-sale-chip">Target ${item.ready_weight_g} g</span>
              <span class="owner-sale-chip">${item.auto_whatsapp_enabled ? "Auto WhatsApp" : "Manual share"}</span>
            </div>
          </div>
          <p class="owner-sale-card-note">${item.note || ""}</p>
          <div class="owner-sale-party-list">
            ${
              item.parties.length
                ? item.parties
                    .map(
                      (party) => `
                        <span class="owner-sale-party-pill">${party.name} • ${party.phone}</span>
                      `
                    )
                    .join("")
                : `<span class="owner-sale-party-pill owner-sale-party-pill-muted">No matching party contacts yet</span>`
            }
          </div>
          <p class="owner-sale-message">${item.message_preview}</p>
        </article>
      `
    )
    .join("");
}

function populateSaleRuleSelect(items) {
  const select = document.querySelector("[data-owner-rule-farm-select]");
  if (!select) return;
  const currentValue = select.value;
  select.innerHTML = [
    `<option value="">Choose farm</option>`,
    ...items.map(
      (item) =>
        `<option value="${item.farmer_code || ""}" data-farm-name="${item.farm_name || ""}" data-farmer-name="${item.farmer_name || ""}">${item.farm_name || item.farmer_name || ""}${item.farmer_code ? ` • ${item.farmer_code}` : ""}</option>`
    ),
  ].join("");
  if (currentValue) select.value = currentValue;
}

function resetOwnerPartyForm() {
  const form = document.querySelector("[data-owner-party-form]");
  if (!form) return;
  form.reset();
  const hiddenId = form.querySelector('input[name="party_id"]');
  const submitButton = form.querySelector("[data-owner-party-submit]");
  const cancelButton = form.querySelector("[data-owner-party-cancel]");
  const activeCheckbox = form.querySelector('input[name="is_active"]');
  if (hiddenId) hiddenId.value = "";
  if (submitButton) submitButton.textContent = "Save Party";
  if (cancelButton) cancelButton.hidden = true;
  if (activeCheckbox) activeCheckbox.checked = true;
}

function startOwnerPartyEdit(item) {
  const form = document.querySelector("[data-owner-party-form]");
  if (!form || !item) return;
  form.querySelector('input[name="party_id"]').value = item.id || "";
  form.querySelector('input[name="name"]').value = item.name || "";
  form.querySelector('input[name="phone"]').value = item.phone || "";
  form.querySelector('input[name="market_area"]').value = item.market_area || "";
  form.querySelector('input[name="preferred_clusters"]').value = item.preferred_clusters || "";
  form.querySelector('input[name="preferred_farms"]').value = item.preferred_farms || "";
  form.querySelector('textarea[name="notes"]').value = item.notes || "";
  form.querySelector('input[name="is_active"]').checked = !!item.is_active;
  const submitButton = form.querySelector("[data-owner-party-submit]");
  const cancelButton = form.querySelector("[data-owner-party-cancel]");
  if (submitButton) submitButton.textContent = "Update Party";
  if (cancelButton) cancelButton.hidden = false;
  setStatus(".owner-party-note", `Editing ${item.name || "party"} details.`);
  form.scrollIntoView({ behavior: "smooth", block: "start" });
}

function startOwnerSaleRuleEdit(item) {
  const form = document.querySelector("[data-owner-sale-rule-form]");
  const select = form?.querySelector("[data-owner-rule-farm-select]");
  if (!form || !select || !item?.farmer_code) return;
  select.value = item.farmer_code || "";
  form.querySelector('input[name="ready_weight_g"]').value = item.ready_weight_g || "";
  form.querySelector('input[name="auto_whatsapp_enabled"]').checked = !!item.auto_whatsapp_enabled;
  form.querySelector('textarea[name="notes"]').value = item.notes || "";
  setStatus(".owner-sale-rule-note", `Editing sale trigger for ${item.farm_name || item.farmer_name || "selected farm"}.`);
  form.scrollIntoView({ behavior: "smooth", block: "start" });
}

function renderPartiesData(data) {
  if (!data) return;
  populateProfile(data.profile);
  renderOwnerPartyDirectory(document.querySelector("#owner-party-directory"), data.parties || []);
  renderOwnerSaleRules(document.querySelector("#owner-sale-rule-list"), data.sale_rules || []);
  renderSaleReadyQueue(document.querySelector("#owner-sale-ready-queue"), data.sale_ready_queue || []);
  populateSaleRuleSelect(data.farmer_options || []);
  const note = document.querySelector("#owner-whatsapp-note");
  if (note) note.textContent = data.meta?.whatsapp_note || "";
}

function populateFarmerSelect(items) {
  const select = document.querySelector("[data-owner-farmer-select]");
  if (!select) return;
  const currentValue = select.value;
  const options = [
    `<option value="">Choose farmer</option>`,
    ...items.map(
      (item) =>
        `<option value="${item.farmer_code || ""}" data-farm-name="${item.farm_name || ""}" data-batch="${item.active_batch || ""}" data-current-shed="${item.current_shed || ""}" data-bird-age="${item.bird_age_days || 0}">
          ${(item.farmer_name || item.farm_name || "").trim()}${item.farmer_code ? ` • ${item.farmer_code}` : ""}
        </option>`
    ),
  ];
  select.innerHTML = options.join("");
  if (currentValue) select.value = currentValue;
}

function syncSelectedFarmerMeta() {
  const select = document.querySelector("[data-owner-farmer-select]");
  const farmNameInput = document.querySelector('input[name="farm_name_preview"]');
  const batchInput = document.querySelector('[data-owner-batch-entry] input[name="active_batch"]');
  const shedInput = document.querySelector('[data-owner-batch-entry] input[name="current_shed"]');
  const ageInput = document.querySelector('[data-owner-batch-entry] input[name="bird_age_days"]');
  if (!select || !farmNameInput || !batchInput || !shedInput || !ageInput) return;
  const selectedOption = select.options[select.selectedIndex];
  farmNameInput.value = selectedOption?.dataset.farmName || "";
  batchInput.value = selectedOption?.dataset.batch || "";
  shedInput.value = selectedOption?.dataset.currentShed || "";
  ageInput.value = selectedOption?.dataset.birdAge === "0" ? "" : selectedOption?.dataset.birdAge || "";
}

function resetOwnerEnrollmentForm() {
  const form = document.querySelector("[data-owner-enroll-farmer]");
  if (!form) return;
  form.reset();
  const hiddenCode = form.querySelector('input[name="editing_farmer_code"]');
  const submitButton = form.querySelector("[data-owner-enroll-submit]");
  const cancelButton = form.querySelector("[data-owner-enroll-cancel]");
  if (hiddenCode) hiddenCode.value = "";
  if (submitButton) submitButton.textContent = "Create Enrollment";
  if (cancelButton) cancelButton.hidden = true;
}

function startOwnerFarmerEdit(item) {
  const form = document.querySelector("[data-owner-enroll-farmer]");
  if (!form || !item) return;
  form.querySelector('input[name="editing_farmer_code"]').value = item.farmer_code || "";
  form.querySelector('input[name="farmer_name"]').value = item.farmer_name || "";
  form.querySelector('input[name="phone"]').value = item.phone || "";
  form.querySelector('input[name="password"]').value = "";
  form.querySelector('input[name="cluster"]').value = item.cluster || "";
  form.querySelector('input[name="farm_name"]').value = item.farm_name || "";
  form.querySelector('input[name="farmer_code"]').value = item.farmer_code || "";
  form.querySelector('input[name="field_officer"]').value = item.field_officer || "";
  form.querySelector('input[name="field_officer_phone"]').value = item.field_officer_phone || "";
  form.querySelector('input[name="farm_capacity"]').value = item.farm_capacity || "";
  form.querySelector('input[name="active_sheds"]').value = item.active_sheds || 1;
  const submitButton = form.querySelector("[data-owner-enroll-submit]");
  const cancelButton = form.querySelector("[data-owner-enroll-cancel]");
  if (submitButton) submitButton.textContent = "Save Changes";
  if (cancelButton) cancelButton.hidden = false;
  setStatus(".owner-create-note", `Editing ${item.farmer_name || item.farm_name || "farmer"} account.`);
  form.scrollIntoView({ behavior: "smooth", block: "start" });
}

function startOwnerBatchEdit(item) {
  const form = document.querySelector("[data-owner-batch-entry]");
  const farmerSelect = form?.querySelector("[data-owner-farmer-select]");
  if (!form || !farmerSelect || !item?.farmer_code) return;
  farmerSelect.value = item.farmer_code || "";
  syncSelectedFarmerMeta();
  form.querySelector('input[name="active_batch"]').value = item.active_batch || "";
  form.querySelector('input[name="current_shed"]').value = item.current_shed || "";
  form.querySelector('input[name="bird_age_days"]').value = item.bird_age_days ? item.bird_age_days : "";
  setStatus(".owner-batch-note", `Editing batch details for ${item.farm_name || item.farmer_name || "selected farm"}.`);
  const anchor = document.querySelector("#owner-batch-entry-anchor");
  (anchor || form).scrollIntoView({ behavior: "smooth", block: "start" });
}

async function requireOwnerSession({ allowLoginPage = false } = {}) {
  try {
    const session = await requestJson(`${authApiBase}/session`);
    if (session.role !== "owner") {
      navigate("/owner-app/");
      return null;
    }
    populateProfile(session.user);
    if (allowLoginPage) {
      return session.user;
    }
    return session.user;
  } catch {
    if (!allowLoginPage) {
      navigate("/owner-app/");
    }
    return null;
  }
}

async function ensureOwnerPage() {
  const session = await requireOwnerSession();
  if (!session) return null;
  return session;
}

function goToOwnerDashboard() {
  navigate("/owner-app/dashboard.html");
}

function goToOwnerLogin() {
  navigate("/owner-app/");
}

function showAlreadyLoggedInAction() {
  const loginForm = document.querySelector("[data-owner-login]");
  const note = document.querySelector(".fa-form-note");
  if (!loginForm || !note) return;
  note.textContent = "Aap pehle se login hain. Dashboard kholne ke liye neeche button dabayein.";
  note.classList.remove("is-error");
  let quickButton = document.querySelector("[data-owner-open-dashboard]");
  if (quickButton) return;
  quickButton = document.createElement("button");
  quickButton.type = "button";
  quickButton.className = "fa-secondary-btn";
  quickButton.setAttribute("data-owner-open-dashboard", "true");
  quickButton.textContent = "Open Dashboard";
  quickButton.addEventListener("click", goToOwnerDashboard);
  loginForm.appendChild(quickButton);
}

function handlePageError(error) {
  if (error?.status === 401 || error?.status === 403) {
    recoverOwnerSession();
    return;
  }
  console.error(error);
}

async function recoverOwnerSession() {
  if (ownerAuthRecoveryPromise) return ownerAuthRecoveryPromise;
  showSessionBanner("Session check ho raha hai. Thoda wait karein.");
  ownerAuthRecoveryPromise = (async () => {
    try {
      const session = await requestJson(`${authApiBase}/session`);
      if (session.role === "owner") {
        populateProfile(session.user);
        hideSessionBanner();
        return true;
      }
    } catch {}
    showSessionBanner("Session expire ho gaya hai. Dobara login karein.", true);
    window.setTimeout(() => goToOwnerLogin(), 1200);
    return false;
  })();
  try {
    return await ownerAuthRecoveryPromise;
  } finally {
    ownerAuthRecoveryPromise = null;
  }
}

async function loadDashboard() {
  const data = await requestJson(`${ownerApiBase}/dashboard`);
  writeCache("dashboard", data);
  renderDashboardData(data);
}

async function loadFarms() {
  const data = await requestJson(`${ownerApiBase}/farms`);
  writeCache("farms", data);
  renderFarmsData(data);
}

async function loadOperations() {
  const data = await requestJson(`${ownerApiBase}/operations`);
  writeCache("operations", data);
  renderOperationsData(data);
}

async function loadFinance() {
  const data = await requestJson(`${ownerApiBase}/finance`);
  writeCache("finance", data);
  renderFinanceData(data);
}

async function loadParties() {
  const data = await requestJson(`${ownerApiBase}/parties`);
  writeCache("parties", data);
  renderPartiesData(data);
}

const loginForm = document.querySelector("[data-owner-login]");
if (loginForm) {
  requireOwnerSession({ allowLoginPage: true }).then((user) => {
    if (user) showAlreadyLoggedInAction();
  });
  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(loginForm);
    try {
      const result = await requestJson(`${authApiBase}/login`, {
        method: "POST",
        body: JSON.stringify({
          phone: formData.get("phone"),
          password: formData.get("password"),
          role: "owner",
        }),
      });
      navigate(result.redirect || "/owner-app/dashboard.html");
    } catch {
      setStatus(".fa-form-note", "Login nahi ho paaya. Owner credentials dobara check karein.", true);
    }
  });
}

const enrollFarmerForm = document.querySelector("[data-owner-enroll-farmer]");
if (enrollFarmerForm) {
  const cancelEditButton = enrollFarmerForm.querySelector("[data-owner-enroll-cancel]");
  cancelEditButton?.addEventListener("click", () => {
    resetOwnerEnrollmentForm();
    setStatus(".owner-create-note", "");
  });

  document.addEventListener("click", (event) => {
    const farmerTrigger = event.target.closest("[data-owner-edit-farmer], [data-owner-edit-farm-card]");
    if (farmerTrigger) {
      try {
        startOwnerFarmerEdit(
          JSON.parse(
            decodeURIComponent(
              farmerTrigger.getAttribute("data-owner-edit-farmer") || farmerTrigger.getAttribute("data-owner-edit-farm-card")
            )
          )
        );
      } catch (error) {
        console.error(error);
      }
      return;
    }
    const batchTrigger = event.target.closest("[data-owner-edit-batch-card]");
    if (!batchTrigger) return;
    try {
      startOwnerBatchEdit(JSON.parse(decodeURIComponent(batchTrigger.getAttribute("data-owner-edit-batch-card"))));
    } catch (error) {
      console.error(error);
    }
  });

  enrollFarmerForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(enrollFarmerForm);
    const editingFarmerCode = formData.get("editing_farmer_code");
    const payload = {
      farmer_name: formData.get("farmer_name"),
      phone: formData.get("phone"),
      password: formData.get("password"),
      cluster: formData.get("cluster"),
      farm_name: formData.get("farm_name"),
      farmer_code: formData.get("farmer_code"),
      field_officer: formData.get("field_officer"),
      field_officer_phone: formData.get("field_officer_phone"),
      farm_capacity: formData.get("farm_capacity"),
      active_sheds: Number(formData.get("active_sheds") || 1),
    };

    try {
      const result = await requestJson(editingFarmerCode ? `${ownerApiBase}/farmers/${editingFarmerCode}` : `${ownerApiBase}/farmers`, {
        method: editingFarmerCode ? "PUT" : "POST",
        body: JSON.stringify(payload),
      });
      setStatus(".owner-create-note", editingFarmerCode
        ? `Farmer account update ho gaya: ${result.farmer.farmer_name} • ${result.farmer.phone}`
        : `Farmer account create ho gaya: ${result.farmer.farmer_name} • ${result.farmer.phone} • Password ${result.login_password}`);
      resetOwnerEnrollmentForm();
      const shedsInput = enrollFarmerForm.querySelector('input[name="active_sheds"]');
      if (shedsInput) shedsInput.value = "1";
      loadFarms().catch(console.error);
    } catch (error) {
      setStatus(".owner-create-note", editingFarmerCode
        ? "Farmer update nahi ho paaya. Details dobara check karein."
        : "Farmer create nahi ho paaya. Phone ya farmer code dobara check karein.", true);
    }
  });
}

const partyForm = document.querySelector("[data-owner-party-form]");
if (partyForm) {
  const cancelButton = partyForm.querySelector("[data-owner-party-cancel]");
  cancelButton?.addEventListener("click", () => {
    resetOwnerPartyForm();
    setStatus(".owner-party-note", "");
  });

  document.addEventListener("click", (event) => {
    const partyTrigger = event.target.closest("[data-owner-edit-party]");
    if (partyTrigger) {
      try {
        startOwnerPartyEdit(JSON.parse(decodeURIComponent(partyTrigger.getAttribute("data-owner-edit-party"))));
      } catch (error) {
        console.error(error);
      }
      return;
    }
    const ruleTrigger = event.target.closest("[data-owner-edit-sale-rule]");
    if (!ruleTrigger) return;
    try {
      startOwnerSaleRuleEdit(JSON.parse(decodeURIComponent(ruleTrigger.getAttribute("data-owner-edit-sale-rule"))));
    } catch (error) {
      console.error(error);
    }
  });

  partyForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(partyForm);
    const partyId = formData.get("party_id");
    const payload = {
      name: formData.get("name"),
      phone: formData.get("phone"),
      market_area: formData.get("market_area"),
      preferred_clusters: formData.get("preferred_clusters"),
      preferred_farms: formData.get("preferred_farms"),
      notes: formData.get("notes"),
      is_active: formData.get("is_active") === "on",
    };
    try {
      const result = await requestJson(partyId ? `${ownerApiBase}/parties/${partyId}` : `${ownerApiBase}/parties`, {
        method: partyId ? "PUT" : "POST",
        body: JSON.stringify(payload),
      });
      setStatus(".owner-party-note", `${result.party.name} contact save ho gaya.`);
      resetOwnerPartyForm();
      loadParties().catch(console.error);
    } catch {
      setStatus(".owner-party-note", "Party contact save nahi ho paaya. Mobile number aur details dobara check karein.", true);
    }
  });
}

const saleRuleForm = document.querySelector("[data-owner-sale-rule-form]");
if (saleRuleForm) {
  saleRuleForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(saleRuleForm);
    if (!formData.get("farmer_code")) {
      setStatus(".owner-sale-rule-note", "Pehle farm select karein.", true);
      return;
    }
    const payload = {
      farmer_code: formData.get("farmer_code"),
      ready_weight_g: Number(formData.get("ready_weight_g") || 0),
      auto_whatsapp_enabled: formData.get("auto_whatsapp_enabled") === "on",
      notes: formData.get("notes"),
    };
    try {
      const result = await requestJson(`${ownerApiBase}/parties/rules`, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      setStatus(
        ".owner-sale-rule-note",
        `Sale trigger save ho gaya: ${result.rule.farm_name} • ${result.rule.ready_weight_g} g`
      );
      loadParties().catch(console.error);
    } catch {
      setStatus(".owner-sale-rule-note", "Sale trigger save nahi ho paaya. Farm aur target weight dobara check karein.", true);
    }
  });
}

const batchEntryForm = document.querySelector("[data-owner-batch-entry]");
if (batchEntryForm) {
  const farmerSelect = batchEntryForm.querySelector("[data-owner-farmer-select]");
  farmerSelect?.addEventListener("change", syncSelectedFarmerMeta);
  batchEntryForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(batchEntryForm);
    if (!formData.get("farmer_code")) {
      setStatus(".owner-batch-note", "Farmer select karein, baaki fields optional hain.", true);
      return;
    }
    const payload = {
      farmer_code: formData.get("farmer_code"),
      active_batch: formData.get("active_batch"),
      current_shed: formData.get("current_shed"),
      bird_age_days: Number(formData.get("bird_age_days") || 0),
    };

    try {
      const result = await requestJson(`${ownerApiBase}/farmers/batch`, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      setStatus(
        ".owner-batch-note",
        `Batch save ho gaya: ${result.farmer.farmer_name} • ${result.farmer.active_batch} • ${result.farmer.current_shed || "-"} • ${result.farmer.bird_age_days} days`
      );
      loadFarms().catch(console.error);
    } catch {
      setStatus(".owner-batch-note", "Batch entry save nahi ho paaya. Farmer aur batch details dobara check karein.", true);
    }
  });
}

document.querySelectorAll("[data-owner-logout]").forEach((button) => {
  button.addEventListener("click", async () => {
    await requestJson(`${authApiBase}/logout`, { method: "POST" });
    goToOwnerLogin();
  });
});

const page = document.body.dataset.ownerPage;
if (page) {
  if (page === "dashboard") {
    renderDashboardData(readCache("dashboard"));
    loadDashboard().catch(handlePageError);
  }
  if (page === "farms") {
    renderFarmsData(readCache("farms"));
    loadFarms().catch(handlePageError);
  }
  if (page === "operations" || page.startsWith("operations-")) {
    renderOperationsData(readCache("operations"));
    loadOperations().catch(handlePageError);
  }
  if (page === "finance") {
    renderFinanceData(readCache("finance"));
    loadFinance().catch(handlePageError);
  }
  if (page === "parties") {
    renderPartiesData(readCache("parties"));
    loadParties().catch(handlePageError);
  }
}
