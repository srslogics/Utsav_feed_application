const apiOrigin =
  window.location.protocol === "file:"
    ? "http://127.0.0.1:8000"
    : "";

const farmerApiBase = `${apiOrigin}/api/farmer`;

async function readJson(path, options = {}) {
  const response = await fetch(`${farmerApiBase}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    ...options,
  });

  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }
  return response.json();
}

function setStatus(selector, message, isError = false) {
  const element = document.querySelector(selector);
  if (!element) {
    return;
  }
  element.textContent = message;
  element.classList.toggle("is-error", isError);
}

function renderKpis(container, items) {
  container.innerHTML = items
    .map(
      (item) => `
        <article class="fa-kpi-card">
          <span>${item.label}</span>
          <strong>${item.value}</strong>
          <p>${item.note}</p>
        </article>
      `
    )
    .join("");
}

function renderKeyValueGrid(container, items) {
  container.innerHTML = items
    .map(
      (item) => `
        <article class="fa-detail-card">
          <span>${item.label}</span>
          <strong>${item.value}</strong>
          <p>${item.note}</p>
        </article>
      `
    )
    .join("");
}

function renderList(container, items) {
  if (!items.length) {
    container.innerHTML = `<div class="fa-empty-state">No records available yet.</div>`;
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

async function loadDashboard() {
  const data = await readJson("/dashboard");
  renderKpis(document.querySelector("#dashboard-kpis"), data.kpis);
  renderKpis(document.querySelector("#dashboard-performance"), data.performance_metrics);
  renderKeyValueGrid(document.querySelector("#dashboard-batch"), data.batch_summary);
  renderList(document.querySelector("#dashboard-tasks"), data.tasks);
  renderList(document.querySelector("#dashboard-mortality-log"), data.mortality_history);
  renderList(document.querySelector("#dashboard-alerts"), data.owner_alerts);
  renderKeyValueGrid(document.querySelector("#dashboard-latest-entry"), data.latest_daily_entry);
}

async function loadFeed() {
  const data = await readJson("/feed");
  renderKeyValueGrid(document.querySelector("#feed-balance"), data.shed_balances);
  renderList(document.querySelector("#feed-history"), data.inward_history);
}

async function loadHealth() {
  const data = await readJson("/health");
  renderKeyValueGrid(document.querySelector("#health-summary"), data.summary);
  renderList(document.querySelector("#health-log"), data.log);
  renderList(document.querySelector("#health-vaccines"), data.vaccines);
}

async function loadRequests() {
  const data = await readJson("/requests");
  renderList(document.querySelector("#request-history"), data.history);
  renderList(document.querySelector("#document-history"), data.documents);
}

async function loadDailyEntry() {
  const data = await readJson("/daily-entry");
  renderList(document.querySelector("#daily-entry-history"), data.entry_history);
  renderList(document.querySelector("#daily-vaccine-history"), data.vaccine_history);
}

const loginForm = document.querySelector("[data-farmer-login]");
if (loginForm) {
  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(loginForm);
    try {
      await readJson("/login", {
        method: "POST",
        body: JSON.stringify({
          phone: formData.get("phone"),
          password: formData.get("password"),
        }),
      });
      window.location.href = "./dashboard.html";
    } catch (error) {
      setStatus(".fa-form-note", "Login nahi ho paaya. Kripya mobile number aur password check karein.", true);
    }
  });
}

async function handleFormSubmit(form, path, selector, makePayload, afterSuccess) {
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(form);
    try {
      await readJson(path, {
        method: "POST",
        body: JSON.stringify(makePayload(formData)),
      });
      form.reset();
      if (afterSuccess) {
        await afterSuccess();
      }
      setStatus(selector, "Safalta se save ho gaya.");
    } catch (error) {
      setStatus(selector, "Abhi save nahi ho paaya. Kripya dobara koshish karein.", true);
    }
  });
}

async function handleUploadSubmit(form, path, selector, afterSuccess) {
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(form);
    try {
      const response = await fetch(`${farmerApiBase}${path}`, {
        method: "POST",
        body: formData,
      });
      if (!response.ok) {
        throw new Error(`Request failed: ${response.status}`);
      }
      form.reset();
      if (afterSuccess) {
        await afterSuccess();
      }
      setStatus(selector, "Document safalta se upload ho gaya.");
    } catch (error) {
      setStatus(selector, "Abhi document upload nahi ho paaya. Kripya dobara koshish karein.", true);
    }
  });
}

const dailyEntryForm = document.querySelector("[data-daily-entry-form]");
if (dailyEntryForm) {
  handleFormSubmit(
    dailyEntryForm,
    "/daily-entry",
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
    "/feed/balance",
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
    "/feed/inward",
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
    "/health/stock",
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
    "/health/administer",
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
    "/requests",
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
  handleUploadSubmit(
    documentUploadForm,
    "/documents",
    "[data-document-status]",
    loadRequests
  );
}

const page = document.body.dataset.faPage;
if (page === "dashboard") {
  loadDashboard().catch(console.error);
} else if (page === "daily-entry") {
  loadDailyEntry().catch(console.error);
} else if (page === "feed") {
  loadFeed().catch(console.error);
} else if (page === "health") {
  loadHealth().catch(console.error);
} else if (page === "requests") {
  loadRequests().catch(console.error);
}
