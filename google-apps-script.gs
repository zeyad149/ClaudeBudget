/**
 * ClaudeBudget — Google Sheets sync endpoint
 * ------------------------------------------------------------
 * This is the tiny "backend" that lets the app write into YOUR Google Sheet.
 * It lives in your own Google account — your data never touches anyone else.
 *
 * SETUP (≈2 minutes):
 *  1. Create a new Google Sheet (sheet1 is fine).
 *  2. Extensions → Apps Script.
 *  3. Delete the sample code, paste ALL of this file, and Save.
 *  4. Click Deploy → New deployment → type: Web app.
 *       - Execute as: Me
 *       - Who has access: Anyone
 *  5. Authorize when prompted, then copy the Web app URL (ends in /exec).
 *  6. Paste that URL into the app: Settings → "Google Sheets sync URL".
 *  7. Tap "Test sync" — a TEST row should appear in your sheet.
 *
 * The app sends one of three actions: "upsert", "delete", "test".
 * Rows are keyed by the transaction id so re-syncing never duplicates.
 */

const SHEET_NAME = "Transactions";
const HEADERS = ["id", "date", "type", "category", "amount", "note", "syncedAt"];

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents || "{}");
    const sheet = getSheet();

    if (body.action === "test") {
      sheet.appendRow(["TEST", body.at || new Date().toISOString(), "", "", "", "Connection OK ✅", new Date().toISOString()]);
      return json({ ok: true });
    }

    if (body.action === "delete") {
      removeById(sheet, body.id);
      return json({ ok: true });
    }

    if (body.action === "upsert") {
      upsert(sheet, body.tx);
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

function getSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.appendRow(HEADERS);
    sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight("bold");
    sheet.setFrozenRows(1);
  }
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(HEADERS);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function rowFor(tx) {
  return [tx.id, tx.date, tx.type, tx.category, tx.amount, tx.note || "", new Date().toISOString()];
}

function findRow(sheet, id) {
  const ids = sheet.getRange(2, 1, Math.max(sheet.getLastRow() - 1, 0), 1).getValues();
  for (let i = 0; i < ids.length; i++) {
    if (ids[i][0] === id) return i + 2; // account for header + 1-based
  }
  return -1;
}

function upsert(sheet, tx) {
  const row = findRow(sheet, tx.id);
  const values = rowFor(tx);
  if (row === -1) {
    sheet.appendRow(values);
  } else {
    sheet.getRange(row, 1, 1, values.length).setValues([values]);
  }
}

function removeById(sheet, id) {
  const row = findRow(sheet, id);
  if (row !== -1) sheet.deleteRow(row);
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
