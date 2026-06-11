/* ClaudeBudget — offline-first budget tracker
 * Plain vanilla JS, no build step. State lives in localStorage and
 * (optionally) syncs each transaction to a Google Sheet via Apps Script.
 */
(() => {
  "use strict";

  const LS_KEY = "claudebudget.v1";

  // ---- Default categories (emoji + keyword rules for auto-categorizing) ----
  const DEFAULT_CATEGORIES = [
    { name: "Food", emoji: "🍔", keywords: ["restaurant", "food", "lunch", "dinner", "talabat", "deliveroo", "mcdonald", "kfc", "shake", "burger", "pizza", "sushi"] },
    { name: "Groceries", emoji: "🛒", keywords: ["carrefour", "lulu", "spinneys", "grocery", "supermarket", "union coop", "waitrose", "market"] },
    { name: "Cafe", emoji: "☕", keywords: ["coffee", "cafe", "starbucks", "costa", "tea", "bar", "snack", "energy", "juice"] },
    { name: "Fuel", emoji: "⛽", keywords: ["petrol", "fuel", "gas", "adnoc", "enoc", "eppco", "station"] },
    { name: "Padel/Sport", emoji: "🎾", keywords: ["padel", "paddle", "tennis", "gym", "court", "sport", "fitness", "match"] },
    { name: "Transport", emoji: "🚗", keywords: ["careem", "uber", "taxi", "salik", "parking", "metro", "rta", "toll"] },
    { name: "Bills", emoji: "🧾", keywords: ["dewa", "etisalat", "du", "internet", "rent", "bill", "subscription", "insurance"] },
    { name: "Shopping", emoji: "🛍️", keywords: ["amazon", "noon", "namshi", "mall", "store", "clothes", "apple", "ikea"] },
    { name: "Business", emoji: "💼", keywords: ["supplier", "office", "invoice", "client", "stock", "software", "ads", "salary"] },
    { name: "Health", emoji: "💊", keywords: ["pharmacy", "clinic", "hospital", "doctor", "aster", "medicine"] },
    { name: "Other", emoji: "📦", keywords: [] },
  ];

  const DEFAULT_STATE = {
    settings: { currency: "AED", syncUrl: "" },
    categories: DEFAULT_CATEGORIES,
    transactions: [],
  };

  // ---------------- State ----------------
  let state = load();

  function load() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (!raw) return structuredClone(DEFAULT_STATE);
      const parsed = JSON.parse(raw);
      // merge defaults so new fields appear after upgrades
      return {
        settings: { ...DEFAULT_STATE.settings, ...(parsed.settings || {}) },
        categories: parsed.categories && parsed.categories.length ? parsed.categories : structuredClone(DEFAULT_CATEGORIES),
        transactions: parsed.transactions || [],
      };
    } catch (e) {
      console.error("load failed", e);
      return structuredClone(DEFAULT_STATE);
    }
  }

  function save() {
    localStorage.setItem(LS_KEY, JSON.stringify(state));
  }

  // ---------------- Helpers ----------------
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function fmt(n) {
    return Number(n).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  }

  function catByName(name) {
    return state.categories.find((c) => c.name === name) || state.categories[state.categories.length - 1];
  }

  function guessCategory(note) {
    const t = (note || "").toLowerCase();
    if (!t.trim()) return null;
    for (const c of state.categories) {
      for (const kw of c.keywords) {
        if (kw && t.includes(kw)) return c.name;
      }
    }
    return null;
  }

  function toast(msg) {
    const el = $("#toast");
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.classList.remove("show"), 1900);
  }

  // ---------------- Add view ----------------
  const add = { amount: "0", type: "expense", category: null };

  function renderAmount() {
    $("#amount").textContent = add.amount === "" ? "0" : add.amount;
    $("#currency-symbol").textContent = state.settings.currency;
  }

  function pressKey(k) {
    if (k === "del") {
      add.amount = add.amount.length <= 1 ? "0" : add.amount.slice(0, -1);
    } else if (k === ".") {
      if (!add.amount.includes(".")) add.amount = (add.amount === "" ? "0" : add.amount) + ".";
    } else {
      if (add.amount === "0") add.amount = k;
      else {
        // limit to 2 decimals
        if (add.amount.includes(".") && add.amount.split(".")[1].length >= 2) return;
        add.amount += k;
      }
    }
    renderAmount();
  }

  function renderChips() {
    const row = $("#cat-row");
    row.innerHTML = "";
    state.categories.forEach((c) => {
      const b = document.createElement("button");
      b.className = "chip" + (add.category === c.name ? " active" : "");
      b.innerHTML = `<span class="emoji">${c.emoji}</span>${c.name}`;
      b.onclick = () => {
        add.category = c.name;
        add._userPicked = true;
        renderChips();
      };
      row.appendChild(b);
    });
  }

  function onNoteInput() {
    if (add._userPicked) return; // don't override a manual choice
    const g = guessCategory($("#note").value);
    if (g && g !== add.category) {
      add.category = g;
      renderChips();
    }
  }

  function setType(type) {
    add.type = type;
    $$(".type-btn").forEach((b) => b.classList.toggle("active", b.dataset.type === type));
    $("#save-btn").classList.toggle("income", type === "income");
  }

  function saveEntry() {
    const amt = parseFloat(add.amount);
    if (!amt || amt <= 0) {
      toast("Enter an amount first");
      return;
    }
    const note = $("#note").value.trim();
    const category = add.category || guessCategory(note) || "Other";
    const tx = {
      id: uid(),
      date: new Date().toISOString(),
      amount: Math.round(amt * 100) / 100,
      type: add.type,
      category,
      note,
      synced: false,
    };
    state.transactions.unshift(tx);
    save();
    syncOne(tx);

    // reset entry
    add.amount = "0";
    add.category = null;
    add._userPicked = false;
    $("#note").value = "";
    renderAmount();
    renderChips();
    toast(`${tx.type === "income" ? "Income" : "Expense"} saved · ${state.settings.currency} ${fmt(tx.amount)}`);
  }

  // ---------------- Month view ----------------
  let viewMonth = startOfMonth(new Date());

  function startOfMonth(d) {
    return new Date(d.getFullYear(), d.getMonth(), 1);
  }
  function monthKey(d) {
    return `${d.getFullYear()}-${d.getMonth()}`;
  }
  function inMonth(iso, m) {
    const d = new Date(iso);
    return d.getFullYear() === m.getFullYear() && d.getMonth() === m.getMonth();
  }

  function renderMonth() {
    $("#month-label").textContent = viewMonth.toLocaleDateString("en-US", { month: "long", year: "numeric" });
    const txs = state.transactions.filter((t) => inMonth(t.date, viewMonth));

    let income = 0, expense = 0;
    const byCat = {};
    txs.forEach((t) => {
      if (t.type === "income") income += t.amount;
      else {
        expense += t.amount;
        byCat[t.category] = (byCat[t.category] || 0) + t.amount;
      }
    });
    $("#sum-income").textContent = fmt(income);
    $("#sum-expense").textContent = fmt(expense);
    $("#sum-net").textContent = fmt(income - expense);
    $("#sum-net").style.color = income - expense >= 0 ? "var(--green)" : "var(--red)";

    // breakdown
    const bd = $("#breakdown");
    bd.innerHTML = "";
    const cats = Object.entries(byCat).sort((a, b) => b[1] - a[1]);
    if (!cats.length) {
      bd.innerHTML = `<p class="empty">No spending logged yet this month.</p>`;
    } else {
      cats.forEach(([name, amt]) => {
        const c = catByName(name);
        const pct = expense ? Math.round((amt / expense) * 100) : 0;
        const row = document.createElement("div");
        row.className = "bd-row";
        row.innerHTML = `
          <div class="bd-head">
            <span>${c.emoji} ${name}</span>
            <span><strong>${state.settings.currency} ${fmt(amt)}</strong> <span class="pct">${pct}%</span></span>
          </div>
          <div class="bd-bar"><div style="width:${pct}%"></div></div>`;
        bd.appendChild(row);
      });
    }

    // transactions
    const list = $("#tx-list");
    list.innerHTML = "";
    if (!txs.length) {
      list.innerHTML = `<p class="empty">Nothing here yet. Add your first entry on the Add tab.</p>`;
    } else {
      txs.forEach((t) => {
        const c = catByName(t.category);
        const d = new Date(t.date);
        const row = document.createElement("div");
        row.className = "tx";
        const sign = t.type === "income" ? "+" : "−";
        row.innerHTML = `
          <div class="tx-emoji">${c.emoji}</div>
          <div class="tx-main">
            <div class="tx-note">${escapeHtml(t.note || t.category)}</div>
            <div class="tx-sub">${t.category} · ${d.toLocaleDateString("en-US", { day: "numeric", month: "short" })}, ${d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}</div>
          </div>
          <div class="tx-amt ${t.type}">${sign}${fmt(t.amount)}</div>
          <button class="tx-del" aria-label="Delete">✕</button>`;
        row.querySelector(".tx-del").onclick = () => deleteTx(t.id);
        list.appendChild(row);
      });
    }
  }

  function deleteTx(id) {
    if (!confirm("Delete this transaction?")) return;
    state.transactions = state.transactions.filter((t) => t.id !== id);
    save();
    renderMonth();
    updateSettingsCounts();
    // tell the sheet to remove it too (best-effort)
    if (state.settings.syncUrl) postToSheet({ action: "delete", id });
  }

  function escapeHtml(s) {
    return (s || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  // ---------------- Sync (Google Sheets via Apps Script) ----------------
  // We POST as text/plain to avoid a CORS preflight. With no-cors we can't
  // read the response, so we treat a resolved fetch as success and keep a
  // "Push all" button for recovery.
  function setPill() {
    const pill = $("#sync-pill");
    if (!state.settings.syncUrl) { pill.className = "sync-pill off"; pill.title = "Sync off (on-device only)"; return; }
    const pending = state.transactions.some((t) => !t.synced);
    pill.className = "sync-pill " + (pending ? "pending" : "ok");
    pill.title = pending ? "Some entries waiting to sync" : "Synced to Google Sheet";
  }

  async function postToSheet(payload) {
    const url = state.settings.syncUrl;
    if (!url) return false;
    try {
      await fetch(url, {
        method: "POST",
        mode: "no-cors",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(payload),
      });
      return true;
    } catch (e) {
      console.warn("sync failed", e);
      return false;
    }
  }

  async function syncOne(tx) {
    if (!state.settings.syncUrl) { setPill(); return; }
    const ok = await postToSheet({ action: "upsert", tx });
    if (ok) {
      const cur = state.transactions.find((t) => t.id === tx.id);
      if (cur) cur.synced = true;
      save();
    }
    setPill();
  }

  async function pushAll() {
    if (!state.settings.syncUrl) { toast("Add a sync URL first"); return; }
    const unsynced = state.transactions.filter((t) => !t.synced);
    if (!unsynced.length) { toast("Everything is already synced"); return; }
    $("#sync-msg").textContent = `Pushing ${unsynced.length}…`;
    let done = 0;
    for (const tx of unsynced) {
      const ok = await postToSheet({ action: "upsert", tx });
      if (ok) { tx.synced = true; done++; }
    }
    save();
    setPill();
    $("#sync-msg").textContent = `Pushed ${done}/${unsynced.length}.`;
    toast(`Synced ${done} entr${done === 1 ? "y" : "ies"}`);
  }

  async function testSync() {
    const url = $("#set-sync-url").value.trim();
    if (!url) { $("#sync-msg").textContent = "Enter a URL first."; return; }
    state.settings.syncUrl = url;
    save();
    $("#sync-msg").textContent = "Sending test row…";
    const ok = await postToSheet({ action: "test", at: new Date().toISOString() });
    $("#sync-msg").textContent = ok
      ? "✅ Test sent. Check your Google Sheet for a 'TEST' row."
      : "⚠️ Could not reach the URL. Double-check it ends in /exec and is deployed to 'Anyone'.";
    setPill();
  }

  // ---------------- Settings ----------------
  function renderSettings() {
    $("#set-currency").value = state.settings.currency;
    $("#set-sync-url").value = state.settings.syncUrl;
    updateSettingsCounts();
    renderCatEditor();
  }

  function updateSettingsCounts() {
    $("#tx-count").textContent = state.transactions.length;
  }

  function renderCatEditor() {
    const wrap = $("#cat-editor");
    wrap.innerHTML = "";
    state.categories.forEach((c, i) => {
      const row = document.createElement("div");
      row.className = "cat-edit-row";
      row.innerHTML = `
        <span class="ce-emoji">${c.emoji}</span>
        <span class="ce-name">${c.name}</span>
        <input class="ce-kw" type="text" value="${escapeHtml(c.keywords.join(", "))}" placeholder="keywords, comma separated" />`;
      const input = row.querySelector(".ce-kw");
      input.onchange = () => {
        state.categories[i].keywords = input.value.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
        save();
        toast("Rules updated");
      };
      wrap.appendChild(row);
    });
  }

  function exportCsv() {
    const rows = [["id", "date", "type", "category", "amount", "currency", "note"]];
    state.transactions
      .slice()
      .sort((a, b) => new Date(a.date) - new Date(b.date))
      .forEach((t) => {
        rows.push([t.id, t.date, t.type, t.category, t.amount, state.settings.currency, `"${(t.note || "").replace(/"/g, '""')}"`]);
      });
    const csv = rows.map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `claudebudget-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function wipe() {
    if (!confirm("Erase ALL transactions on this device? This cannot be undone.")) return;
    state.transactions = [];
    save();
    renderMonth();
    renderSettings();
    setPill();
    toast("All data erased");
  }

  // ---------------- Navigation ----------------
  function showView(name) {
    $$(".view").forEach((v) => v.classList.add("hidden"));
    $(`#view-${name}`).classList.remove("hidden");
    $$(".tab").forEach((t) => t.classList.toggle("active", t.dataset.view === name));
    if (name === "month") renderMonth();
    if (name === "settings") renderSettings();
    if (name === "add") { renderAmount(); renderChips(); }
    window.scrollTo(0, 0);
  }

  // ---------------- Wire up ----------------
  function init() {
    // keypad
    $("#keypad").addEventListener("click", (e) => {
      const b = e.target.closest("button");
      if (b) pressKey(b.dataset.k);
    });
    // type toggle
    $$(".type-btn").forEach((b) => (b.onclick = () => setType(b.dataset.type)));
    $("#note").addEventListener("input", onNoteInput);
    $("#save-btn").onclick = saveEntry;

    // month nav
    $("#prev-month").onclick = () => { viewMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth() - 1, 1); renderMonth(); };
    $("#next-month").onclick = () => { viewMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 1); renderMonth(); };

    // tabs
    $$(".tab").forEach((t) => (t.onclick = () => showView(t.dataset.view)));

    // settings
    $("#set-currency").onchange = (e) => { state.settings.currency = (e.target.value.trim() || "AED").toUpperCase(); save(); renderAmount(); toast("Currency updated"); };
    $("#set-sync-url").onchange = (e) => { state.settings.syncUrl = e.target.value.trim(); save(); setPill(); };
    $("#test-sync").onclick = testSync;
    $("#push-all").onclick = pushAll;
    $("#export-csv").onclick = exportCsv;
    $("#wipe").onclick = wipe;

    renderAmount();
    renderChips();
    setType("expense");
    setPill();

    // retry pending syncs whenever we come back online
    window.addEventListener("online", () => { if (state.settings.syncUrl) pushAll(); });

    // service worker
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("./sw.js").catch((e) => console.warn("sw", e));
    }
  }

  document.addEventListener("DOMContentLoaded", init);
})();
