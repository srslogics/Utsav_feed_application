const apiOrigin = window.location.protocol === "file:" ? "http://127.0.0.1:8000" : "";
const ownerApiBase = `${apiOrigin}/api/owner`;
const authApiBase = `${apiOrigin}/api/auth`;
const ownerCachePrefix = "utsavOwnerPage:";

function navigate(url) {
  if (window.location.pathname === url) return;
  window.location.replace(url);
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, {
    credentials: "include",
    headers: {
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

function renderDailyEntryHierarchy(container, farms) {
  const summary = document.querySelector("#owner-operations-daily-summary");
  if (!container) return;
  if (!farms?.length) {
    if (summary) summary.innerHTML = "";
    container.innerHTML = `<div class="fa-empty-state">Abhi koi record available nahi hai.</div>`;
    return;
  }

  const totalFarms = farms.length;
  const totalSheds = farms.reduce((count, farm) => count + (farm.sheds?.length || 0), 0);
  const totalEntries = farms.reduce(
    (count, farm) => count + (farm.sheds || []).reduce((shedCount, shed) => shedCount + (shed.entry_count || 0), 0),
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

  container.innerHTML = farms
    .map(
      (farm, farmIndex) => `
        <details class="owner-hierarchy-farm" ${farmIndex === 0 ? "open" : ""}>
          <summary class="owner-hierarchy-farm-head">
            <div class="owner-hierarchy-title">
              <span>Farm</span>
              <h4>${farm.farm_name || "-"}</h4>
              <p>${[farm.farmer_name, farm.farmer_code, farm.cluster].filter(Boolean).join(" • ")}</p>
            </div>
            <div class="owner-hierarchy-chip-row">
              <span class="owner-hierarchy-chip">${farm.current_batch ? `Batch ${farm.current_batch}` : "No batch"}</span>
              <span class="owner-hierarchy-chip">${farm.bird_age_days || 0} days</span>
              <span class="owner-hierarchy-chip owner-hierarchy-chip-muted">${farm.latest_entry_date ? `Latest ${farm.latest_entry_date}` : "No entry yet"}</span>
            </div>
          </summary>
          <div class="owner-hierarchy-sheds">
            ${farm.sheds
              .map(
                (shed, shedIndex) => `
                  <details class="owner-hierarchy-shed" ${farmIndex === 0 && shedIndex === 0 && shed.entry_count ? "open" : ""}>
                    <summary class="owner-hierarchy-shed-head">
                      <div class="owner-hierarchy-title">
                        <span>Shed</span>
                        <h5>${shed.shed_name}</h5>
                      </div>
                      <div class="owner-hierarchy-chip-row">
                        <span class="owner-hierarchy-chip">${shed.entry_count} entries</span>
                        <span class="owner-hierarchy-chip owner-hierarchy-chip-muted">${shed.latest_entry_date ? `Latest ${shed.latest_entry_date}` : "No entry yet"}</span>
                      </div>
                    </summary>
                    <div class="owner-hierarchy-entry-list">
                      ${
                        shed.entries.length
                          ? shed.entries
                              .map(
                                (entry) => `
                                  <article class="owner-hierarchy-entry">
                                    <div class="owner-hierarchy-entry-head">
                                      <strong>${entry.entry_date}</strong>
                                      <span class="owner-hierarchy-status">${entry.litter_condition || "-"}</span>
                                    </div>
                                    <div class="owner-hierarchy-entry-grid">
                                      <span><label>Mortality</label><strong>${entry.mortality}</strong></span>
                                      <span><label>Culls</label><strong>${entry.culls}</strong></span>
                                      <span><label>Feed</label><strong>${entry.feed_used_bags} bags</strong></span>
                                      <span><label>Water</label><strong>${entry.water_liters} L</strong></span>
                                      <span><label>Weight</label><strong>${entry.avg_weight_g} g</strong></span>
                                      <span><label>Temp</label><strong>${entry.temperature_c} C</strong></span>
                                      <span><label>Humidity</label><strong>${entry.humidity_pct}%</strong></span>
                                    </div>
                                    ${
                                      entry.issues || entry.remarks
                                        ? `<p class="owner-hierarchy-entry-note">${[entry.issues, entry.remarks].filter(Boolean).join(" • ")}</p>`
                                        : ""
                                    }
                                  </article>
                                `
                              )
                              .join("")
                          : `<div class="fa-empty-state">Is shed ke liye abhi koi daily entry nahi hai.</div>`
                      }
                    </div>
                  </details>
                `
              )
              .join("")}
          </div>
        </details>
      `
    )
    .join("");
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
  renderGrid(document.querySelector("#owner-farms-directory"), data.farms);
  renderList(document.querySelector("#owner-farms-latest-entries"), data.latest_entries);
  renderList(document.querySelector("#owner-farmer-accounts"), data.farmer_accounts || []);
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
    goToOwnerLogin();
    return;
  }
  console.error(error);
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
  enrollFarmerForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(enrollFarmerForm);
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
      const result = await requestJson(`${ownerApiBase}/farmers`, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      setStatus(
        ".owner-create-note",
        `Farmer account create ho gaya: ${result.farmer.farmer_name} • ${result.farmer.phone} • Password ${result.login_password}`
      );
      enrollFarmerForm.reset();
      const shedsInput = enrollFarmerForm.querySelector('input[name="active_sheds"]');
      if (shedsInput) shedsInput.value = "1";
      loadFarms().catch(console.error);
    } catch (error) {
      setStatus(".owner-create-note", "Farmer create nahi ho paaya. Phone ya farmer code dobara check karein.", true);
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
}
