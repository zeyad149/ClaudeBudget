/**
 * ClaudeBudget — Google Sheets sync endpoint
 * ------------------------------------------------------------
 * This is the tiny "backend" that lets the app write into YOUR Google Sheet.
 * It lives in your own Google account — your data never touches anyone else.
 *
 * Maintains two tabs:
 *   • "Transactions" — the raw log (now includes a "month" column)
 *   • "Monthly"      — one row per month: starting balance, income, spent,
 *                       net, money left (auto-recalculated on every change)
 *
 * FIRST-TIME SETUP (≈2 min):
 *  1. Create a Google Sheet → Extensions → Apps Script.
 *  2. Paste ALL of this file, Save.
 *  3. Deploy → New deployment → Web app → Execute as: Me · Access: Anyone.
 *  4. Authorize, copy the /exec URL, paste it into the app's Settings.
 *
 * UPDATING (if you already deployed an older version):
 *  1. Replace all the code with this file, Save.
 *  2. Deploy → Manage deployments → ✏️ Edit → Version: "New version" → Deploy.
 *     (The /exec URL stays the same, so nothing changes in the app.)
 */

const SHEET_NAME = "Transactions";
const MONTHLY_NAME = "Monthly";
const TX_HEADERS = ["id", "month", "date", "type", "category", "amount", "note", "syncedAt"];
const MONTHLY_HEADERS = ["month", "startingBalance", "income", "spent", "net", "moneyLeft"];

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents || "{}");
    const sheet = getSheet();

    if (body.action === "test") {
      sheet.appendRow(["TEST", "", new Date().toISOString(), "", "", "", "Connection OK", new Date().toISOString()]);
      return json({ ok: true });
    }

    if (body.action === "balance") {
      recompute({ month: body.month, amount: Number(body.amount) || 0 });
      return json({ ok: true });
    }

    if (body.action === "delete") {
      removeById(sheet, body.id);
      recompute();
      return json({ ok: true });
    }

    if (body.action === "upsert") {
      upsert(sheet, body.tx);
      recompute();
      return json({ ok: true });
    }

    return json({ ok: false, error: "unknown action" });
  } catch (err) {
    return json({ ok: false, error: String(err) });
  }
}

function doGet() {
  return json({ ok: true, service: "ClaudeBudget sync", time: new Date().toISOString() });
}

// ---------------- Transactions tab ----------------
function getSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) sheet = ss.insertSheet(SHEET_NAME);
  // always keep the header row correct
  sheet.getRange(1, 1, 1, TX_HEADERS.length).setValues([TX_HEADERS]).setFontWeight("bold");
  sheet.setFrozenRows(1);
  return sheet;
}

function ymFromIso(iso) {
  const d = new Date(iso);
  return d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2);
}

function rowFor(tx) {
  return [tx.id, ymFromIso(tx.date), tx.date, tx.type, tx.category, tx.amount, tx.note || "", new Date().toISOString()];
}

function findRow(sheet, id) {
  const last = sheet.getLastRow();
  if (last < 2) return -1;
  const ids = sheet.getRange(2, 1, last - 1, 1).getValues();
  for (let i = 0; i < ids.length; i++) {
    if (ids[i][0] === id) return i + 2;
  }
  return -1;
}

function upsert(sheet, tx) {
  const row = findRow(sheet, tx.id);
  const values = rowFor(tx);
  if (row === -1) sheet.appendRow(values);
  else sheet.getRange(row, 1, 1, values.length).setValues([values]);
}

function removeById(sheet, id) {
  const row = findRow(sheet, id);
  if (row !== -1) sheet.deleteRow(row);
}

// ---------------- Monthly tab ----------------
function getMonthly() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(MONTHLY_NAME);
  if (!sheet) sheet = ss.insertSheet(MONTHLY_NAME);
  return sheet;
}

// Read the starting balances already stored on the Monthly tab so we never
// lose them when we rebuild the aggregates.
function readBalances(monthly) {
  const map = {};
  const last = monthly.getLastRow();
  if (last < 2) return map;
  const vals = monthly.getRange(2, 1, last - 1, 2).getValues();
  vals.forEach((r) => { if (r[0]) map[r[0]] = Number(r[1]) || 0; });
  return map;
}

// Recalculate the Monthly tab from the Transactions tab. Optionally apply a
// starting-balance override coming from a "balance" action.
function recompute(balanceOverride) {
  const tx = getSheet();
  const monthly = getMonthly();
  const balances = readBalances(monthly);
  if (balanceOverride && balanceOverride.month) {
    balances[balanceOverride.month] = balanceOverride.amount;
  }

  const agg = {};
  const last = tx.getLastRow();
  if (last > 1) {
    const data = tx.getRange(2, 1, last - 1, TX_HEADERS.length).getValues();
    data.forEach((r) => {
      const month = r[1];          // month column
      const type = r[3];           // type column
      const amount = Number(r[5]) || 0; // amount column
      if (!month) return;          // skips TEST / malformed rows
      if (!agg[month]) agg[month] = { income: 0, spent: 0 };
      if (type === "income") agg[month].income += amount;
      else if (type === "expense") agg[month].spent += amount;
    });
  }

  const months = Object.keys(agg).concat(Object.keys(balances))
    .filter((v, i, a) => v && a.indexOf(v) === i)
    .sort();

  const rows = months.map((m) => {
    const a = agg[m] || { income: 0, spent: 0 };
    const bal = balances[m] || 0;
    const net = a.income - a.spent;
    return [m, bal, a.income, a.spent, net, bal + net];
  });

  monthly.clearContents();
  monthly.getRange(1, 1, 1, MONTHLY_HEADERS.length).setValues([MONTHLY_HEADERS]).setFontWeight("bold");
  if (rows.length) monthly.getRange(2, 1, rows.length, MONTHLY_HEADERS.length).setValues(rows);
  monthly.setFrozenRows(1);
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
