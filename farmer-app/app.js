const apiOrigin = window.location.protocol === "file:" ? "http://127.0.0.1:8000" : "";
const farmerApiBase = `${apiOrigin}/api/farmer`;
const authApiBase = `${apiOrigin}/api/auth`;
const farmerCachePrefix = "utsavFarmerPage:";
let farmerAuthRecoveryPromise = null;

if ("serviceWorker" in navigator && window.location.protocol !== "file:") {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/farmer-app/sw.js", { scope: "/farmer-app/" }).catch(() => {});
  });
}

function navigate(url) {
  if (window.location.pathname === url) return;
  window.location.replace(url);
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, {
    credentials: "include",
    headers: {
      "X-Utsav-Role": "farmer",
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
    sessionStorage.setItem(`${farmerCachePrefix}${key}`, JSON.stringify(value));
  } catch {}
}

function readCache(key) {
  try {
    const raw = sessionStorage.getItem(`${farmerCachePrefix}${key}`);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
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
  document.querySelectorAll("[data-profile-sheds]").forEach((el) => (el.textContent = profile.active_sheds ? `${profile.active_sheds} sheds` : ""));
  document.querySelectorAll("[data-profile-current-shed]").forEach((el) => (el.textContent = profile.current_shed || ""));
  const profileForm = document.querySelector("[data-farmer-profile-form]");
  if (profileForm) {
    const setValue = (name, value) => {
      const input = profileForm.querySelector(`[name="${name}"]`);
      if (input) input.value = value ?? "";
    };
    setValue("farmer_name", profile.farmer_name || profile.name || "");
    setValue("phone", profile.phone || "");
    setValue("cluster", profile.cluster || "");
    setValue("farm_name", profile.farm_name || "");
    setValue("field_officer", profile.field_officer || "");
    setValue("farm_capacity", profile.farm_capacity || "");
    setValue("active_sheds", profile.active_sheds || 1);
  }
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

function applyShedDefault(entryData) {
  const shedSelect = document.querySelector('[data-daily-entry-form] select[name="shed"]');
  const openingInput = document.querySelector('[data-daily-entry-form] input[name="opening_birds"]');
  const note = document.querySelector("[data-opening-birds-note]");
  if (!shedSelect || !openingInput || !note) return;
  const selectedShed = shedSelect.value;
  const defaults = entryData?.shed_defaults || [];
  const matched = defaults.find((item) => item.shed === selectedShed);
  if (matched) {
    openingInput.value = matched.live_birds;
    note.textContent = `${selectedShed} ka live bird count ${matched.entry_date} ki pichhli entry se auto-filled hai. Zarurat ho to badal sakte hain.`;
  } else if (selectedShed) {
    openingInput.value = "";
    note.textContent = `${selectedShed} ke liye pehli entry lag rahi hai. Yahan current live bird count daalein.`;
  } else {
    openingInput.value = "";
    note.textContent = "";
  }
}

function renderOutsideWeather(weather) {
  const container = document.querySelector("[data-outside-weather]");
  if (!container) return;
  if (!weather) {
    container.hidden = true;
    return;
  }

  container.hidden = false;
  const locationEl = container.querySelector("[data-weather-location]");
  const noteEl = container.querySelector("[data-weather-note]");
  const tempEl = container.querySelector("[data-weather-temperature]");
  const humidityEl = container.querySelector("[data-weather-humidity]");
  const timeEl = container.querySelector("[data-weather-time]");
  const tempRangeEl = container.querySelector("[data-weather-temp-range]");
  const humidityRangeEl = container.querySelector("[data-weather-humidity-range]");

  if (locationEl) locationEl.textContent = weather.location_label || "";
  if (noteEl) noteEl.textContent = weather.source_note || "";
  if (tempEl) tempEl.textContent = `${weather.temperature_c} C`;
  if (humidityEl) humidityEl.textContent = `${weather.humidity_pct}%`;
  if (timeEl) timeEl.textContent = weather.observed_at ? `Updated ${weather.observed_at}` : "Latest outside reading";
  if (tempRangeEl) {
    tempRangeEl.textContent =
      weather.temperature_high_c != null && weather.temperature_low_c != null
        ? `${weather.temperature_high_c} C / ${weather.temperature_low_c} C`
        : "-";
  }
  if (humidityRangeEl) {
    humidityRangeEl.textContent =
      weather.humidity_high_pct != null && weather.humidity_low_pct != null
        ? `${weather.humidity_high_pct}% / ${weather.humidity_low_pct}%`
        : "-";
  }

  const tempInput = document.querySelector('[data-daily-entry-form] input[name="temperature_c"]');
  const humidityInput = document.querySelector('[data-daily-entry-form] input[name="humidity_pct"]');
  if (tempInput && !tempInput.value) tempInput.value = weather.temperature_c;
  if (humidityInput && !humidityInput.value) humidityInput.value = weather.humidity_pct;
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

function formatBagCount(value) {
  const numeric = Number(value ?? 0);
  if (Number.isNaN(numeric)) return value ?? "0";
  return Number.isInteger(numeric) ? String(numeric) : numeric.toFixed(2).replace(/\.?0+$/, "");
}

function splitFeedUsage(totalBags) {
  const numeric = Math.max(Number(totalBags ?? 0), 0);
  const fullBags = Math.floor(numeric);
  const extraKg = (numeric - fullBags) * 50;
  return {
    fullBags,
    extraKg: Number(extraKg.toFixed(2)),
  };
}

function composeFeedUsageBags(form) {
  const fullBagsInput = form.querySelector('input[name="feed_used_full_bags"]');
  const extraKgInput = form.querySelector('input[name="feed_used_extra_kg"]');
  const hiddenInput = form.querySelector('input[name="feed_used_bags"]');
  if (!hiddenInput) return { ok: true, bags: 0 };
  const fullBags = Math.max(Number(fullBagsInput?.value || 0), 0);
  const extraKg = Math.max(Number(extraKgInput?.value || 0), 0);
  if (extraKg >= 50) {
    return { ok: false, message: "Khule bag se extra feed 50 kg se kam hona chahiye." };
  }
  const totalBags = Number((fullBags + extraKg / 50).toFixed(4));
  hiddenInput.value = String(totalBags);
  return { ok: true, bags: totalBags };
}

function renderDailyEntryRecords(container, records) {
  if (!container) return;
  if (!records?.length) {
    container.innerHTML = `<div class="fa-empty-state">Abhi koi record available nahi hai.</div>`;
    return;
  }
  container.innerHTML = records
    .map(
      (record) => `
        <div class="fa-list-row">
          <div>
            <span>${record.entry_date} / ${record.shed}</span>
            <p>Mortality ${record.mortality} • Feed ${record.feed_used_label || `${formatBagCount(record.feed_used_bags)} bags`} • Litter ${record.litter_condition}</p>
          </div>
          <div class="fa-form-actions">
            <strong>${record.avg_weight_g} g</strong>
            ${
              record.can_edit_today
                ? `<button class="fa-secondary-btn" type="button" data-edit-daily-entry="${record.id}">Edit</button>`
                : `<span class="fa-muted-inline">Read only</span>`
            }
          </div>
        </div>
      `
    )
    .join("");
}

function renderDashboardData(data) {
  if (!data) return;
  populateProfile(data.profile);
  const dashboardKpis = (data.kpis || []).filter((item) =>
    ["Bird age", "Live birds", "Mortality", "Feed balance"].includes(item.label)
  );
  const latestEntry = (data.latest_daily_entry || []).filter((item) =>
    ["Date", "Shed", "Feed used", "Water"].includes(item.label)
  );
  renderKpis(document.querySelector("#dashboard-kpis"), dashboardKpis);
  renderKeyValueGrid(document.querySelector("#dashboard-latest-entry"), latestEntry);
}

function renderNotificationsData(data) {
  if (!data) return;
  populateProfile(data.profile);
  renderList(document.querySelector("#notifications-tasks"), data.tasks || []);
  renderList(document.querySelector("#notifications-alerts"), data.owner_alerts || []);
}

function renderProfilePageData(data) {
  if (!data) return;
  populateProfile(data.profile);
}

function renderMetricsPageData(data) {
  if (!data) return;
  populateProfile(data.profile);
  renderKpis(document.querySelector("#metrics-performance"), data.performance_metrics || []);
  renderList(document.querySelector("#metrics-mortality-log"), data.mortality_history || []);
}

function renderDailyEntryData(data) {
  if (!data) return;
  populateProfile(data.profile);
  renderOutsideWeather(data.outside_weather);
  renderDailyEntryRecords(document.querySelector("#daily-entry-history"), data.entry_records);
  renderList(document.querySelector("#daily-vaccine-history"), data.vaccine_history);
  const shedSelect = document.querySelector('[data-daily-entry-form] select[name="shed"]');
  if (shedSelect && !shedSelect.dataset.boundDefault) {
    shedSelect.addEventListener("change", () => applyShedDefault(data));
    shedSelect.dataset.boundDefault = "true";
  }
  applyShedDefault(data);
  const history = document.querySelector("#daily-entry-history");
  if (history && !history.dataset.boundEdit) {
    history.addEventListener("click", (event) => {
      const button = event.target.closest("[data-edit-daily-entry]");
      if (!button) return;
      const entryId = Number(button.getAttribute("data-edit-daily-entry"));
      const match = (data.entry_records || []).find((item) => item.id === entryId);
      if (!match) return;
      const form = document.querySelector("[data-daily-entry-form]");
      if (!form) return;
      form.querySelector('input[name="editing_entry_id"]').value = match.id;
      form.querySelector('input[name="entry_date"]').value = match.entry_date;
      form.querySelector('select[name="shed"]').value = match.shed;
      form.querySelector('input[name="opening_birds"]').value = match.opening_birds;
      form.querySelector('input[name="mortality"]').value = match.mortality;
      form.querySelector('input[name="culls"]').value = match.culls;
      const feedUsage = splitFeedUsage(match.feed_used_bags);
      form.querySelector('input[name="feed_used_full_bags"]').value = feedUsage.fullBags;
      form.querySelector('input[name="feed_used_extra_kg"]').value = formatBagCount(feedUsage.extraKg);
      form.querySelector('input[name="feed_used_bags"]').value = formatBagCount(match.feed_used_bags);
      form.querySelector('input[name="water_liters"]').value = match.water_liters;
      form.querySelector('input[name="avg_weight_g"]').value = match.avg_weight_g;
      form.querySelector('input[name="temperature_c"]').value = match.temperature_c;
      form.querySelector('input[name="humidity_pct"]').value = match.humidity_pct;
      form.querySelector('select[name="litter_condition"]').value = match.litter_condition;
      form.querySelector('textarea[name="litter_notes"]').value = match.litter_notes || "";
      form.querySelector('input[name="power_cut_hours"]').value = match.power_cut_hours;
      form.querySelector('input[name="dg_hours"]').value = match.dg_hours;
      form.querySelector('input[name="uniformity_pct"]').value = match.uniformity_pct;
      form.querySelector('input[name="issues"]').value = match.issues || "";
      form.querySelector('textarea[name="remarks"]').value = match.remarks || "";
      const submitBtn = form.querySelector("[data-daily-submit-btn]");
      const cancelBtn = form.querySelector("[data-daily-cancel-edit]");
      if (submitBtn) submitBtn.textContent = "Entry update karein";
      if (cancelBtn) cancelBtn.hidden = false;
      setStatus("[data-daily-entry-status]", `${match.entry_date} / ${match.shed} edit mode mein hai.`);
      form.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    history.dataset.boundEdit = "true";
  }
}

function renderFeedData(data) {
  if (!data) return;
  populateProfile(data.profile);
  renderKeyValueGrid(document.querySelector("#feed-balance"), data.shed_balances);
  renderList(document.querySelector("#feed-history"), data.inward_history);
}

function renderHealthData(data) {
  if (!data) return;
  populateProfile(data.profile);
  renderKeyValueGrid(document.querySelector("#health-summary"), data.summary);
  renderList(document.querySelector("#health-log"), data.log);
  renderList(document.querySelector("#health-vaccines"), data.vaccines);
}

function renderRequestsData(data) {
  if (!data) return;
  populateProfile(data.profile);
  renderList(document.querySelector("#request-history"), data.history);
}

function renderUploadsData(data) {
  if (!data) return;
  populateProfile(data.profile);
  renderList(document.querySelector("#operational-cost-history"), data.operational_costs || []);
  renderList(document.querySelector("#sales-history"), data.sales || []);
  renderList(document.querySelector("#document-history"), data.documents);
  renderList(document.querySelector("#issue-photo-history"), data.issue_photos);
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
  if (error?.status === 401 || error?.status === 403) {
    recoverFarmerSession();
    return;
  }
  console.error(error);
}

async function recoverFarmerSession() {
  if (farmerAuthRecoveryPromise) return farmerAuthRecoveryPromise;
  showSessionBanner("Session check ho raha hai. Thoda wait karein.");
  farmerAuthRecoveryPromise = (async () => {
    try {
      const session = await requestJson(`${authApiBase}/session`);
      if (session.role === "farmer") {
        populateProfile(session.user);
        hideSessionBanner();
        return true;
      }
    } catch {}
    showSessionBanner("Session expire ho gaya hai. Dobara login karein.", true);
    try {
      sessionStorage.removeItem("utsavFarmerProfile");
    } catch {}
    window.setTimeout(() => navigate("/farmer-app/"), 1200);
    return false;
  })();
  try {
    return await farmerAuthRecoveryPromise;
  } finally {
    farmerAuthRecoveryPromise = null;
  }
}

function resetDailyEntryFormState() {
  const form = document.querySelector("[data-daily-entry-form]");
  if (!form) return;
  const editingInput = form.querySelector('input[name="editing_entry_id"]');
  const submitBtn = form.querySelector("[data-daily-submit-btn]");
  const cancelBtn = form.querySelector("[data-daily-cancel-edit]");
  if (editingInput) editingInput.value = "";
  if (submitBtn) submitBtn.textContent = "Aaj ki report bhejein";
  if (cancelBtn) cancelBtn.hidden = true;
}

function resetDailyEntryInputsForNewDate() {
  const form = document.querySelector("[data-daily-entry-form]");
  if (!form) return;
  const preservedDate = form.querySelector('input[name="entry_date"]')?.value || "";
  const preservedTemp = form.querySelector('input[name="temperature_c"]')?.value || "";
  const preservedHumidity = form.querySelector('input[name="humidity_pct"]')?.value || "";

  form.reset();
  resetDailyEntryFormState();

  const dateInput = form.querySelector('input[name="entry_date"]');
  if (dateInput) dateInput.value = preservedDate;

  const tempInput = form.querySelector('input[name="temperature_c"]');
  if (tempInput) tempInput.value = preservedTemp;

  const humidityInput = form.querySelector('input[name="humidity_pct"]');
  if (humidityInput) humidityInput.value = preservedHumidity;

  const openingBirdsNote = document.querySelector("[data-opening-birds-note]");
  if (openingBirdsNote) openingBirdsNote.textContent = "";

  setStatus("[data-daily-entry-status]", "");
}

async function loadDashboard() {
  const data = await requestJson(`${farmerApiBase}/dashboard`);
  writeCache("dashboard", data);
  renderDashboardData(data);
}

async function loadDailyEntry() {
  const data = await requestJson(`${farmerApiBase}/daily-entry`);
  writeCache("daily-entry", data);
  renderDailyEntryData(data);
}

async function loadFeed() {
  const data = await requestJson(`${farmerApiBase}/feed`);
  writeCache("feed", data);
  renderFeedData(data);
}

async function loadHealth() {
  const data = await requestJson(`${farmerApiBase}/health`);
  writeCache("health", data);
  renderHealthData(data);
}

async function loadRequests() {
  const data = await requestJson(`${farmerApiBase}/requests`);
  writeCache("requests", data);
  renderRequestsData(data);
}

async function loadUploads() {
  const data = await requestJson(`${farmerApiBase}/requests`);
  writeCache("uploads", data);
  renderUploadsData(data);
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
    const uploadCategory = formData.get("upload_category");
    const currentDocType = formData.get("doc_type");
    if (uploadCategory && currentDocType) {
      formData.set("doc_type", `${uploadCategory} / ${currentDocType}`);
    }
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
  const cancelEditButton = dailyEntryForm.querySelector("[data-daily-cancel-edit]");
  const dateInput = dailyEntryForm.querySelector('input[name="entry_date"]');

  cancelEditButton?.addEventListener("click", () => {
    dailyEntryForm.reset();
    setDefaultDates();
    resetDailyEntryFormState();
    setStatus("[data-daily-entry-status]", "");
  });

  dateInput?.addEventListener("change", () => {
    resetDailyEntryInputsForNewDate();
  });

  dailyEntryForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const feedUsage = composeFeedUsageBags(dailyEntryForm);
    if (!feedUsage.ok) {
      setStatus("[data-daily-entry-status]", feedUsage.message, true);
      return;
    }
    const formData = new FormData(dailyEntryForm);
    const editingEntryId = formData.get("editing_entry_id");
    try {
      await requestJson(editingEntryId ? `${farmerApiBase}/daily-entry/${editingEntryId}` : `${farmerApiBase}/daily-entry`, {
        method: editingEntryId ? "PUT" : "POST",
        body: formData,
      });
      dailyEntryForm.reset();
      setDefaultDates();
      resetDailyEntryFormState();
      await loadDailyEntry();
      setStatus("[data-daily-entry-status]", editingEntryId ? "Daily entry update ho gayi." : "Safalta se save ho gaya.");
    } catch {
      setStatus("[data-daily-entry-status]", editingEntryId ? "Daily entry update nahi ho paayi. Dobara koshish karein." : "Abhi save nahi ho paaya. Kripya dobara koshish karein.", true);
    }
  });
}

const farmerProfileForm = document.querySelector("[data-farmer-profile-form]");
if (farmerProfileForm) {
  farmerProfileForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(farmerProfileForm);
    const payload = {
      farmer_name: formData.get("farmer_name"),
      phone: formData.get("phone"),
      password: formData.get("password"),
      cluster: formData.get("cluster"),
      farm_name: formData.get("farm_name"),
      field_officer: formData.get("field_officer"),
      farm_capacity: formData.get("farm_capacity"),
      active_sheds: Number(formData.get("active_sheds") || 1),
    };
    try {
      const result = await requestJson(`${farmerApiBase}/profile`, {
        method: "PUT",
        body: JSON.stringify(payload),
      });
      populateProfile(result.profile);
      const passwordInput = farmerProfileForm.querySelector('input[name="password"]');
      if (passwordInput) passwordInput.value = "";
      setStatus("[data-farmer-profile-status]", "Details safalta se update ho gaye.");
      loadDashboard().catch(handlePageError);
    } catch {
      setStatus("[data-farmer-profile-status]", "Details update nahi ho paaye. Dobara check karein.", true);
    }
  });
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

const operationalCostForm = document.querySelector("[data-operational-cost-form]");
if (operationalCostForm) {
  handleUploadSubmit(operationalCostForm, `${farmerApiBase}/operational-costs`, "[data-operational-cost-status]", loadUploads);
}

const saleRecordForm = document.querySelector("[data-sale-record-form]");
if (saleRecordForm) {
  handleUploadSubmit(saleRecordForm, `${farmerApiBase}/sales`, "[data-sale-record-status]", loadUploads);
}

const issuePhotoForm = document.querySelector("[data-issue-photo-form]");
if (issuePhotoForm) {
  handleUploadSubmit(issuePhotoForm, `${farmerApiBase}/issues/photo`, "[data-issue-photo-status]", loadUploads);
}

const page = document.body.dataset.faPage;
setDefaultDates();

if (page) {
  hydrateCachedProfile();
  if (page === "dashboard") {
    renderDashboardData(readCache("dashboard"));
    loadDashboard().catch(handlePageError);
  }
  if (page === "notifications") {
    renderNotificationsData(readCache("dashboard"));
    loadDashboard()
      .then(() => renderNotificationsData(readCache("dashboard")))
      .catch(handlePageError);
  }
  if (page === "profile") {
    renderProfilePageData(readCache("dashboard"));
    loadDashboard()
      .then(() => renderProfilePageData(readCache("dashboard")))
      .catch(handlePageError);
  }
  if (page === "metrics") {
    renderMetricsPageData(readCache("dashboard"));
    loadDashboard()
      .then(() => renderMetricsPageData(readCache("dashboard")))
      .catch(handlePageError);
  }
  if (page === "daily-entry") {
    renderDailyEntryData(readCache("daily-entry"));
    loadDailyEntry().catch(handlePageError);
  }
  if (page === "feed") {
    renderFeedData(readCache("feed"));
    loadFeed().catch(handlePageError);
  }
  if (page === "health") {
    renderHealthData(readCache("health"));
    loadHealth().catch(handlePageError);
  }
  if (page === "requests") {
    renderRequestsData(readCache("requests"));
    loadRequests().catch(handlePageError);
  }
  if (page === "uploads") {
    renderUploadsData(readCache("uploads"));
    loadUploads().catch(handlePageError);
  }
}
