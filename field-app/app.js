const apiOrigin = window.location.protocol === "file:" ? "http://127.0.0.1:8000" : "";
const fieldApiBase = `${apiOrigin}/api/field`;
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
    throw new Error(await response.text());
  }
  return response.json();
}

function setStatus(selector, message, isError = false) {
  const element = document.querySelector(selector);
  if (!element) return;
  element.textContent = message;
  element.classList.toggle("is-error", isError);
}

function setDefaultDates() {
  const today = new Date().toISOString().slice(0, 10);
  document.querySelectorAll('input[type="date"]').forEach((input) => {
    if (!input.value) input.value = today;
  });
}

function populateProfile(profile) {
  document.querySelectorAll("[data-field-name]").forEach((el) => (el.textContent = profile.name || ""));
  document.querySelectorAll("[data-field-cluster]").forEach((el) => (el.textContent = profile.cluster || ""));
  document.querySelectorAll("[data-field-title]").forEach((el) => (el.textContent = profile.title || "Field Officer"));
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

async function requireFieldSession({ allowLoginPage = false } = {}) {
  try {
    const session = await requestJson(`${authApiBase}/session`);
    if (session.role !== "field") {
      window.location.href = "/field-app/";
      return null;
    }
    populateProfile(session.user);
    if (allowLoginPage) {
      window.location.href = "/field-app/dashboard.html";
      return null;
    }
    return session.user;
  } catch {
    if (!allowLoginPage) {
      window.location.href = "/field-app/";
    }
    return null;
  }
}

async function loadDashboard() {
  const data = await requestJson(`${fieldApiBase}/dashboard`);
  populateProfile(data.profile);
  renderKpis(document.querySelector("#field-kpis"), data.kpis);
  renderGrid(document.querySelector("#field-farms"), data.assigned_farms);
  renderList(document.querySelector("#field-priority"), data.priority_issues);
  renderList(document.querySelector("#field-visit-history"), data.visit_history);
}

async function loadVisits() {
  const data = await requestJson(`${fieldApiBase}/visits`);
  populateProfile(data.profile);
  const select = document.querySelector("[data-field-farm-select]");
  if (select) {
    select.innerHTML = `<option value="">Select farm</option>${data.farms
      .map((farm) => `<option value="${farm.code}">${farm.name} (${farm.code})</option>`)
      .join("")}`;
  }
  renderList(document.querySelector("#field-visits-history"), data.visit_history);
}

async function loadIssues() {
  const data = await requestJson(`${fieldApiBase}/issues`);
  populateProfile(data.profile);
  renderList(document.querySelector("#field-requests"), data.requests);
  renderList(document.querySelector("#field-photos"), data.photos);
}

const loginForm = document.querySelector("[data-field-login]");
if (loginForm) {
  requireFieldSession({ allowLoginPage: true });
  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(loginForm);
    try {
      const result = await requestJson(`${authApiBase}/login`, {
        method: "POST",
        body: JSON.stringify({
          phone: formData.get("phone"),
          password: formData.get("password"),
          role: "field",
        }),
      });
      window.location.href = result.redirect || "/field-app/dashboard.html";
    } catch {
      setStatus(".fa-form-note", "Login nahi ho paaya. Credentials dobara check karein.", true);
    }
  });
}

const visitForm = document.querySelector("[data-field-visit-form]");
if (visitForm) {
  visitForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(visitForm);
    try {
      await requestJson(`${fieldApiBase}/visits`, {
        method: "POST",
        body: JSON.stringify({
          farmer_code: formData.get("farmer_code"),
          visit_date: formData.get("visit_date"),
          shed: formData.get("shed"),
          avg_weight_g: Number(formData.get("avg_weight_g")),
          mortality: Number(formData.get("mortality")),
          feed_stock_note: formData.get("feed_stock_note"),
          medicine_note: formData.get("medicine_note"),
          issue_summary: formData.get("issue_summary"),
          action_taken: formData.get("action_taken"),
        }),
      });
      visitForm.reset();
      setDefaultDates();
      await loadVisits();
      setStatus("[data-field-visit-status]", "Visit safalta se save ho gaya.");
    } catch {
      setStatus("[data-field-visit-status]", "Visit abhi save nahi ho paaya.", true);
    }
  });
}

document.querySelectorAll("[data-field-logout]").forEach((button) => {
  button.addEventListener("click", async () => {
    await requestJson(`${authApiBase}/logout`, { method: "POST" });
    window.location.href = "/field-app/";
  });
});

const page = document.body.dataset.fieldPage;
setDefaultDates();
if (page) {
  requireFieldSession().then((user) => {
    if (!user) return;
    if (page === "dashboard") loadDashboard().catch(console.error);
    if (page === "visits") loadVisits().catch(console.error);
    if (page === "issues") loadIssues().catch(console.error);
  });
}
