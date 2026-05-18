const apiOrigin = window.location.protocol === "file:" ? "http://127.0.0.1:8000" : "";
const farmerApiBase = `${apiOrigin}/api/farmer`;
const authApiBase = `${apiOrigin}/api/auth`;

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
    const errorBody = await response.text();
    throw new Error(errorBody || `Request failed: ${response.status}`);
  }

  return response.json();
}

function setStatus(selector, message, isError = false) {
  const element = document.querySelector(selector);
  if (!element) return;
  element.textContent = message;
  element.classList.toggle("is-error", isError);
}

function populateProfile(profile) {
  if (!profile) return;
  document.querySelectorAll("[data-profile-name]").forEach((el) => (el.textContent = profile.farmer_name || profile.name || ""));
  document.querySelectorAll("[data-profile-cluster]").forEach((el) => (el.textContent = profile.cluster || ""));
  document.querySelectorAll("[data-profile-farm]").forEach((el) => (el.textContent = profile.farm_name || ""));
  document.querySelectorAll("[data-profile-batch]").forEach((el) => (el.textContent = `Batch ${profile.active_batch || "-"}`));
  document.querySelectorAll("[data-profile-capacity]").forEach((el) => (el.textContent = profile.farm_capacity || "-"));
  document.querySelectorAll("[data-profile-officer]").forEach((el) => (el.textContent = profile.field_officer || "-"));
}

function setDefaultDates() {
  const today = new Date().toISOString().slice(0, 10);
  document.querySelectorAll('input[type="date"]').forEach((input) => {
    if (!input.value) input.value = today;
  });
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

function renderKeyValueGrid(container, items) {
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

async function requireFarmerSession({ allowLoginPage = false } = {}) {
  try {
    const session = await requestJson(`${authApiBase}/session`);
    if (session.role !== "farmer") {
      window.location.href = "/farmer-app/";
      return null;
    }
    populateProfile(session.user);
    if (allowLoginPage) {
      window.location.href = "/farmer-app/dashboard.html";
      return null;
    }
    return session.user;
  } catch {
    if (!allowLoginPage) {
      window.location.href = "/farmer-app/";
    }
    return null;
  }
}

async function logoutUser() {
  await requestJson(`${authApiBase}/logout`, { method: "POST" });
  window.location.href = "/farmer-app/";
}

async function loadDashboard() {
  const data = await requestJson(`${farmerApiBase}/dashboard`);
  populateProfile(data.profile);
  renderKpis(document.querySelector("#dashboard-kpis"), data.kpis);
  renderKpis(document.querySelector("#dashboard-performance"), data.performance_metrics);
  renderKeyValueGrid(document.querySelector("#dashboard-batch"), data.batch_summary);
  renderList(document.querySelector("#dashboard-alerts"), data.owner_alerts);
  renderKeyValueGrid(document.querySelector("#dashboard-latest-entry"), data.latest_daily_entry);
  renderList(document.querySelector("#dashboard-tasks"), data.tasks);
  renderList(document.querySelector("#dashboard-mortality-log"), data.mortality_history);
}

async function loadDailyEntry() {
  const data = await requestJson(`${farmerApiBase}/daily-entry`);
  populateProfile(data.profile);
  renderList(document.querySelector("#daily-entry-history"), data.entry_history);
  renderList(document.querySelector("#daily-vaccine-history"), data.vaccine_history);
}

async function loadFeed() {
  const data = await requestJson(`${farmerApiBase}/feed`);
  populateProfile(data.profile);
  renderKeyValueGrid(document.querySelector("#feed-balance"), data.shed_balances);
  renderList(document.querySelector("#feed-history"), data.inward_history);
}

async function loadHealth() {
  const data = await requestJson(`${farmerApiBase}/health`);
  populateProfile(data.profile);
  renderKeyValueGrid(document.querySelector("#health-summary"), data.summary);
  renderList(document.querySelector("#health-log"), data.log);
  renderList(document.querySelector("#health-vaccines"), data.vaccines);
}

async function loadRequests() {
  const data = await requestJson(`${farmerApiBase}/requests`);
  populateProfile(data.profile);
  renderList(document.querySelector("#request-history"), data.history);
  renderList(document.querySelector("#document-history"), data.documents);
  renderList(document.querySelector("#issue-photo-history"), data.issue_photos);
}

async function handleFormSubmit(form, url, selector, makePayload, afterSuccess) {
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(form);
    try {
      await requestJson(url, {
        method: "POST",
        body: JSON.stringify(makePayload(formData)),
      });
      form.reset();
      setDefaultDates();
      if (afterSuccess) await afterSuccess();
      setStatus(selector, "Safalta se save ho gaya.");
    } catch {
      setStatus(selector, "Abhi save nahi ho paaya. Kripya dobara koshish karein.", true);
    }
  });
}

async function handleUploadSubmit(form, url, selector, afterSuccess) {
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(form);
    try {
      await requestJson(url, {
        method: "POST",
        body: formData,
      });
      form.reset();
      setDefaultDates();
      if (afterSuccess) await afterSuccess();
      setStatus(selector, "Safalta se upload ho gaya.");
    } catch {
      setStatus(selector, "Upload abhi nahi ho paaya. Kripya dobara koshish karein.", true);
    }
  });
}

const loginForm = document.querySelector("[data-farmer-login]");
if (loginForm) {
  requireFarmerSession({ allowLoginPage: true });
  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(loginForm);
    try {
      const result = await requestJson(`${authApiBase}/login`, {
        method: "POST",
        body: JSON.stringify({
          phone: formData.get("phone"),
          password: formData.get("password"),
          role: "farmer",
        }),
      });
      window.location.href = result.redirect || "/farmer-app/dashboard.html";
    } catch {
      setStatus(".fa-form-note", "Login nahi ho paaya. Mobile number aur password dobara check karein.", true);
    }
  });
}

const logoutButtons = document.querySelectorAll("[data-logout]");
logoutButtons.forEach((button) => {
  button.addEventListener("click", () => {
    logoutUser().catch(() => {
      window.location.href = "/farmer-app/";
    });
  });
});

const dailyEntryForm = document.querySelector("[data-daily-entry-form]");
if (dailyEntryForm) {
  handleFormSubmit(
    dailyEntryForm,
    `${farmerApiBase}/daily-entry`,
    "[data-daily-entry-status]",
    (formData) => ({
      entry_date: formData.get("entry_date"),
      shed: formData.get("shed"),
      opening_birds: Number(formData.get("opening_birds")),
      mortality: Number(formData.get("mortality")),
      culls: Number(formData.get("culls")),
      feed_used_bags: Number(formData.get("feed_used_bags")),
      water_liters: Number(formData.get("water_liters")),
      avg_weight_g: Number(formData.get("avg_weight_g")),
      temperature_c: Number(formData.get("temperature_c")),
      humidity_pct: Number(formData.get("humidity_pct")),
      litter_condition: formData.get("litter_condition"),
      power_cut_hours: Number(formData.get("power_cut_hours")),
      dg_hours: Number(formData.get("dg_hours")),
      uniformity_pct: Number(formData.get("uniformity_pct")),
      issues: formData.get("issues"),
      remarks: formData.get("remarks"),
    }),
    loadDailyEntry
  );
}

const feedBalanceForm = document.querySelector("[data-feed-balance-form]");
if (feedBalanceForm) {
  handleFormSubmit(
    feedBalanceForm,
    `${farmerApiBase}/feed/balance`,
    "[data-feed-balance-status]",
    (formData) => ({
      shed: formData.get("shed"),
      feed_type: formData.get("feed_type"),
      bags: Number(formData.get("bags")),
    }),
    loadFeed
  );
}

const feedInwardForm = document.querySelector("[data-feed-inward-form]");
if (feedInwardForm) {
  handleFormSubmit(
    feedInwardForm,
    `${farmerApiBase}/feed/inward`,
    "[data-feed-inward-status]",
    (formData) => ({
      inward_date: formData.get("inward_date"),
      feed_type: formData.get("feed_type"),
      bags: Number(formData.get("bags")),
      shed: formData.get("shed"),
    }),
    loadFeed
  );
}

const medicineStockForm = document.querySelector("[data-medicine-stock-form]");
if (medicineStockForm) {
  handleFormSubmit(
    medicineStockForm,
    `${farmerApiBase}/health/stock`,
    "[data-medicine-stock-status]",
    (formData) => ({
      name: formData.get("name"),
      status: formData.get("status"),
      quantity: formData.get("quantity"),
      notes: formData.get("notes"),
    }),
    loadHealth
  );
}

const medicineLogForm = document.querySelector("[data-medicine-log-form]");
if (medicineLogForm) {
  handleFormSubmit(
    medicineLogForm,
    `${farmerApiBase}/health/administer`,
    "[data-medicine-log-status]",
    (formData) => ({
      entry_date: formData.get("entry_date"),
      name: formData.get("name"),
      status: formData.get("status"),
      quantity: formData.get("quantity"),
      notes: formData.get("notes"),
    }),
    loadHealth
  );
}

const requestForm = document.querySelector("[data-farmer-request]");
if (requestForm) {
  handleFormSubmit(
    requestForm,
    `${farmerApiBase}/requests`,
    "[data-request-status]",
    (formData) => ({
      type: formData.get("type"),
      priority: formData.get("priority"),
      details: formData.get("details"),
    }),
    loadRequests
  );
}

const documentUploadForm = document.querySelector("[data-document-upload-form]");
if (documentUploadForm) {
  handleUploadSubmit(documentUploadForm, `${farmerApiBase}/documents`, "[data-document-status]", loadRequests);
}

const issuePhotoForm = document.querySelector("[data-issue-photo-form]");
if (issuePhotoForm) {
  handleUploadSubmit(issuePhotoForm, `${farmerApiBase}/issues/photo`, "[data-issue-photo-status]", loadRequests);
}

const page = document.body.dataset.faPage;
setDefaultDates();

if (page) {
  requireFarmerSession().then((user) => {
    if (!user) return;
    if (page === "dashboard") loadDashboard().catch(console.error);
    if (page === "daily-entry") loadDailyEntry().catch(console.error);
    if (page === "feed") loadFeed().catch(console.error);
    if (page === "health") loadHealth().catch(console.error);
    if (page === "requests") loadRequests().catch(console.error);
  });
}
