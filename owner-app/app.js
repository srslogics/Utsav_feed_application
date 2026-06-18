const apiOrigin = window.location.protocol === "file:" ? "http://127.0.0.1:8000" : "";
const ownerApiBase = `${apiOrigin}/api/owner`;
const authApiBase = `${apiOrigin}/api/auth`;
const ownerCachePrefix = "utsavOwnerPage:";
let ownerAuthRecoveryPromise = null;

const ownerPageMeta = {
  dashboard: { eyebrow: "Owner Dashboard", title: "Owner dashboard" },
  profile: { eyebrow: "Profile", title: "Profile" },
  farms: { eyebrow: "Farms", title: "Farms" },
  reports: { eyebrow: "Reports", title: "Reports" },
  files: { eyebrow: "Files", title: "Files" },
  parties: { eyebrow: "Parties", title: "Parties" },
  "operations-daily": { eyebrow: "Operations", title: "Daily entries" },
  "operations-requests": { eyebrow: "Operations", title: "Requests" },
  "operations-photos": { eyebrow: "Operations", title: "Issue photos" },
  "operations-visits": { eyebrow: "Operations", title: "Field visits" },
  finance: { eyebrow: "Finance", title: "Finance" },
  "finance-costs": { eyebrow: "Finance", title: "Costs" },
  "finance-sales": { eyebrow: "Finance", title: "Sales" },
};

const ownerFarmWorkspaceState = {
  selectedFarmCode: "",
  selectedSection: "",
  editingSaleId: null,
  farms: null,
  operations: null,
  finance: null,
  files: null,
  reports: null,
  parties: null,
};

function normaliseOwnerHref(href) {
  return `${href || ""}`.replace(/^\.\//, "").trim();
}

function buildOwnerSidebar() {
  const sidebar = document.querySelector(".fa-sidebar");
  const nav = sidebar?.querySelector(".fa-nav");
  if (!sidebar || !nav || nav.dataset.ownerGrouped === "true") return;

  const directLinks = Array.from(nav.children).filter((node) => node.tagName === "A");
  const subnavs = Array.from(nav.children).filter((node) => node.classList?.contains("owner-subnav"));
  const linkMap = new Map(directLinks.map((link) => [normaliseOwnerHref(link.getAttribute("href")), link.cloneNode(true)]));
  const opsSubnav = subnavs.find((node) => node.getAttribute("aria-label")?.includes("Operations"))?.cloneNode(true);
  const financeSubnav = subnavs.find((node) => node.getAttribute("aria-label")?.includes("Finance"))?.cloneNode(true);

  const groups = [
    { label: "Workspace", links: ["farms.html"] },
    { label: "Account", links: ["profile.html"] },
  ];

  nav.innerHTML = "";

  groups.forEach((group) => {
    const availableLinks = group.links
      .map((href) => linkMap.get(href))
      .filter(Boolean)
      .map((link) => {
        link.classList.add("owner-shell-link");
        return link;
      });

    if (!availableLinks.length && !group.subnav) return;

    const groupEl = document.createElement("section");
    groupEl.className = "owner-sidebar-group";

    const label = document.createElement("p");
    label.className = "owner-sidebar-label";
    label.textContent = group.label;
    groupEl.appendChild(label);

    availableLinks.forEach((link) => groupEl.appendChild(link));

    if (group.subnav) {
      group.subnav.classList.add("owner-shell-subnav");
      groupEl.appendChild(group.subnav);
    }

    nav.appendChild(groupEl);
  });

  nav.dataset.ownerGrouped = "true";
}

function initOwnerTopbar() {
  const page = document.body.dataset.ownerPage;
  if (!page || document.querySelector(".owner-topbar")) return;

  const pageHead = document.querySelector(".fa-page-head");
  const meta = ownerPageMeta[page] || {};
  const eyebrow = pageHead?.querySelector(".fa-eyebrow")?.textContent?.trim() || meta.eyebrow || "Owner";
  const title = pageHead?.querySelector("h2")?.textContent?.trim() || meta.title || "Owner workspace";
  const pageActions = pageHead?.querySelector(".fa-page-actions");

  const topbar = document.createElement("header");
  topbar.className = "owner-topbar";
  topbar.innerHTML = `
    <a class="owner-topbar-brand" href="./dashboard.html">
      <span class="owner-topbar-mark">UF</span>
      <span class="owner-topbar-copy">
        <strong>Utsav Owner</strong>
        <small>Farm management workspace</small>
      </span>
    </a>
    <div class="owner-topbar-context">
      <span>${eyebrow}</span>
      <strong>${title}</strong>
    </div>
    <div class="owner-topbar-right">
      <div class="owner-topbar-user">
        <span data-owner-name></span>
        <small data-owner-title></small>
      </div>
      <div class="owner-topbar-actions"></div>
    </div>
  `;

  document.body.prepend(topbar);

  if (pageActions) {
    const actionsHost = topbar.querySelector(".owner-topbar-actions");
    Array.from(pageActions.children).forEach((child) => actionsHost.appendChild(child));
    pageActions.remove();
  }
}

function initOwnerShell() {
  if (!document.body.dataset.ownerPage) return;
  buildOwnerSidebar();
  initOwnerTopbar();
}

function formatBagCount(value) {
  const numeric = Number(value ?? 0);
  if (Number.isNaN(numeric)) return value ?? "0";
  return Number.isInteger(numeric) ? String(numeric) : numeric.toFixed(2).replace(/\.?0+$/, "");
}

function formatMetricNumber(value, digits = 1) {
  const numeric = Number(value ?? 0);
  if (Number.isNaN(numeric)) return value ?? "0";
  return Number.isInteger(numeric) ? String(numeric) : numeric.toFixed(digits).replace(/\.?0+$/, "");
}

function compactMetricValue(value, suffix = "") {
  if (value === null || value === undefined || value === "" || Number.isNaN(Number(value))) return "-";
  return `${formatMetricNumber(value)}${suffix}`;
}

function parseLooseNumber(value) {
  const cleaned = `${value ?? ""}`.replace(/,/g, "").trim();
  const numeric = Number(cleaned);
  return Number.isFinite(numeric) ? numeric : NaN;
}

function formatCurrencyInput(value) {
  const numeric = Number(value ?? 0);
  if (!Number.isFinite(numeric)) return "";
  return Number.isInteger(numeric)
    ? String(numeric)
    : numeric.toFixed(2).replace(/\.?0+$/, "");
}

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
            ${
              item.file_url
                ? `<div class="fa-inline-actions"><a class="fa-secondary-btn" href="${item.file_url}" target="_blank" rel="noopener noreferrer">Open receipt</a></div>`
                : ""
            }
          </div>
          <strong>${item.value}</strong>
        </div>
      `
    )
    .join("");
}

function renderOwnerFarmPerformance(container, items) {
  if (!container) return;
  if (!items?.length) {
    container.innerHTML = `<div class="fa-empty-state">Abhi performance data available nahi hai.</div>`;
    return;
  }

  const state = { selectedFarmCode: "" };

  const render = () => {
    const selectedFarm = items.find((item) => item.farmer_code === state.selectedFarmCode);
    if (!selectedFarm) {
      container.innerHTML = `
        <div class="owner-performance-grid">
          ${items
            .map(
              (item) => `
                <button type="button" class="owner-performance-card" data-owner-performance-farm="${item.farmer_code || ""}">
                  <div class="owner-performance-card-head">
                    <div>
                      <span>Farm</span>
                      <h4>${item.farm_name || "-"}</h4>
                      <p>${[item.farmer_name, item.current_batch ? `Batch ${item.current_batch}` : "", item.cluster].filter(Boolean).join(" • ")}</p>
                    </div>
                  </div>
                  <div class="owner-performance-meta">
                    <span>${item.shed_count || 0} sheds</span>
                    <span>${item.history_days || 0} days</span>
                    <span>${item.latest_entry_date ? `Latest ${item.latest_entry_date}` : "No entry"}</span>
                  </div>
                  <div class="owner-performance-mini-metrics">
                    <article><span>FCR</span><strong>${item.summary?.running_fcr || "-"}</strong></article>
                    <article><span>Livability</span><strong>${item.summary?.livability || "-"}</strong></article>
                    <article><span>Live wt</span><strong>${item.summary?.current_live_weight || "-"}</strong></article>
                  </div>
                </button>
              `
            )
            .join("")}
        </div>
      `;
      return;
    }

    container.innerHTML = `
      <div class="owner-daily-pathbar">
        <div class="owner-daily-breadcrumbs">
          <button type="button" class="owner-daily-crumb" data-owner-performance-back="farms">Farm performance</button>
          <span>/</span>
          <span class="owner-daily-crumb is-active">${selectedFarm.farm_name || "-"}</span>
        </div>
        <div class="owner-daily-path-actions">
          <button type="button" class="fa-secondary-btn" data-owner-performance-back="farms">Back to farms</button>
        </div>
      </div>
      <section class="owner-performance-batch-card">
        <div class="owner-hierarchy-farm-head owner-daily-static-head">
          <div class="owner-hierarchy-title">
            <span>Batch performance</span>
            <h4>${selectedFarm.current_batch ? `Batch ${selectedFarm.current_batch}` : selectedFarm.farm_name || "-"}</h4>
            <p>${[selectedFarm.farm_name, selectedFarm.farmer_name, selectedFarm.cluster].filter(Boolean).join(" • ")}</p>
          </div>
          <div class="owner-hierarchy-chip-row">
            <span class="owner-hierarchy-chip">${selectedFarm.shed_count || 0} sheds</span>
            <span class="owner-hierarchy-chip">${selectedFarm.history_days || 0} days</span>
            <span class="owner-hierarchy-chip owner-hierarchy-chip-muted">${selectedFarm.latest_entry_date ? `Latest ${selectedFarm.latest_entry_date}` : "No latest entry"}</span>
          </div>
        </div>
        <div class="fa-kpi-grid fa-kpi-grid-five">
          ${(selectedFarm.batch_metrics || [])
            .map(
              (metric) => `
                <article class="fa-kpi-card">
                  <span>${metric.label}</span>
                  <strong>${metric.value}</strong>
                  <p>${metric.note || ""}</p>
                </article>
              `
            )
            .join("")}
        </div>
      </section>
    `;
  };

  render();

  container.onclick = (event) => {
    const farmButton = event.target.closest("[data-owner-performance-farm]");
    if (farmButton) {
      state.selectedFarmCode = farmButton.getAttribute("data-owner-performance-farm") || "";
      render();
      return;
    }
    const backButton = event.target.closest("[data-owner-performance-back]");
    if (backButton) {
      state.selectedFarmCode = "";
      render();
    }
  };
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
        <article class="fa-detail-card owner-edit-card owner-farm-card" data-owner-open-farm="${item.farmer_code || ""}">
          <span>${item.label}</span>
          <strong>${item.value}</strong>
          <p>${item.note || ""}</p>
          <p><strong>Feed stock:</strong> ${item.feed_stock_bags ?? 0} bags</p>
          <div class="owner-edit-card-actions">
            <button class="fa-primary-btn" type="button" data-owner-open-farm="${item.farmer_code || ""}">Open Farm</button>
            <button class="fa-secondary-btn" type="button" data-owner-edit-farm-card="${encodeURIComponent(JSON.stringify(item))}">Edit Farm</button>
            <button class="fa-secondary-btn" type="button" data-owner-edit-batch-card="${encodeURIComponent(JSON.stringify(item))}">Edit Batch</button>
          </div>
        </article>
      `
    )
    .join("");
}

function itemLooksLikeFarm(item, farm) {
  if (!item || !farm) return false;
  const hay = `${item.label || ""} ${item.value || ""} ${item.note || ""}`.toLowerCase();
  return [farm.farm_name, farm.farmer_name, farm.farmer_code].filter(Boolean).some((token) => hay.includes(`${token}`.toLowerCase()));
}

function buildFarmWorkspaceKpis(farmItem, reportItem, dailyFarm) {
  if (reportItem?.report_kpis?.length) return reportItem.report_kpis.slice(0, 4);
  const latestGroup = dailyFarm?.daily_groups?.[0];
  const latestRow = latestGroup?.rows?.find((row) => row.has_entry) || latestGroup?.rows?.[0];
  return [
    { label: "Batch", value: farmItem?.active_batch || farmItem?.value || "-", note: "Current batch" },
    { label: "Feed stock", value: `${farmItem?.feed_stock_bags ?? 0} bags`, note: "Farm stock" },
    { label: "Live birds", value: latestRow?.live_birds_today ?? farmItem?.initial_batch_strength ?? "-", note: "Latest live count" },
    { label: "Last entry", value: latestGroup?.entry_date || reportItem?.latest_entry_date || "-", note: "Recent report" },
  ];
}

function renderOwnerInlineSimpleList(items, emptyText) {
  if (!items?.length) return `<div class="fa-empty-state">${emptyText}</div>`;
  return items
    .slice(0, 5)
    .map(
      (item) => `
        <div class="fa-list-row">
          <div>
            <span>${item.label || "-"}</span>
            ${item.note ? `<p>${item.note}</p>` : ""}
          </div>
          <strong>${item.value || "-"}</strong>
        </div>
      `
    )
    .join("");
}

function renderOwnerFarmSalesList(items) {
  if (!items?.length) return `<div class="fa-empty-state">No sale record</div>`;
  return items
    .slice(0, 5)
    .map((item) => {
      const isEditing = String(ownerFarmWorkspaceState.editingSaleId || "") === String(item.sale_id || "");
      return `
        <div class="fa-list-row owner-sale-row">
          <div>
            <span>${item.label || "-"}</span>
            ${item.note ? `<p>${item.note}</p>` : ""}
            <div class="fa-inline-actions">
              <button class="fa-secondary-btn" type="button" data-owner-edit-sale-rate="${item.sale_id || ""}">
                ${item.value === "Amount pending" ? "Add rate" : "Edit rate"}
              </button>
            </div>
            ${
              isEditing
                ? `
                  <form class="owner-inline-rate-form" data-owner-sale-rate-form="${item.sale_id || ""}">
                    <input
                      name="rate_per_kg"
                      type="text"
                      inputmode="decimal"
                      placeholder="Rate per kg"
                      value="${item.rate_per_kg || ""}"
                      required
                    />
                    <button class="fa-primary-btn" type="submit">Save</button>
                    <button class="fa-secondary-btn" type="button" data-owner-cancel-sale-rate="true">Cancel</button>
                  </form>
                `
                : ""
            }
          </div>
          <strong>${item.value || "-"}</strong>
        </div>
      `;
    })
    .join("");
}

function renderFarmDailySummary(dailyFarm) {
  const groups = dailyFarm?.daily_groups || [];
  if (!groups.length) return `<div class="fa-empty-state">Abhi daily entry available nahi hai.</div>`;
  return groups
    .slice(0, 5)
    .map((group) => {
      const rows = group.rows || [];
      const shedCount = group.shed_count || rows.filter((row) => row.has_entry).length;
      const mortality = rows.reduce((sum, row) => sum + Number(row.mortality || 0), 0);
      const culls = rows.reduce((sum, row) => sum + Number(row.culls || 0), 0);
      const feed = rows.reduce((sum, row) => sum + Number(row.feed_used_bags || 0), 0);
      return `
        <div class="fa-list-row">
          <div>
            <span>${group.entry_date || "-"}</span>
            <p>${shedCount} sheds • Mortality ${mortality} • Culls ${culls}</p>
          </div>
          <strong>${formatBagCount(feed)} bags</strong>
        </div>
      `;
    })
    .join("");
}

function renderFarmFileSummary(fileFarm) {
  if (!fileFarm) return `<div class="fa-empty-state">Abhi files available nahi hain.</div>`;
  const docs = fileFarm.documents || [];
  const photos = fileFarm.photos || [];
  return `
    <div class="owner-grid-two owner-grid-two-tight">
      <div class="fa-list-card">
        <div class="fa-list-row">
          <div>
            <span>Documents</span>
            <p>Recent bills and records</p>
          </div>
          <strong>${docs.length}</strong>
        </div>
        ${renderOwnerInlineSimpleList(docs, "No documents")}
      </div>
      <div class="fa-list-card">
        <div class="fa-list-row">
          <div>
            <span>Images</span>
            <p>Recent farm photos</p>
          </div>
          <strong>${photos.length}</strong>
        </div>
        ${renderOwnerInlineSimpleList(photos, "No images")}
      </div>
    </div>
  `;
}

function renderOwnerFarmWorkspace() {
  const container = document.querySelector("#owner-selected-farm-workspace");
  if (!container) return;
  const farmCode = ownerFarmWorkspaceState.selectedFarmCode;
  const farmsData = ownerFarmWorkspaceState.farms;
  if (!farmCode || !farmsData?.farms?.length) {
    container.innerHTML = `
      <div class="fa-section-head">
        <div>
          <p class="fa-eyebrow">Selected Farm</p>
          <h3>Farm workspace</h3>
        </div>
      </div>
      <div class="fa-empty-state">Farm block kholne par uska poora detail yahin dikhega.</div>
    `;
    return;
  }

  const farmItem = farmsData.farms.find((item) => item.farmer_code === farmCode) || null;
  const accountItem = (farmsData.farmer_accounts || []).find((item) => item.farmer_code === farmCode) || farmItem;
  const officerItem = (farmsData.field_officers || []).find((item) => item.farmer_code === farmCode || itemLooksLikeFarm(item, farmItem));
  const dailyFarm = (ownerFarmWorkspaceState.operations?.daily_entry_hierarchy || []).find((item) => item.farmer_code === farmCode) || null;
  const reportItem = (ownerFarmWorkspaceState.reports?.reports || []).find((item) => item.farmer_code === farmCode) || null;
  const fileFarm = (ownerFarmWorkspaceState.files?.farms || []).find((item) => item.farmer_code === farmCode) || null;
  const farmExpenses = (reportItem?.recent_expenses || ownerFarmWorkspaceState.finance?.operational_costs || []).filter((item) => !reportItem ? itemLooksLikeFarm(item, farmItem) : true);
  const farmSales = (reportItem?.recent_sales || ownerFarmWorkspaceState.finance?.sales || []).filter((item) => !reportItem ? itemLooksLikeFarm(item, farmItem) : true);
  const farmRequests = (ownerFarmWorkspaceState.operations?.requests || []).filter((item) => itemLooksLikeFarm(item, farmItem));
  const saleRule = (ownerFarmWorkspaceState.parties?.sale_rules || []).find((item) => item.farmer_code === farmCode) || null;
  const readyQueue = (ownerFarmWorkspaceState.parties?.sale_ready_queue || []).find((item) => item.farmer_code === farmCode) || null;
  const kpis = buildFarmWorkspaceKpis(farmItem, reportItem, dailyFarm);
  const selectedSection = ownerFarmWorkspaceState.selectedSection || "";

  const sectionCards = [
    { key: "daily", eyebrow: "Daily", title: "Entry history", note: dailyFarm?.daily_groups?.length ? `${dailyFarm.daily_groups.length} dates` : "No entry yet" },
    { key: "account", eyebrow: "Account", title: "Farmer and support", note: officerItem ? "Farmer and officer" : "Farmer details" },
    { key: "business", eyebrow: "Business", title: "Costs and sales", note: `${farmExpenses.length} costs • ${farmSales.length} sales` },
    { key: "files", eyebrow: "Files", title: "Documents and photos", note: `${fileFarm?.documents?.length || 0} docs • ${fileFarm?.photos?.length || 0} photos` },
    { key: "performance", eyebrow: "Performance", title: "Batch summary", note: reportItem?.performance_kpis?.length ? "Metrics available" : "No metrics yet" },
    { key: "alerts", eyebrow: "Alerts", title: "Requests and trigger", note: `${farmRequests.length} requests` },
  ];

  const renderSectionDetail = () => {
    if (!selectedSection) {
      return `
        <div class="owner-farm-section-grid">
          ${sectionCards
            .map(
              (section) => `
                <button type="button" class="owner-dashboard-shortcut owner-farm-section-card" data-owner-open-farm-section="${section.key}">
                  <span>${section.eyebrow}</span>
                  <strong>${section.title}</strong>
                  <p>${section.note}</p>
                </button>
              `
            )
            .join("")}
        </div>
      `;
    }

    const backBar = `
      <div class="owner-daily-pathbar">
        <div class="owner-daily-breadcrumbs">
          <button type="button" class="owner-daily-crumb" data-owner-back-farm-sections="true">${farmItem?.farm_name || accountItem?.farm_name || "Farm"}</button>
          <span>/</span>
          <span class="owner-daily-crumb is-active">${sectionCards.find((item) => item.key === selectedSection)?.title || "-"}</span>
        </div>
        <div class="owner-daily-path-actions">
          <button type="button" class="fa-secondary-btn" data-owner-back-farm-sections="true">Back</button>
        </div>
      </div>
    `;

    if (selectedSection === "daily") {
      return `
        ${backBar}
        <section class="fa-section owner-subsection">
          <div class="fa-section-head"><div><p class="fa-eyebrow">Daily</p><h3>Entry history</h3></div></div>
          <div class="fa-list-card">${renderFarmDailySummary(dailyFarm)}</div>
        </section>
      `;
    }

    if (selectedSection === "account") {
      return `
        ${backBar}
        <section class="fa-section owner-subsection">
          <div class="fa-section-head"><div><p class="fa-eyebrow">Account</p><h3>Farmer and support</h3></div></div>
          <div class="fa-list-card">
            <div class="fa-list-row">
              <div>
                <span>${accountItem?.label || accountItem?.farm_name || "Farmer"}</span>
                <p>${accountItem?.note || "-"}</p>
              </div>
              <strong>${accountItem?.value || "-"}</strong>
            </div>
            ${
              officerItem
                ? `<div class="fa-list-row"><div><span>${officerItem.label || "Officer"}</span><p>${officerItem.note || ""}</p></div><strong>${officerItem.value || "-"}</strong></div>`
                : `<div class="fa-empty-state">Officer detail available nahi hai.</div>`
            }
          </div>
        </section>
      `;
    }

    if (selectedSection === "business") {
      return `
        ${backBar}
        <section class="fa-section owner-subsection">
          <div class="fa-section-head"><div><p class="fa-eyebrow">Business</p><h3>Costs and sales</h3></div></div>
          <div class="owner-grid-two owner-grid-two-tight">
            <div class="fa-list-card">${renderOwnerInlineSimpleList(farmExpenses, "No cost record")}</div>
            <div class="fa-list-card">${renderOwnerFarmSalesList(farmSales)}</div>
          </div>
        </section>
      `;
    }

    if (selectedSection === "files") {
      return `
        ${backBar}
        <section class="fa-section owner-subsection">
          <div class="fa-section-head"><div><p class="fa-eyebrow">Files</p><h3>Documents and photos</h3></div></div>
          ${renderFarmFileSummary(fileFarm)}
        </section>
      `;
    }

    if (selectedSection === "performance") {
      return `
        ${backBar}
        <section class="fa-section owner-subsection">
          <div class="fa-section-head"><div><p class="fa-eyebrow">Performance</p><h3>Batch summary</h3></div></div>
          <div class="fa-kpi-grid">
            ${
              reportItem?.performance_kpis?.length
                ? reportItem.performance_kpis.slice(0, 6).map((metric) => `
                    <article class="fa-kpi-card">
                      <span>${metric.label}</span>
                      <strong>${metric.value}</strong>
                      <p>${metric.note || ""}</p>
                    </article>
                  `).join("")
                : `<div class="fa-empty-state">Abhi performance data available nahi hai.</div>`
            }
          </div>
        </section>
      `;
    }

    if (selectedSection === "alerts") {
      return `
        ${backBar}
        <section class="fa-section owner-subsection">
          <div class="fa-section-head"><div><p class="fa-eyebrow">Alerts</p><h3>Requests and sale trigger</h3></div></div>
          <div class="fa-list-card">
            ${saleRule ? `<div class="fa-list-row"><div><span>Sale trigger</span><p>${saleRule.note || ""}</p></div><strong>${saleRule.value || `${saleRule.ready_weight_g} g`}</strong></div>` : ""}
            ${readyQueue ? `<div class="fa-list-row"><div><span>Ready status</span><p>${readyQueue.note || readyQueue.message_preview || ""}</p></div><strong>${readyQueue.value || "-"}</strong></div>` : ""}
            ${renderOwnerInlineSimpleList(farmRequests, "No pending request")}
          </div>
        </section>
      `;
    }

    return "";
  };

  container.innerHTML = `
    <div class="fa-section-head">
      <div>
        <p class="fa-eyebrow">Selected Farm</p>
        <h3>${farmItem?.farm_name || accountItem?.farm_name || "-"}</h3>
      </div>
      <div class="owner-edit-card-actions">
        <button class="fa-secondary-btn" type="button" data-owner-edit-farm-card="${encodeURIComponent(JSON.stringify(farmItem || accountItem || {}))}">Edit Farm</button>
        <button class="fa-secondary-btn" type="button" data-owner-edit-batch-card="${encodeURIComponent(JSON.stringify(accountItem || farmItem || {}))}">Edit Batch</button>
      </div>
    </div>
    <div class="owner-home-context">
      <span>${accountItem?.farmer_name || farmItem?.farmer_name || "-"}</span>
      <strong>${accountItem?.farmer_code || farmCode}</strong>
      <small>${[accountItem?.cluster || farmItem?.cluster, accountItem?.current_batch ? `Batch ${accountItem.current_batch}` : "", accountItem?.current_shed || ""].filter(Boolean).join(" • ")}</small>
    </div>
    <div class="fa-kpi-grid fa-kpi-grid-four">
      ${kpis
        .map(
          (metric) => `
            <article class="fa-kpi-card">
              <span>${metric.label}</span>
              <strong>${metric.value}</strong>
              <p>${metric.note || ""}</p>
            </article>
          `
        )
        .join("")}
    </div>
    ${renderSectionDetail()}
  `;
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
  const controls = document.querySelector("#owner-operations-daily-controls");
  if (!container) return;
  if (!farms?.length) {
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
    const totalFeedUsedBags = dailyGroups.reduce(
      (count, group) =>
        count +
        (group.rows || []).reduce(
          (rowCount, row) => rowCount + (row.has_entry ? Number(row.feed_used_bags || 0) : 0),
          0
        ),
      0
    );
    const totalMortality = dailyGroups.reduce(
      (count, group) =>
        count +
        (group.rows || []).reduce(
          (rowCount, row) => rowCount + (row.has_entry ? Number(row.mortality || 0) : 0),
          0
        ),
      0
    );
    const totalCulls = dailyGroups.reduce(
      (count, group) =>
        count +
        (group.rows || []).reduce(
          (rowCount, row) => rowCount + (row.has_entry ? Number(row.culls || 0) : 0),
          0
        ),
      0
    );
    const totalPowerCutHours = dailyGroups.reduce(
      (count, group) =>
        count +
        (group.rows || []).reduce(
          (rowCount, row) => rowCount + (row.has_entry ? Number(row.power_cut_hours || 0) : 0),
          0
        ),
      0
    );
    const totalDgHours = dailyGroups.reduce(
      (count, group) =>
        count +
        (group.rows || []).reduce(
          (rowCount, row) => rowCount + (row.has_entry ? Number(row.dg_hours || 0) : 0),
          0
        ),
      0
    );
    const totalReportedEntries = dailyGroups.reduce((count, group) => count + (group.shed_count || 0), 0);
    const avgPowerCutHours = totalReportedEntries ? totalPowerCutHours / totalReportedEntries : 0;
    const avgDgHours = totalReportedEntries ? totalDgHours / totalReportedEntries : 0;
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
            latest_mortality_photo_url: "",
            latest_mortality_photo_name: "",
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
            shedRecord.latest_mortality_photo_url = row.mortality_photo_url || "";
            shedRecord.latest_mortality_photo_name = row.mortality_photo_name || "";
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
      totalFeedUsedBags,
      totalMortality,
      totalCulls,
      avgPowerCutHours,
      avgDgHours,
      historyDays: dailyGroups.length,
      shedRecords,
    };
  });

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
              placeholder="Search by farm, farmer, code, area"
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
            <article><span>Total bags in stock</span><strong>${selectedFarm.feed_stock_bags ?? 0} bags</strong></article>
            <article><span>Today status</span><strong>${selectedFarm.todayGroup ? `${selectedFarm.todayGroup.shed_count}/${selectedFarm.shed_count || 0}` : `0/${selectedFarm.shed_count || 0}`}</strong></article>
            <article><span>Total bags used till now</span><strong>${formatBagCount(selectedFarm.totalFeedUsedBags)} bags</strong></article>
            <article><span>Total mortality</span><strong>${formatMetricNumber(selectedFarm.totalMortality)}</strong></article>
            <article><span>Total culls / loose hens</span><strong>${formatMetricNumber(selectedFarm.totalCulls)}</strong></article>
            <article><span>Avg power cut</span><strong>${formatMetricNumber(selectedFarm.avgPowerCutHours)} hrs</strong></article>
            <article><span>Avg DG run</span><strong>${formatMetricNumber(selectedFarm.avgDgHours)} hrs</strong></article>
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
                    ${shed.latest_mortality_photo_url ? `<span>Mortality proof</span>` : ""}
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
                          ${entry.mortality_photo_url ? `<span class="owner-hierarchy-chip owner-hierarchy-chip-dark">Mortality photo</span>` : ""}
                        </div>
                      </div>
                      ${
                        entry.mortality_photo_url
                          ? `
                            <div class="owner-daily-entry-media owner-daily-entry-media-prominent">
                              <span class="owner-daily-entry-media-label">Mortality birds photo</span>
                              <a class="owner-daily-entry-photo-link" href="${entry.mortality_photo_url}" target="_blank" rel="noopener noreferrer">
                                <img src="${entry.mortality_photo_url}" alt="${entry.mortality_photo_name || "Mortality photo"}" loading="lazy" />
                                <strong>Open full photo</strong>
                              </a>
                            </div>
                          `
                          : ""
                      }
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
                      <div class="owner-daily-entry-metrics owner-daily-entry-metrics-compact">
                        <span><strong>Mort:</strong> ${compactMetricValue(entry.mortality)}</span>
                        <span><strong>Culls:</strong> ${compactMetricValue(entry.culls)}</span>
                        <span><strong>Feed:</strong> ${entry.feed_used_label || `${formatBagCount(entry.feed_used_bags)} bags`}</span>
                        <span><strong>Water:</strong> ${compactMetricValue(entry.water_liters, " L")}</span>
                        <span><strong>Temp:</strong> ${compactMetricValue(entry.temperature_c, " C")}</span>
                        <span><strong>Humidity:</strong> ${compactMetricValue(entry.humidity_pct, "%")}</span>
                        <span><strong>Litter:</strong> ${entry.litter_condition || "-"}</span>
                        <span><strong>Uniformity:</strong> ${entry.uniformity_pct === null || entry.uniformity_pct === undefined ? "-" : `${formatMetricNumber(entry.uniformity_pct)}%`}</span>
                        <span><strong>Power:</strong> ${compactMetricValue(entry.power_cut_hours, " hr")}</span>
                        <span><strong>DG:</strong> ${compactMetricValue(entry.dg_hours, " hr")}</span>
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
  renderOwnerFarmPerformance(document.querySelector("#owner-performance"), data.farm_performance || []);
  renderList(document.querySelector("#owner-farms"), data.farms || []);
  renderList(document.querySelector("#owner-priority"), data.priority);
  renderList(document.querySelector("#owner-latest-reporting"), data.latest_reporting);
  renderList(document.querySelector("#owner-uploads"), data.uploads);
}

function renderFarmsData(data) {
  if (!data) return;
  ownerFarmWorkspaceState.farms = data;
  populateProfile(data.profile);
  renderOwnerFarmDirectory(document.querySelector("#owner-farms-directory"), data.farms);
  renderOwnerLatestEntries(document.querySelector("#owner-farms-latest-entries"), data.latest_entries);
  renderOwnerFarmerAccounts(document.querySelector("#owner-farmer-accounts"), data.farmer_accounts || []);
  renderList(document.querySelector("#owner-field-officers"), data.field_officers || []);
  populateFarmerSelect(data.farmer_accounts || []);
  syncSelectedFarmerMeta();
  renderOwnerFarmWorkspace();
}

function renderOperationsData(data) {
  if (!data) return;
  ownerFarmWorkspaceState.operations = data;
  populateProfile(data.profile);
  renderList(document.querySelector("#owner-operations-requests"), data.requests);
  renderList(document.querySelector("#owner-operations-photos"), data.photos);
  renderList(document.querySelector("#owner-operations-visits"), data.visits);
  renderList(document.querySelector("#owner-operations-daily-entries"), data.daily_entries);
  renderDailyEntryHierarchy(document.querySelector("#owner-operations-daily-hierarchy"), data.daily_entry_hierarchy);
  renderOwnerFarmWorkspace();
}

function renderFinanceData(data) {
  if (!data) return;
  ownerFarmWorkspaceState.finance = data;
  populateProfile(data.profile);
  renderKpis(document.querySelector("#owner-finance-kpis"), data.kpis);
  renderKpis(document.querySelector("#owner-finance-category-breakdown"), data.category_breakdown || []);
  renderList(document.querySelector("#owner-finance-documents"), data.documents);
  renderList(document.querySelector("#owner-finance-inward"), data.feed_inward);
  renderList(document.querySelector("#owner-finance-operational-costs"), data.operational_costs || []);
  renderList(document.querySelector("#owner-finance-sales"), data.sales || []);
  populateOwnerFinanceFarmSelect(data.farmer_options || []);
  populateOwnerSaleFarmSelect(data.farmer_options || []);
  populateOwnerSalePartySelect(data.party_options || []);
  setOwnerFinanceDefaultDate();
  setOwnerSaleDefaultDate();
  renderOwnerFarmWorkspace();
}

function renderOwnerProfileData(data) {
  if (!data) return;
  populateProfile(data.profile);
  const form = document.querySelector("[data-owner-profile-form]");
  if (form) {
    form.elements.name.value = data.profile.name || "";
    form.elements.phone.value = data.profile.phone || "";
    form.elements.cluster.value = data.profile.cluster || "";
    if (!form.dataset.prefilled) {
      form.elements.password.value = "";
      form.dataset.prefilled = "true";
    }
  }
  renderList(document.querySelector("#owner-profile-summary"), [
    {
      label: data.profile.name || "Owner",
      value: data.profile.phone || "-",
      note: [data.profile.title || "Owner", data.profile.cluster || ""].filter(Boolean).join(" • "),
    },
  ]);
}

function renderOwnerReportsData(data) {
  if (!data) return;
  ownerFarmWorkspaceState.reports = data;
  populateProfile(data.profile);
  renderKpis(document.querySelector("#owner-reports-kpis"), data.summary_kpis || []);
  renderOwnerReportsBrowser(document.querySelector("#owner-reports-browser-content"), data.reports || []);
  renderOwnerFarmWorkspace();
}

function renderOwnerReportsBrowser(container, reports) {
  if (!container) return;
  if (!reports.length) {
    container.innerHTML = `<div class="fa-empty-state">Abhi kisi farm ke liye report data available nahi hai.</div>`;
    return;
  }

  const state = { selectedFarmCode: "" };

  const render = () => {
    const selected = reports.find((item) => item.farmer_code === state.selectedFarmCode);
    if (!selected) {
      container.innerHTML = `
        <div class="owner-performance-grid owner-reports-grid">
          ${reports
            .map(
              (item) => `
                <button type="button" class="owner-performance-card owner-report-card" data-owner-report-farm="${item.farmer_code || ""}">
                  <div class="owner-performance-card-head">
                    <div>
                      <span>Farm report</span>
                      <h4>${item.farm_name || "-"}</h4>
                      <p>${[item.farmer_name, item.farmer_code, item.current_batch ? `Batch ${item.current_batch}` : "", item.cluster].filter(Boolean).join(" • ")}</p>
                    </div>
                  </div>
                  <div class="owner-performance-meta">
                    <span>${item.shed_count || 0} sheds</span>
                    <span>${item.bird_age_days || 0} days</span>
                    <span>${item.latest_entry_date ? `Latest ${item.latest_entry_date}` : "No entry"}</span>
                  </div>
                  <div class="owner-performance-mini-metrics">
                    <article><span>Sales</span><strong>Rs ${(item.summary?.sales_total || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}</strong></article>
                    <article><span>Cost</span><strong>Rs ${(item.summary?.operational_cost_total || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}</strong></article>
                    <article><span>Net</span><strong>Rs ${(item.summary?.net_position || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}</strong></article>
                  </div>
                </button>
              `
            )
            .join("")}
        </div>
      `;
      return;
    }

    container.innerHTML = `
      <div class="owner-daily-pathbar">
        <div class="owner-daily-breadcrumbs">
          <button type="button" class="owner-daily-crumb" data-owner-report-back="farms">Reports</button>
          <span>/</span>
          <span class="owner-daily-crumb is-active">${selected.farm_name || "-"}</span>
        </div>
        <div class="owner-daily-path-actions">
          <button type="button" class="fa-secondary-btn" data-owner-report-back="farms">Back to farms</button>
        </div>
      </div>
      <section class="owner-performance-batch-card owner-report-panel">
        <div class="owner-hierarchy-farm-head owner-daily-static-head">
          <div class="owner-hierarchy-title">
            <span>Selected farm report</span>
            <h4>${selected.farm_name || "-"}</h4>
            <p>${[selected.farmer_name, selected.farmer_code, selected.cluster].filter(Boolean).join(" • ")}</p>
          </div>
          <div class="owner-hierarchy-chip-row">
            <span class="owner-hierarchy-chip">${selected.current_batch ? `Batch ${selected.current_batch}` : "No batch"}</span>
            <span class="owner-hierarchy-chip">${selected.shed_count || 0} sheds</span>
            <span class="owner-hierarchy-chip owner-hierarchy-chip-muted">${selected.latest_entry_date ? `Latest ${selected.latest_entry_date}` : "No entry yet"}</span>
          </div>
        </div>

        <div class="fa-kpi-grid fa-kpi-grid-four">
          ${(selected.report_kpis || [])
            .map(
              (metric) => `
                <article class="fa-kpi-card">
                  <span>${metric.label}</span>
                  <strong>${metric.value}</strong>
                  <p>${metric.note || ""}</p>
                </article>
              `
            )
            .join("")}
        </div>

        <div class="owner-grid-two owner-report-sections">
          <section class="fa-section owner-report-subsection">
            <div class="fa-section-head">
              <div>
                <p class="fa-eyebrow">Batch Performance</p>
                <h3>Running metrics</h3>
              </div>
            </div>
            <div class="fa-kpi-grid">
              ${(selected.performance_kpis || [])
                .map(
                  (metric) => `
                    <article class="fa-kpi-card">
                      <span>${metric.label}</span>
                      <strong>${metric.value}</strong>
                      <p>${metric.note || ""}</p>
                    </article>
                  `
                )
                .join("")}
            </div>
          </section>

          <section class="fa-section owner-report-subsection">
            <div class="fa-section-head">
              <div>
                <p class="fa-eyebrow">Cost Breakup</p>
                <h3>Expense categories</h3>
              </div>
            </div>
            <div class="fa-kpi-grid">
              ${selected.expense_breakdown?.length
                ? selected.expense_breakdown
                    .map(
                      (metric) => `
                        <article class="fa-kpi-card">
                          <span>${metric.label}</span>
                          <strong>${metric.value}</strong>
                          <p>${metric.note || ""}</p>
                        </article>
                      `
                    )
                    .join("")
                : `<div class="fa-empty-state">Is farm ke liye abhi expense breakup available nahi hai.</div>`}
            </div>
          </section>
        </div>

        <div class="owner-grid-two owner-report-sections">
          <section class="fa-section owner-report-subsection">
            <div class="fa-section-head">
              <div>
                <p class="fa-eyebrow">Expenses</p>
                <h3>Recent expense records</h3>
              </div>
            </div>
            <div class="fa-list-card">
              ${selected.recent_expenses?.length ? renderOwnerInlineList(selected.recent_expenses) : `<div class="fa-empty-state">Abhi expense record available nahi hai.</div>`}
            </div>
          </section>

          <section class="fa-section owner-report-subsection">
            <div class="fa-section-head">
              <div>
                <p class="fa-eyebrow">Sales</p>
                <h3>Recent sale records</h3>
              </div>
            </div>
            <div class="fa-list-card">
              ${selected.recent_sales?.length ? renderOwnerInlineList(selected.recent_sales) : `<div class="fa-empty-state">Abhi sale record available nahi hai.</div>`}
            </div>
          </section>
        </div>

        <div class="owner-grid-two owner-report-sections">
          <section class="fa-section owner-report-subsection">
            <div class="fa-section-head">
              <div>
                <p class="fa-eyebrow">Files</p>
                <h3>Latest bills and documents</h3>
              </div>
            </div>
            <div class="fa-list-card">
              ${selected.recent_documents?.length ? renderOwnerInlineList(selected.recent_documents) : `<div class="fa-empty-state">Abhi files available nahi hain.</div>`}
            </div>
          </section>

          <section class="fa-section owner-report-subsection">
            <div class="fa-section-head">
              <div>
                <p class="fa-eyebrow">Feed Inward</p>
                <h3>Recent inward records</h3>
              </div>
            </div>
            <div class="fa-list-card">
              ${selected.recent_feed_inward?.length ? renderOwnerInlineList(selected.recent_feed_inward) : `<div class="fa-empty-state">Abhi feed inward record available nahi hai.</div>`}
            </div>
          </section>
        </div>
      </section>
    `;
  };

  render();

  container.onclick = (event) => {
    const farmButton = event.target.closest("[data-owner-report-farm]");
    if (farmButton) {
      state.selectedFarmCode = farmButton.getAttribute("data-owner-report-farm") || "";
      render();
      return;
    }
    const backButton = event.target.closest("[data-owner-report-back]");
    if (backButton) {
      state.selectedFarmCode = "";
      render();
    }
  };
}

function renderOwnerInlineList(items) {
  return items
    .map(
      (item) => `
        <div class="fa-list-row">
          <div>
            <span>${item.label}</span>
            ${item.note ? `<p>${item.note}</p>` : ""}
            ${
              item.file_url
                ? `<div class="fa-inline-actions"><a class="fa-secondary-btn" href="${item.file_url}" target="_blank" rel="noopener noreferrer">Open file</a></div>`
                : ""
            }
          </div>
          <strong>${item.value}</strong>
        </div>
      `
    )
    .join("");
}

function populateOwnerFinanceFarmSelect(items) {
  const select = document.querySelector("[data-owner-finance-farm-select]");
  if (!select) return;
  const currentValue = select.value;
  select.innerHTML = [
    `<option value="">Choose farm</option>`,
    ...items.map(
      (item) =>
        `<option value="${item.farmer_code || ""}" data-current-shed="${item.current_shed || ""}" data-active-sheds="${item.active_sheds || 1}">
          ${(item.farm_name || item.farmer_name || "").trim()}${item.farmer_code ? ` • ${item.farmer_code}` : ""}
        </option>`
    ),
  ].join("");
  if (currentValue) select.value = currentValue;
  syncOwnerFinanceFarmMeta();
}

function buildOwnerFinanceShedOptions(currentShed, activeSheds) {
  const sheds = [];
  const shedCount = Number(activeSheds || 0);
  for (let index = 1; index <= shedCount; index += 1) {
    sheds.push(`Shed ${index}`);
  }
  const cleanedCurrentShed = `${currentShed || ""}`.trim();
  if (cleanedCurrentShed && !sheds.includes(cleanedCurrentShed)) {
    sheds.unshift(cleanedCurrentShed);
  }
  return sheds;
}

function syncOwnerFinanceFarmMeta() {
  const select = document.querySelector("[data-owner-finance-farm-select]");
  const shedSelect = document.querySelector("[data-owner-finance-sheds]");
  const shedValueInput = document.querySelector("[data-owner-finance-shed-value]");
  if (!select || !shedSelect || !shedValueInput) return;
  const selected = select.options[select.selectedIndex];
  const currentShed = selected?.dataset.currentShed || "";
  const activeSheds = selected?.dataset.activeSheds || "1";
  const sheds = buildOwnerFinanceShedOptions(currentShed, activeSheds);
  if (!selected?.value) {
    shedSelect.innerHTML = `<option value="">Choose farm first</option>`;
    shedValueInput.value = "";
    return;
  }
  shedSelect.innerHTML = sheds
    .map((shed) => `<option value="${shed}">${shed}</option>`)
    .join("");
  shedValueInput.value = "";
}

function setOwnerFinanceDefaultDate() {
  const input = document.querySelector('[data-owner-operational-cost-form] input[name="entry_date"]');
  if (!input || input.value) return;
  input.value = new Date().toISOString().slice(0, 10);
}

function populateOwnerSaleFarmSelect(items) {
  const select = document.querySelector("[data-owner-sale-farm-select]");
  if (!select) return;
  const currentValue = select.value;
  select.innerHTML = [
    `<option value="">Choose farm</option>`,
    ...items.map(
      (item) =>
        `<option value="${item.farmer_code || ""}">
          ${(item.farm_name || item.farmer_name || "").trim()}${item.farmer_code ? ` • ${item.farmer_code}` : ""}
        </option>`
    ),
  ].join("");
  if (currentValue) select.value = currentValue;
}

function populateOwnerSalePartySelect(items) {
  const select = document.querySelector("[data-owner-sale-party-select]");
  if (!select) return;
  const currentValue = select.value;
  select.innerHTML = [
    `<option value="">Choose party</option>`,
    ...items.map(
      (item) => `
        <option value="${item.name || ""}">
          ${(item.name || "").trim()}${item.phone ? ` • ${item.phone}` : ""}${item.market_area ? ` • ${item.market_area}` : ""}
        </option>
      `
    ),
  ].join("");
  if (currentValue) select.value = currentValue;
}

function setOwnerSaleDefaultDate() {
  const input = document.querySelector('[data-owner-sale-form] input[name="entry_date"]');
  if (!input || input.value) return;
  input.value = new Date().toISOString().slice(0, 10);
}

function renderOwnerFilesData(data) {
  if (!data) return;
  ownerFarmWorkspaceState.files = data;
  populateProfile(data.profile);
  renderKpis(document.querySelector("#owner-files-kpis"), data.kpis || []);

  const container = document.querySelector("#owner-files-browser");
  if (!container) return;
  const farms = data.farms || [];
  if (!farms.length) {
    container.innerHTML = `<div class="fa-empty-state">Abhi kisi farm se files available nahi hain.</div>`;
    return;
  }

  const state = { selectedFarmCode: "" };

  const render = () => {
    const selectedFarm = farms.find((farm) => farm.farmer_code === state.selectedFarmCode);
    if (!selectedFarm) {
      container.innerHTML = `
        <div class="owner-daily-level-grid owner-daily-farm-grid">
          ${farms
            .map(
              (farm) => `
                <button type="button" class="owner-daily-level-card owner-daily-farm-card-button" data-owner-file-farm="${farm.farmer_code || ""}">
                  <div class="owner-daily-level-head">
                    <div>
                      <span>Farm</span>
                      <h4>${farm.farm_name || "-"}</h4>
                      <p>${[farm.farmer_name, farm.farmer_code, farm.cluster].filter(Boolean).join(" • ")}</p>
                    </div>
                  </div>
                  <div class="owner-daily-level-meta">
                    <span>${farm.current_batch ? `Batch ${farm.current_batch}` : "No batch"}</span>
                    <span>${farm.documents_count} documents</span>
                    <span>${farm.photos_count} images</span>
                  </div>
                </button>
              `
            )
            .join("")}
        </div>
      `;
      return;
    }

    container.innerHTML = `
      <div class="owner-daily-pathbar">
        <div class="owner-daily-breadcrumbs">
          <button type="button" class="owner-daily-crumb" data-owner-file-back="farms">Farms</button>
          <span>/</span>
          <span class="owner-daily-crumb is-active">${selectedFarm.farm_name || "-"}</span>
        </div>
        <div class="owner-daily-path-actions">
          <button type="button" class="fa-secondary-btn" data-owner-file-back="farms">Back to farms</button>
        </div>
      </div>
      <section class="owner-daily-focus-card">
        <div class="owner-hierarchy-farm-head owner-daily-static-head">
          <div class="owner-hierarchy-title">
            <span>Selected farm</span>
            <h4>${selectedFarm.farm_name || "-"}</h4>
            <p>${[selectedFarm.farmer_name, selectedFarm.farmer_code, selectedFarm.cluster].filter(Boolean).join(" • ")}</p>
          </div>
          <div class="owner-hierarchy-chip-row">
            <span class="owner-hierarchy-chip">${selectedFarm.current_batch ? `Batch ${selectedFarm.current_batch}` : "No batch"}</span>
            <span class="owner-hierarchy-chip">${selectedFarm.documents_count} documents</span>
            <span class="owner-hierarchy-chip">${selectedFarm.photos_count} images</span>
          </div>
        </div>
      </section>
      <div class="owner-grid-two owner-files-grid">
        <section class="fa-section">
          <div class="fa-section-head">
            <div>
              <p class="fa-eyebrow">Bills & Documents</p>
              <h3>Documents</h3>
            </div>
          </div>
          <div class="fa-list-card">
            ${
              selectedFarm.documents.length
                ? selectedFarm.documents
                    .map(
                      (item) => `
                        <div class="fa-list-row">
                          <div>
                            <span>${item.entry_date} / ${item.doc_type}</span>
                            <p>${[item.title, item.amount || "", item.notes || ""].filter(Boolean).join(" • ")}</p>
                          </div>
                          ${
                            item.file_url
                              ? `<a class="fa-secondary-btn" href="${item.file_url}" target="_blank" rel="noopener noreferrer">Open file</a>`
                              : `<strong>${item.status}</strong>`
                          }
                        </div>
                      `
                    )
                    .join("")
                : `<div class="fa-empty-state">Is farm ke documents abhi available nahi hain.</div>`
            }
          </div>
        </section>
        <section class="fa-section">
          <div class="fa-section-head">
            <div>
              <p class="fa-eyebrow">Images</p>
              <h3>Farm images</h3>
            </div>
          </div>
          <div class="owner-file-photo-grid">
            ${
              selectedFarm.photos.length
                ? selectedFarm.photos
                    .map(
                      (item) => `
                        <article class="owner-file-photo-card">
                          <span>${item.entry_date} / ${item.kind}</span>
                          <strong>${item.title || "-"}</strong>
                          <p>${[item.shed, item.priority || "", item.notes || ""].filter(Boolean).join(" • ")}</p>
                          <a class="owner-daily-entry-photo-link" href="${item.file_url}" target="_blank" rel="noopener noreferrer">
                            <img src="${item.file_url}" alt="${item.file_name || item.title || "Farm image"}" loading="lazy" />
                            <strong>Open image</strong>
                          </a>
                        </article>
                      `
                    )
                    .join("")
                : `<div class="fa-empty-state">Is farm ke images abhi available nahi hain.</div>`
            }
          </div>
        </section>
      </div>
    `;
  };

  render();
  renderOwnerFarmWorkspace();

  container.onclick = (event) => {
    const farmButton = event.target.closest("[data-owner-file-farm]");
    if (farmButton) {
      state.selectedFarmCode = farmButton.getAttribute("data-owner-file-farm") || "";
      render();
      return;
    }
    const backButton = event.target.closest("[data-owner-file-back]");
    if (backButton) {
      state.selectedFarmCode = "";
      render();
    }
  };
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
  ownerFarmWorkspaceState.parties = data;
  populateProfile(data.profile);
  renderOwnerPartyDirectory(document.querySelector("#owner-party-directory"), data.parties || []);
  renderOwnerSaleRules(document.querySelector("#owner-sale-rule-list"), data.sale_rules || []);
  renderSaleReadyQueue(document.querySelector("#owner-sale-ready-queue"), data.sale_ready_queue || []);
  populateSaleRuleSelect(data.farmer_options || []);
  const note = document.querySelector("#owner-whatsapp-note");
  if (note) note.textContent = data.meta?.whatsapp_note || "";
  renderOwnerFarmWorkspace();
}

function populateFarmerSelect(items) {
  const select = document.querySelector("[data-owner-farmer-select]");
  if (!select) return;
  const currentValue = select.value;
  const options = [
    `<option value="">Choose farmer</option>`,
    ...items.map(
      (item) =>
        `<option value="${item.farmer_code || ""}" data-farm-name="${item.farm_name || ""}" data-batch="${item.active_batch || ""}" data-current-shed="${item.current_shed || ""}" data-bird-age="${item.bird_age_days || 0}" data-initial-batch-strength="${item.initial_batch_strength || 0}">
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
  const batchStrengthInput = document.querySelector('[data-owner-batch-entry] input[name="initial_batch_strength"]');
  if (!select || !farmNameInput || !batchInput || !shedInput || !ageInput || !batchStrengthInput) return;
  const selectedOption = select.options[select.selectedIndex];
  farmNameInput.value = selectedOption?.dataset.farmName || "";
  batchInput.value = selectedOption?.dataset.batch || "";
  shedInput.value = selectedOption?.dataset.currentShed || "";
  ageInput.value = selectedOption?.dataset.birdAge === "0" ? "" : selectedOption?.dataset.birdAge || "";
  batchStrengthInput.value =
    selectedOption?.dataset.initialBatchStrength === "0" ? "" : selectedOption?.dataset.initialBatchStrength || "";
}

function setOwnerFormPanelVisibility(panelName, isOpen) {
  const panelMap = {
    enrollment: document.querySelector("#owner-enrollment-section"),
    batch: document.querySelector("#owner-batch-entry-anchor"),
  };
  const panel = panelMap[panelName];
  if (!panel) return;
  panel.hidden = !isOpen;
  if (isOpen) {
    panel.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

function closeAllOwnerFormPanels() {
  setOwnerFormPanelVisibility("enrollment", false);
  setOwnerFormPanelVisibility("batch", false);
}

function ownerFarmCodeToken(value, fallback = "") {
  const cleaned = `${value || ""}`.toUpperCase().replace(/[^A-Z0-9]+/g, "");
  return cleaned.slice(0, 3) || fallback;
}

function buildOwnerFarmCodePreview(farmName, area) {
  const farmToken = ownerFarmCodeToken(farmName, "");
  const areaToken = ownerFarmCodeToken(area, "");
  if (!farmToken && !areaToken) return "";
  if (!areaToken) return farmToken;
  if (!farmToken) return areaToken;
  return `${farmToken}-${areaToken}`;
}

function syncOwnerFarmerCodePreview() {
  const form = document.querySelector("[data-owner-enroll-farmer]");
  if (!form) return;
  const farmNameInput = form.querySelector('input[name="farm_name"]');
  const areaInput = form.querySelector('input[name="cluster"]');
  const codeInput = form.querySelector('input[name="farmer_code"]');
  if (!farmNameInput || !areaInput || !codeInput) return;
  codeInput.value = buildOwnerFarmCodePreview(farmNameInput.value, areaInput.value);
}

function resetOwnerEnrollmentForm() {
  const form = document.querySelector("[data-owner-enroll-farmer]");
  if (!form) return;
  form.reset();
  const hiddenCode = form.querySelector('input[name="editing_farmer_code"]');
  const submitButton = form.querySelector("[data-owner-enroll-submit]");
  const cancelButton = form.querySelector("[data-owner-enroll-cancel]");
  const passwordInput = form.querySelector('input[name="password"]');
  const passwordNote = form.querySelector("[data-owner-password-note]");
  if (hiddenCode) hiddenCode.value = "";
  if (submitButton) submitButton.textContent = "Create Enrollment";
  if (cancelButton) cancelButton.hidden = true;
  if (passwordInput) {
    passwordInput.required = true;
    passwordInput.placeholder = "Create password";
  }
  if (passwordNote) {
    passwordNote.textContent = "New farmer ke liye password zaroori hai.";
  }
  syncOwnerFarmerCodePreview();
}

function startOwnerFarmerEdit(item) {
  const form = document.querySelector("[data-owner-enroll-farmer]");
  if (!form || !item) return;
  setOwnerFormPanelVisibility("enrollment", true);
  const passwordInput = form.querySelector('input[name="password"]');
  const passwordNote = form.querySelector("[data-owner-password-note]");
  form.querySelector('input[name="editing_farmer_code"]').value = item.farmer_code || "";
  form.querySelector('input[name="farmer_name"]').value = item.farmer_name || "";
  form.querySelector('input[name="phone"]').value = item.phone || "";
  if (passwordInput) {
    passwordInput.value = "";
    passwordInput.required = false;
    passwordInput.placeholder = "Leave blank to keep current password";
  }
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
  if (passwordNote) {
    passwordNote.textContent = "Blank chhodne par purana password waise ka waise rahega.";
  }
  syncOwnerFarmerCodePreview();
  setStatus(".owner-create-note", `Editing ${item.farmer_name || item.farm_name || "farmer"}.`);
  form.scrollIntoView({ behavior: "smooth", block: "start" });
}

function startOwnerBatchEdit(item) {
  const form = document.querySelector("[data-owner-batch-entry]");
  const farmerSelect = form?.querySelector("[data-owner-farmer-select]");
  if (!form || !farmerSelect || !item?.farmer_code) return;
  setOwnerFormPanelVisibility("batch", true);
  farmerSelect.value = item.farmer_code || "";
  syncSelectedFarmerMeta();
  form.querySelector('input[name="active_batch"]').value = item.active_batch || "";
  form.querySelector('input[name="current_shed"]').value = item.current_shed || "";
  form.querySelector('input[name="bird_age_days"]').value = item.bird_age_days ? item.bird_age_days : "";
  setStatus(".owner-batch-note", `Editing ${item.farm_name || item.farmer_name || "selected farm"} batch.`);
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
  navigate("/owner-app/farms.html");
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
  quickButton.textContent = "Open Farms";
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

async function loadFiles() {
  const data = await requestJson(`${ownerApiBase}/files`);
  writeCache("files", data);
  renderOwnerFilesData(data);
}

async function loadReports() {
  const data = await requestJson(`${ownerApiBase}/reports`);
  writeCache("reports", data);
  renderOwnerReportsData(data);
}

async function loadOwnerProfile() {
  const profile = await requestJson(`${ownerApiBase}/profile`);
  const data = { profile };
  writeCache("profile", data);
  renderOwnerProfileData(data);
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
      navigate("/owner-app/farms.html");
    } catch {
      setStatus(".fa-form-note", "Login nahi ho paaya. Owner credentials dobara check karein.", true);
    }
  });
}

const enrollFarmerForm = document.querySelector("[data-owner-enroll-farmer]");
if (enrollFarmerForm) {
  const cancelEditButton = enrollFarmerForm.querySelector("[data-owner-enroll-cancel]");
  enrollFarmerForm.querySelector('input[name="farm_name"]')?.addEventListener("input", syncOwnerFarmerCodePreview);
  enrollFarmerForm.querySelector('input[name="cluster"]')?.addEventListener("input", syncOwnerFarmerCodePreview);
  cancelEditButton?.addEventListener("click", () => {
    resetOwnerEnrollmentForm();
    setStatus(".owner-create-note", "");
    setOwnerFormPanelVisibility("enrollment", false);
  });

  document.addEventListener("click", (event) => {
    const openPanelTrigger = event.target.closest("[data-owner-open-panel]");
    if (openPanelTrigger) {
      const panelName = openPanelTrigger.getAttribute("data-owner-open-panel");
      if (panelName === "enrollment" || panelName === "batch") {
        setOwnerFormPanelVisibility(panelName, true);
      }
      return;
    }
    const closePanelTrigger = event.target.closest("[data-owner-close-panel]");
    if (closePanelTrigger) {
      const panelName = closePanelTrigger.getAttribute("data-owner-close-panel");
      if (panelName === "enrollment") {
        resetOwnerEnrollmentForm();
        setStatus(".owner-create-note", "");
      }
      if (panelName === "batch") {
        setStatus(".owner-batch-note", "");
      }
      setOwnerFormPanelVisibility(panelName, false);
      return;
    }
    const openFarmTrigger = event.target.closest("[data-owner-open-farm]");
    if (openFarmTrigger && !event.target.closest("[data-owner-edit-farm-card], [data-owner-edit-batch-card]")) {
      ownerFarmWorkspaceState.selectedFarmCode = openFarmTrigger.getAttribute("data-owner-open-farm") || "";
      ownerFarmWorkspaceState.selectedSection = "";
      ownerFarmWorkspaceState.editingSaleId = null;
      renderOwnerFarmWorkspace();
      document.querySelector("#owner-selected-farm-workspace")?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    const openFarmSectionTrigger = event.target.closest("[data-owner-open-farm-section]");
    if (openFarmSectionTrigger) {
      ownerFarmWorkspaceState.selectedSection = openFarmSectionTrigger.getAttribute("data-owner-open-farm-section") || "";
      ownerFarmWorkspaceState.editingSaleId = null;
      renderOwnerFarmWorkspace();
      return;
    }
    const backFarmSectionsTrigger = event.target.closest("[data-owner-back-farm-sections]");
    if (backFarmSectionsTrigger) {
      ownerFarmWorkspaceState.selectedSection = "";
      ownerFarmWorkspaceState.editingSaleId = null;
      renderOwnerFarmWorkspace();
      return;
    }
    const editSaleRateTrigger = event.target.closest("[data-owner-edit-sale-rate]");
    if (editSaleRateTrigger) {
      ownerFarmWorkspaceState.editingSaleId = editSaleRateTrigger.getAttribute("data-owner-edit-sale-rate") || null;
      renderOwnerFarmWorkspace();
      return;
    }
    const cancelSaleRateTrigger = event.target.closest("[data-owner-cancel-sale-rate]");
    if (cancelSaleRateTrigger) {
      ownerFarmWorkspaceState.editingSaleId = null;
      renderOwnerFarmWorkspace();
      return;
    }
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
    syncOwnerFarmerCodePreview();
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
      setOwnerFormPanelVisibility("enrollment", false);
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
      setStatus(".owner-party-note", `${result.party.name} save ho gaya.`);
      resetOwnerPartyForm();
      loadParties().catch(console.error);
    } catch {
      setStatus(".owner-party-note", "Party save nahi ho paayi. Details dobara check karein.", true);
    }
  });
}

const saleRuleForm = document.querySelector("[data-owner-sale-rule-form]");
if (saleRuleForm) {
  saleRuleForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(saleRuleForm);
    if (!formData.get("farmer_code")) {
      setStatus(".owner-sale-rule-note", "Farm select karein.", true);
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
      setStatus(".owner-sale-rule-note", "Trigger save nahi ho paaya. Details dobara check karein.", true);
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
      setStatus(".owner-batch-note", "Farmer select karein.", true);
      return;
    }
    const payload = {
      farmer_code: formData.get("farmer_code"),
      active_batch: formData.get("active_batch"),
      current_shed: formData.get("current_shed"),
      bird_age_days: Number(formData.get("bird_age_days") || 0),
      initial_batch_strength: Number(formData.get("initial_batch_strength") || 0),
    };

    try {
      const result = await requestJson(`${ownerApiBase}/farmers/batch`, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      setStatus(
        ".owner-batch-note",
        `Batch save ho gaya: ${result.farmer.farmer_name} • ${result.farmer.active_batch} • ${result.farmer.current_shed || "-"} • ${result.farmer.bird_age_days} days • ${result.farmer.initial_batch_strength || 0} chicks`
      );
      setOwnerFormPanelVisibility("batch", false);
      loadFarms().catch(console.error);
    } catch {
      setStatus(".owner-batch-note", "Batch save nahi ho paaya. Details dobara check karein.", true);
    }
  });
}

const ownerOperationalCostForm = document.querySelector("[data-owner-operational-cost-form]");
if (ownerOperationalCostForm) {
  const farmSelect = ownerOperationalCostForm.querySelector("[data-owner-finance-farm-select]");
  const shedSelect = ownerOperationalCostForm.querySelector("[data-owner-finance-sheds]");
  const shedValueInput = ownerOperationalCostForm.querySelector("[data-owner-finance-shed-value]");
  farmSelect?.addEventListener("change", syncOwnerFinanceFarmMeta);
  shedSelect?.addEventListener("change", () => {
    if (!shedValueInput) return;
    shedValueInput.value = Array.from(shedSelect.selectedOptions)
      .map((option) => option.value)
      .filter(Boolean)
      .join(", ");
  });
  setOwnerFinanceDefaultDate();

  ownerOperationalCostForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(ownerOperationalCostForm);
    const farmCode = `${formData.get("farmer_code") || ""}`.trim();
    const itemName = `${formData.get("item_name") || ""}`.trim();

    if (!farmCode) {
      setStatus(".owner-finance-cost-note", "Pehle farm select karein.", true);
      return;
    }

    if (!itemName) {
      setStatus(".owner-finance-cost-note", "Item ya service ka naam daalein.", true);
      return;
    }

    try {
      await requestJson(`${ownerApiBase}/operational-costs`, {
        method: "POST",
        body: formData,
      });

      const selectedFarmLabel =
        farmSelect?.options[farmSelect.selectedIndex]?.textContent?.trim() || "Selected farm";
      ownerOperationalCostForm.reset();
      if (farmSelect && farmCode) farmSelect.value = farmCode;
      syncOwnerFinanceFarmMeta();
      setOwnerFinanceDefaultDate();
      setStatus(".owner-finance-cost-note", `${selectedFarmLabel} ke liye operational cost save ho gaya.`);
      loadFinance().catch(console.error);
    } catch {
      setStatus(".owner-finance-cost-note", "Operational cost save nahi ho paaya. Farm aur expense details dobara check karein.", true);
    }
  });
}

const ownerSaleForm = document.querySelector("[data-owner-sale-form]");
if (ownerSaleForm) {
  setOwnerSaleDefaultDate();
  const saleWeightInput = ownerSaleForm.querySelector('input[name="total_weight_kg"]');
  const saleRateInput = ownerSaleForm.querySelector('input[name="rate_per_kg"]');
  const saleAmountInput = ownerSaleForm.querySelector('input[name="amount"]');

  const syncOwnerSaleAmount = () => {
    if (!saleAmountInput) return;
    const weight = parseLooseNumber(saleWeightInput?.value);
    const rate = parseLooseNumber(saleRateInput?.value);
    if (!Number.isFinite(weight) || !Number.isFinite(rate)) {
      saleAmountInput.value = "";
      return;
    }
    saleAmountInput.value = formatCurrencyInput(weight * rate);
  };

  saleWeightInput?.addEventListener("input", syncOwnerSaleAmount);
  saleRateInput?.addEventListener("input", syncOwnerSaleAmount);

  ownerSaleForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    syncOwnerSaleAmount();
    const formData = new FormData(ownerSaleForm);
    const farmCode = `${formData.get("farmer_code") || ""}`.trim();
    const billNumber = `${formData.get("bill_number") || ""}`.trim();
    const partyName = `${formData.get("party_name") || ""}`.trim();
    const totalWeight = `${formData.get("total_weight_kg") || ""}`.trim();
    const rate = `${formData.get("rate_per_kg") || ""}`.trim();
    const farmSelect = ownerSaleForm.querySelector("[data-owner-sale-farm-select]");

    if (!farmCode) {
      setStatus(".owner-sale-note", "Pehle farm select karein.", true);
      return;
    }
    if (!billNumber || !partyName || !totalWeight || !rate) {
      setStatus(".owner-sale-note", "Bill no., party name, kgs, aur rate daalna zaroori hai.", true);
      return;
    }

    try {
      await requestJson(`${ownerApiBase}/sales`, {
        method: "POST",
        body: formData,
      });
      const selectedFarmLabel =
        farmSelect?.options[farmSelect.selectedIndex]?.textContent?.trim() || "Selected farm";
      ownerSaleForm.reset();
      if (farmSelect && farmCode) farmSelect.value = farmCode;
      setOwnerSaleDefaultDate();
      syncOwnerSaleAmount();
      setStatus(".owner-sale-note", `${selectedFarmLabel} ke liye sale record save ho gaya.`);
      loadFinance().catch(console.error);
    } catch {
      setStatus(".owner-sale-note", "Sale record save nahi ho paaya. Details dobara check karein.", true);
    }
  });
}

document.addEventListener("submit", async (event) => {
  const form = event.target.closest("[data-owner-sale-rate-form]");
  if (!form) return;
  event.preventDefault();
  const saleId = form.getAttribute("data-owner-sale-rate-form");
  const rateInput = form.querySelector('input[name="rate_per_kg"]');
  const rateValue = `${rateInput?.value || ""}`.trim();
  if (!saleId || !rateValue) return;
  try {
    await requestJson(`${ownerApiBase}/sales/${saleId}`, {
      method: "PUT",
      body: JSON.stringify({ rate_per_kg: rateValue }),
    });
    ownerFarmWorkspaceState.editingSaleId = null;
    loadFinance().catch(console.error);
    loadReports().catch(console.error);
  } catch {
    setStatus(".owner-sale-note", "Rate save nahi ho paaya. Dobara try karein.", true);
  }
});

const ownerProfileForm = document.querySelector("[data-owner-profile-form]");
if (ownerProfileForm) {
  ownerProfileForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(ownerProfileForm);
    const payload = {
      name: `${formData.get("name") || ""}`.trim(),
      phone: `${formData.get("phone") || ""}`.trim(),
      cluster: `${formData.get("cluster") || ""}`.trim(),
      password: `${formData.get("password") || ""}`.trim(),
    };
    if (!payload.name || !payload.phone) {
      setStatus(".owner-profile-note", "Owner name aur mobile number zaroori hai.", true);
      return;
    }
    try {
      const result = await requestJson(`${ownerApiBase}/profile`, {
        method: "PUT",
        body: JSON.stringify(payload),
      });
      ownerProfileForm.elements.password.value = "";
      renderOwnerProfileData({ profile: result.profile });
      setStatus(".owner-profile-note", "Profile save ho gaya.");
      writeCache("profile", { profile: result.profile });
    } catch (error) {
      const duplicate = error?.status === 409;
      setStatus(".owner-profile-note", duplicate ? "Yeh mobile number pehle se use ho raha hai." : "Profile save nahi ho paaya.", true);
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
initOwnerShell();
if (page) {
  if (page === "dashboard") {
    goToOwnerDashboard();
  } else if (page === "farms") {
    renderFarmsData(readCache("farms"));
    loadFarms().catch(handlePageError);
    loadOperations().catch(handlePageError);
    loadFinance().catch(handlePageError);
    loadFiles().catch(handlePageError);
    loadReports().catch(handlePageError);
    loadParties().catch(handlePageError);
  } else if (page === "operations" || page.startsWith("operations-")) {
    renderOperationsData(readCache("operations"));
    loadOperations().catch(handlePageError);
  } else if (page === "finance" || page === "finance-costs" || page === "finance-sales") {
    renderFinanceData(readCache("finance"));
    loadFinance().catch(handlePageError);
  } else if (page === "parties") {
    renderPartiesData(readCache("parties"));
    loadParties().catch(handlePageError);
  } else if (page === "files") {
    renderOwnerFilesData(readCache("files"));
    loadFiles().catch(handlePageError);
  } else if (page === "reports") {
    renderOwnerReportsData(readCache("reports"));
    loadReports().catch(handlePageError);
  } else if (page === "profile") {
    renderOwnerProfileData(readCache("profile"));
    loadOwnerProfile().catch(handlePageError);
  }
}
