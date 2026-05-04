const DEFAULT_API_BASE = "https://api.skynity.org";
const DEFAULT_ORG_ID = "212d7393-7375-4321-93f5-4789deb8b317";
const DEFAULT_BRAND = "SKYNITY";

const qs = new URLSearchParams(window.location.search);
const API_BASE = (qs.get("api") || localStorage.getItem("hotspot_api_base") || DEFAULT_API_BASE).replace(/\/$/, "");
const ORG_ID = qs.get("org") || localStorage.getItem("hotspot_org_id") || DEFAULT_ORG_ID;
const LOGIN_URL = qs.get("loginUrl") || qs.get("link-login-only") || "/login";
const BRAND_NAME = qs.get("brand") || localStorage.getItem("hotspot_brand") || DEFAULT_BRAND;
const BRAND_LOGO = qs.get("logo") || localStorage.getItem("hotspot_logo") || "";

const state = {
  packages: [],
  selectedPackage: null,
  selectedMethod: "bkash",
  customer: null,
  orderId: null,
  pollTimer: null,
};

const $ = (selector) => document.querySelector(selector);
const screens = [...document.querySelectorAll("[data-screen]")];

function showScreen(name) {
  screens.forEach((screen) => screen.classList.toggle("hidden", screen.dataset.screen !== name));
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function toast(message, type = "info") {
  const node = $("#toast");
  node.textContent = message;
  node.className = `toast show ${type === "error" ? "error" : ""}`;
  setTimeout(() => node.classList.remove("show"), 3200);
}

function setLoading(form, loading) {
  [...form.querySelectorAll("button, input")].forEach((el) => {
    el.disabled = loading;
  });
}

function setFieldError(name, message) {
  const input = document.querySelector(`[name="${name}"]`);
  const error = document.querySelector(`[data-error-for="${name}"]`);
  if (input) input.classList.toggle("invalid", Boolean(message));
  if (error) error.textContent = message || "";
  return !message;
}

function isPhone(value) {
  return /^01[0-9]{9}$/.test(value);
}

function isSafeUrl(value) {
  if (!value) return false;
  try {
    const url = new URL(value, window.location.origin);
    return ["http:", "https:"].includes(url.protocol);
  } catch {
    return false;
  }
}

function trpcGet(path, input) {
  const url = `${API_BASE}/api/trpc/${path}?input=${encodeURIComponent(JSON.stringify({ json: input }))}`;
  return fetch(url, { headers: { Accept: "application/json" } }).then(parseTrpc);
}

function trpcPost(path, input) {
  return fetch(`${API_BASE}/api/trpc/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ json: input }),
  }).then(parseTrpc);
}

async function parseTrpc(response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.error) {
    throw new Error(data.error?.json?.message || data.error?.message || "Request failed");
  }
  return data.result?.data?.json;
}

function money(value) {
  return `৳${Number(value || 0).toLocaleString("en-BD")}`;
}

function formatOrderId(id) {
  return String(id || "").slice(0, 8).toUpperCase();
}

function renderPackages() {
  const host = $("#packages");
  if (!state.packages.length) {
    host.innerHTML = `<div class="package-card"><div class="package-name">No active packages</div><div class="package-meta">Please contact support.</div></div>`;
    return;
  }

  host.innerHTML = state.packages.map((pkg) => `
    <button class="package-card" type="button" data-package-id="${pkg.id}" aria-label="Select ${escapeHtml(pkg.name)} package">
      <div class="package-top">
        <div>
          <div class="package-name">${escapeHtml(pkg.name)}</div>
          <div class="package-meta">${pkg.downloadMbps} Mbps down · ${pkg.uploadMbps} Mbps up</div>
        </div>
        <div class="package-price">${money(pkg.priceBdt)}</div>
      </div>
      <div class="package-meta">
        <span>${pkg.validityDays || 30} days validity</span>
        ${pkg.isTrial ? `<span class="badge">Trial</span>` : `<span>${escapeHtml(pkg.type || "internet")}</span>`}
      </div>
    </button>
  `).join("");

  host.querySelectorAll("[data-package-id]").forEach((card) => {
    card.addEventListener("click", () => selectPackage(card.dataset.packageId, false));
  });
}

function escapeHtml(value) {
  const div = document.createElement("div");
  div.textContent = String(value ?? "");
  return div.innerHTML;
}

async function loadPackages() {
  $("#packages").innerHTML = `<div class="package-card loading"><div class="package-name">Loading packages...</div></div>`;
  try {
    const packages = await trpcGet("package.list", { orgId: ORG_ID });
    state.packages = Array.isArray(packages) ? packages : [];
    renderPackages();
    $("#trial-card").classList.toggle("hidden", !state.packages.some((pkg) => pkg.isTrial));
  } catch (error) {
    $("#packages").innerHTML = `<div class="package-card"><div class="package-name">Unable to load packages</div><div class="package-meta">${escapeHtml(error.message)}</div></div>`;
  }
}

function selectPackage(packageId, trial) {
  const pkg = state.packages.find((item) => item.id === packageId);
  if (!pkg) return;
  state.selectedPackage = { ...pkg, forceTrial: trial };
  document.querySelectorAll("[data-package-id]").forEach((card) => {
    card.classList.toggle("active", card.dataset.packageId === packageId);
  });
  $("#selected-plan-label").textContent = `${pkg.name} · ${trial ? "7-day trial" : money(pkg.priceBdt)}`;
  showScreen("register");
}

function validateRegistration({ fullName, phone, password }) {
  const okName = setFieldError("fullName", fullName.length >= 2 ? "" : "Enter at least 2 characters.");
  const okPhone = setFieldError("phone", isPhone(phone) ? "" : "Use a valid 11-digit BD number.");
  const okPassword = setFieldError("password", password.length >= 6 ? "" : "Use at least 6 characters.");
  return okName && okPhone && okPassword;
}

function validatePayment({ paymentFrom, trxId }) {
  const needsTrx = !["cash", "free"].includes(state.selectedMethod);
  const okPhone = setFieldError("paymentFrom", isPhone(paymentFrom) ? "" : "Use the sender mobile number.");
  const okTrx = setFieldError("trxId", !needsTrx || trxId.length >= 4 ? "" : "Enter the transaction ID.");
  return okPhone && okTrx;
}

async function handleRegister(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const data = Object.fromEntries(new FormData(form));
  const fullName = String(data.fullName || "").trim();
  const phone = String(data.phone || "").trim();
  const password = String(data.password || "");

  if (!state.selectedPackage) return toast("Select a package first.", "error");
  if (!validateRegistration({ fullName, phone, password })) return toast("Please fix the highlighted fields.", "error");

  state.customer = { fullName, phone, password };

  if (state.selectedPackage.forceTrial) {
    await submitTrial(form);
    return;
  }

  $("#payment-title").textContent = state.selectedPackage.name;
  $("#payment-amount").textContent = money(state.selectedPackage.priceBdt);
  const note = $("#payment-note");
  if (state.selectedPackage.paymentNumber) {
    note.textContent = `Send ${money(state.selectedPackage.priceBdt)} to ${state.selectedPackage.paymentNumber}, then submit your transaction ID.`;
    note.classList.add("show");
  } else {
    note.textContent = "";
    note.classList.remove("show");
  }
  showScreen("payment");
}

async function submitTrial(form) {
  setLoading(form, true);
  try {
    const result = await trpcPost("portal.trialRegister", {
      orgId: ORG_ID,
      packageId: state.selectedPackage.id,
      fullName: state.customer.fullName,
      phone: state.customer.phone,
      password: state.customer.password,
    });
    if (!result?.token) throw new Error("Trial activation failed");
    showConnected("Trial activated. Connecting now.");
  } catch (error) {
    toast(error.message, "error");
  } finally {
    setLoading(form, false);
  }
}

async function handlePayment(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const data = Object.fromEntries(new FormData(form));
  const paymentFrom = String(data.paymentFrom || "").trim();
  const trxId = String(data.trxId || "").trim();

  if (!state.selectedPackage || !state.customer) return toast("Complete registration first.", "error");
  if (!validatePayment({ paymentFrom, trxId })) return toast("Please fix the payment details.", "error");

  setLoading(form, true);
  try {
    const result = await trpcPost("portal.guestOrder", {
      orgId: ORG_ID,
      packageId: state.selectedPackage.id,
      fullName: state.customer.fullName,
      phone: state.customer.phone,
      password: state.customer.password,
      paymentMethod: state.selectedMethod,
      trxId: trxId || undefined,
      paymentFrom,
      isTrial: false,
    });
    state.orderId = result?.orderId;
    if (!state.orderId) throw new Error("Order was not created");
    $("#wait-order").textContent = formatOrderId(state.orderId);
    $("#wait-status").textContent = "Pending approval";
    $("#wait-phone").textContent = state.customer.phone;
    $("#wait-password").textContent = state.customer.password;
    showScreen("waiting");
    startPolling();
  } catch (error) {
    toast(error.message, "error");
  } finally {
    setLoading(form, false);
  }
}

function startPolling() {
  clearInterval(state.pollTimer);
  checkOrder();
  state.pollTimer = setInterval(checkOrder, 15000);
}

async function checkOrder() {
  if (!state.orderId || !state.customer?.phone) return;
  try {
    const order = await trpcGet("portal.checkOrder", { orderId: state.orderId, phone: state.customer.phone });
    if (order?.status === "approved") {
      clearInterval(state.pollTimer);
      $("#wait-status").textContent = "Approved";
      showConnected("Approved. Connecting now.");
    } else if (order?.status === "rejected") {
      clearInterval(state.pollTimer);
      $("#wait-status").textContent = "Rejected";
      toast("Payment was rejected. Please contact support.", "error");
    } else {
      $("#wait-status").textContent = "Pending approval";
      toast("Still waiting for admin approval.");
    }
  } catch (error) {
    toast(error.message, "error");
  }
}

function showConnected(message) {
  $("#connect-copy").textContent = message;
  showScreen("connected");
  setTimeout(connectToHotspot, 900);
}

function connectToHotspot() {
  if (!state.customer?.phone || !state.customer?.password) return;
  const dst = qs.get("dst") || qs.get("link-orig") || window.location.origin;
  const form = document.createElement("form");
  form.method = "POST";
  form.action = LOGIN_URL;
  form.style.display = "none";
  [
    ["username", state.customer.phone],
    ["password", state.customer.password],
    ["dst", dst],
    ["popup", "false"],
  ].forEach(([name, value]) => {
    const input = document.createElement("input");
    input.name = name;
    input.value = value;
    form.appendChild(input);
  });
  document.body.appendChild(form);
  form.submit();
}

function initBrand() {
  $("#brand-name").textContent = BRAND_NAME;
  $("#brand-initial").textContent = BRAND_NAME.trim().charAt(0).toUpperCase() || "S";
  if (isSafeUrl(BRAND_LOGO)) {
    const logo = $("#brand-logo");
    logo.src = BRAND_LOGO;
    logo.hidden = false;
    $("#brand-initial").hidden = true;
  }
}

function initTheme() {
  const saved = localStorage.getItem("hotspot_theme");
  const prefersDark = window.matchMedia?.("(prefers-color-scheme: dark)").matches;
  document.documentElement.dataset.theme = saved || (prefersDark ? "dark" : "light");
}

function bindEvents() {
  $("#theme-toggle").addEventListener("click", () => {
    const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    localStorage.setItem("hotspot_theme", next);
  });
  $("#refresh-btn").addEventListener("click", loadPackages);
  $("#trial-btn").addEventListener("click", () => {
    const trial = state.packages.find((pkg) => pkg.isTrial);
    if (!trial) return toast("No trial package is available right now.", "error");
    selectPackage(trial.id, true);
  });
  document.querySelectorAll("[data-back]").forEach((button) => {
    button.addEventListener("click", () => showScreen(button.dataset.back));
  });
  $("#register-form").addEventListener("submit", handleRegister);
  $("#payment-form").addEventListener("submit", handlePayment);
  $("#check-now").addEventListener("click", checkOrder);
  $("#manual-connect").addEventListener("click", connectToHotspot);
  document.querySelectorAll("[data-method]").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedMethod = button.dataset.method;
      document.querySelectorAll("[data-method]").forEach((item) => item.classList.toggle("active", item === button));
    });
  });
  document.querySelectorAll("input").forEach((input) => {
    input.addEventListener("input", () => {
      input.classList.remove("invalid");
      const error = document.querySelector(`[data-error-for="${input.name}"]`);
      if (error) error.textContent = "";
    });
  });
}

initBrand();
initTheme();
bindEvents();
loadPackages();
