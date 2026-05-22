const apiOrigin = window.location.protocol === "file:" ? "http://127.0.0.1:8000" : "";
const farmerApiBase = `${apiOrigin}/api/farmer`;
const authApiBase = `${apiOrigin}/api/auth`;

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
    const errorBody = await response.text();
    const error = new Error(errorBody || `Request failed: ${response.status}`);
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

function populateProfile(profile) {
  if (!profile) return;
  try {
    sessionStorage.setItem("utsavFarmerProfile", JSON.stringify(profile));
  } catch {}
  document.querySelectorAll("[data-profile-name]").forEach((el) => (el.textContent = profile.farmer_name || profile.name || ""));
  document.querySelectorAll("[data-profile-cluster]").forEach((el) => (el.textContent = profile.cluster || ""));
  document.querySelectorAll("[data-profile-farm]").forEach((el) => (el.textContent = profile.farm_name || ""));
  document.querySelectorAll("[data-profile-batch]").forEach((el) => (el.textContent = profile.active_batch ? `Batch ${profile.active_batch}` : ""));
  document.querySelectorAll("[data-profile-capacity]").forEach((el) => (el.textContent = profile.farm_capacity || ""));
  document.querySelectorAll("[data-profile-officer]").forEach((el) => (el.textContent = profile.field_officer || ""));
  populateShedOptions(profile);
}

function normalizeShedLabel(value) {
  return (value || "").trim();
}

function buildShedList(profile) {
  const sheds = [];
  const activeSheds = Number(profile?.active_sheds || 0);
  for (let index = 1; index <= activeSheds; index += 1) {
    sheds.push(`Shed ${index}`);
  }
  const currentShed = normalizeShedLabel(profile?.current_shed);
  if (currentShed && !sheds.includes(currentShed)) {
    sheds.unshift(currentShed);
  }
  return sheds.length ? sheds : ["Shed 1"];
}

function populateShedOptions(profile) {
  const sheds = buildShedList(profile);
  const currentShed = normalizeShedLabel(profile?.current_shed);
  document.querySelectorAll('select[name="shed"]').forEach((select) => {
    const currentValue = select.value;
    const options = ['<option value="">Select shed</option>'].concat(
      sheds.map((shed) => `<option value="${shed}">${shed}</option>`)
    );
    select.innerHTML = options.join("");
    if (currentValue && sheds.includes(currentValue)) {
      select.value = currentValue;
    } else if (!currentValue && currentShed && sheds.includes(currentShed)) {
      select.value = currentShed;
    } else if (!currentValue && sheds.length === 1) {
      select.value = sheds[0];
    }
  });
}

function hydrateCachedProfile() {
  try {
    const cached = sessionStorage.getItem("utsavFarmerProfile");
    if (cached) populateProfile(JSON.parse(cached));
  } catch {}
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
      navigate("/farmer-app/");
      return null;
    }
    populateProfile(session.user);
    if (allowLoginPage) {
      return session.user;
    }
    return session.user;
  } catch {
    if (!allowLoginPage) {
      navigate("/farmer-app/");
    }
    return null;
  }
}

async function logoutUser() {
  await requestJson(`${authApiBase}/logout`, { method: "POST" });
  try {
    sessionStorage.removeItem("utsavFarmerProfile");
  } catch {}
  navigate("/farmer-app/");
}

function goToFarmerDashboard() {
  navigate("/farmer-app/dashboard.html");
}

function showAlreadyLoggedInAction() {
  const loginForm = document.querySelector("[data-farmer-login]");
  const note = document.querySelector(".fa-form-note");
  if (!loginForm || !note) return;
  note.textContent = "Aap pehle se login hain. Dashboard kholne ke liye neeche button dabayein.";
  note.classList.remove("is-error");
  let quickButton = document.querySelector("[data-farmer-open-dashboard]");
  if (quickButton) return;
  quickButton = document.createElement("button");
  quickButton.type = "button";
  quickButton.className = "fa-secondary-btn";
  quickButton.setAttribute("data-farmer-open-dashboard", "true");
  quickButton.textContent = "Open Dashboard";
  quickButton.addEventListener("click", goToFarmerDashboard);
  loginForm.appendChild(quickButton);
}

function handlePageError(error) {
  if (error?.status === 401) {
    try {
      sessionStorage.removeItem("utsavFarmerProfile");
    } catch {}
    navigate("/farmer-app/");
    return;
  }
  console.error(error);
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
}

async function loadUploads() {
  const data = await requestJson(`${farmerApiBase}/requests`);
  populateProfile(data.profile);
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
  requireFarmerSession({ allowLoginPage: true }).then((user) => {
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
          role: "farmer",
        }),
      });
      navigate(result.redirect || "/farmer-app/dashboard.html");
    } catch {
      setStatus(".fa-form-note", "Login nahi ho paaya. Mobile number aur password dobara check karein.", true);
    }
  });
}

const logoutButtons = document.querySelectorAll("[data-logout]");
logoutButtons.forEach((button) => {
  button.addEventListener("click", () => {
    logoutUser().catch(() => {
      navigate("/farmer-app/");
    });
  });
});

const dailyEntryForm = document.querySelector("[data-daily-entry-form]");
if (dailyEntryForm) {
  handleUploadSubmit(dailyEntryForm, `${farmerApiBase}/daily-entry`, "[data-daily-entry-status]", loadDailyEntry);
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
  handleUploadSubmit(documentUploadForm, `${farmerApiBase}/documents`, "[data-document-status]", loadUploads);
}

const issuePhotoForm = document.querySelector("[data-issue-photo-form]");
if (issuePhotoForm) {
  handleUploadSubmit(issuePhotoForm, `${farmerApiBase}/issues/photo`, "[data-issue-photo-status]", loadUploads);
}

const page = document.body.dataset.faPage;
setDefaultDates();

if (page) {
  hydrateCachedProfile();
  if (page === "dashboard") loadDashboard().catch(handlePageError);
  if (page === "daily-entry") loadDailyEntry().catch(handlePageError);
  if (page === "feed") loadFeed().catch(handlePageError);
  if (page === "health") loadHealth().catch(handlePageError);
  if (page === "requests") loadRequests().catch(handlePageError);
  if (page === "uploads") loadUploads().catch(handlePageError);
}
