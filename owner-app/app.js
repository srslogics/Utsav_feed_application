const apiOrigin = window.location.protocol === "file:" ? "http://127.0.0.1:8000" : "";
const ownerApiBase = `${apiOrigin}/api/owner`;
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
  if (error?.status === 401) {
    goToOwnerLogin();
    return;
  }
  console.error(error);
}

async function loadDashboard() {
  const data = await requestJson(`${ownerApiBase}/dashboard`);
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

async function loadFarms() {
  const data = await requestJson(`${ownerApiBase}/farms`);
  populateProfile(data.profile);
  renderGrid(document.querySelector("#owner-farms-directory"), data.farms);
  renderList(document.querySelector("#owner-farms-latest-entries"), data.latest_entries);
  renderList(document.querySelector("#owner-farmer-accounts"), data.farmer_accounts || []);
  renderList(document.querySelector("#owner-field-officers"), data.field_officers || []);
  populateFarmerSelect(data.farmer_accounts || []);
  syncSelectedFarmerMeta();
}

async function loadOperations() {
  const data = await requestJson(`${ownerApiBase}/operations`);
  populateProfile(data.profile);
  renderList(document.querySelector("#owner-operations-requests"), data.requests);
  renderList(document.querySelector("#owner-operations-photos"), data.photos);
  renderList(document.querySelector("#owner-operations-visits"), data.visits);
  renderList(document.querySelector("#owner-operations-daily-entries"), data.daily_entries);
}

async function loadFinance() {
  const data = await requestJson(`${ownerApiBase}/finance`);
  populateProfile(data.profile);
  renderKpis(document.querySelector("#owner-finance-kpis"), data.kpis);
  renderList(document.querySelector("#owner-finance-documents"), data.documents);
  renderList(document.querySelector("#owner-finance-inward"), data.feed_inward);
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
  ensureOwnerPage().then((user) => {
    if (!user) return;
    if (page === "dashboard") loadDashboard().catch(handlePageError);
    if (page === "farms") loadFarms().catch(handlePageError);
    if (page === "operations" || page.startsWith("operations-")) loadOperations().catch(handlePageError);
    if (page === "finance") loadFinance().catch(handlePageError);
  });
}
