const apiOrigin = window.location.protocol === "file:" ? "http://127.0.0.1:8000" : "";
const ownerApiBase = `${apiOrigin}/api/owner`;
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

function populateProfile(profile) {
  document.querySelectorAll("[data-owner-name]").forEach((el) => (el.textContent = profile.name || ""));
  document.querySelectorAll("[data-owner-title]").forEach((el) => (el.textContent = profile.title || "Owner"));
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

async function requireOwnerSession({ allowLoginPage = false } = {}) {
  try {
    const session = await requestJson(`${authApiBase}/session`);
    if (session.role !== "owner") {
      window.location.href = "/owner-app/";
      return null;
    }
    populateProfile(session.user);
    if (allowLoginPage) {
      window.location.href = "/owner-app/dashboard.html";
      return null;
    }
    return session.user;
  } catch {
    if (!allowLoginPage) {
      window.location.href = "/owner-app/";
    }
    return null;
  }
}

async function loadDashboard() {
  const data = await requestJson(`${ownerApiBase}/dashboard`);
  populateProfile(data.profile);
  renderKpis(document.querySelector("#owner-kpis"), data.kpis);
  renderGrid(document.querySelector("#owner-farms"), data.farms);
  renderList(document.querySelector("#owner-priority"), data.priority);
  renderList(document.querySelector("#owner-field-activity"), data.field_activity);
  renderList(document.querySelector("#owner-uploads"), data.uploads);
}

async function loadFarms() {
  const data = await requestJson(`${ownerApiBase}/farms`);
  populateProfile(data.profile);
  renderGrid(document.querySelector("#owner-farms-directory"), data.farms);
}

async function loadOperations() {
  const data = await requestJson(`${ownerApiBase}/operations`);
  populateProfile(data.profile);
  renderList(document.querySelector("#owner-operations-requests"), data.requests);
  renderList(document.querySelector("#owner-operations-photos"), data.photos);
  renderList(document.querySelector("#owner-operations-visits"), data.visits);
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
  requireOwnerSession({ allowLoginPage: true });
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
      window.location.href = result.redirect || "/owner-app/dashboard.html";
    } catch {
      setStatus(".fa-form-note", "Login nahi ho paaya. Owner credentials dobara check karein.", true);
    }
  });
}

document.querySelectorAll("[data-owner-logout]").forEach((button) => {
  button.addEventListener("click", async () => {
    await requestJson(`${authApiBase}/logout`, { method: "POST" });
    window.location.href = "/owner-app/";
  });
});

const page = document.body.dataset.ownerPage;
if (page) {
  requireOwnerSession().then((user) => {
    if (!user) return;
    if (page === "dashboard") loadDashboard().catch(console.error);
    if (page === "farms") loadFarms().catch(console.error);
    if (page === "operations") loadOperations().catch(console.error);
    if (page === "finance") loadFinance().catch(console.error);
  });
}
