const express = require("express");
const axios = require("axios");
const { google } = require("googleapis");

const app = express();
app.use(express.json());

const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = "1170844492772192";
const VERIFY_TOKEN = "barrygon2024";
const SPREADSHEET_ID = process.env.SPREADSHEET_ID;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const SERVICE_ACCOUNT_EMAIL = "barry-gon-bot@healthy-anthem-496908-a4.iam.gserviceaccount.com";
const PRIVATE_KEY = process.env.PRIVATE_KEY;

async function getSheetsClient() {
  const auth = new google.auth.JWT(
    SERVICE_ACCOUNT_EMAIL,
    null,
    PRIVATE_KEY,
    ["https://www.googleapis.com/auth/spreadsheets"]
  );
  return google.sheets({ version: "v4", auth });
}

async function appendRow(tabName, values) {
  const sheets = await getSheetsClient();
  await sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: tabName + "!A1",
    valueInputOption: "RAW",
    requestBody: { values: [values] },
  });
}

async function getRows(tabName) {
  const sheets = await getSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: tabName + "!A2:F100",
  });
  return res.data.values || [];
}

async function sendWhatsApp(to, message) {
  await axios.post(
    "https://graph.facebook.com/v18.0/" + PHONE_NUMBER_ID + "/messages",
    { messaging_product: "whatsapp", to: to, type: "text", text: { body: message } },
    { headers: { Authorization: "Bearer " + WHATSAPP_TOKEN, "Content-Type": "application/json" } }
  );
}

async function askGemini(userMessage) {
  const prompt = "You are BARRY-GON, a personal assistant on WhatsApp. Help with spending, groceries, investments, scheduling. Reply ONLY in this JSON format, no extra text: {\"action\": \"log_spending or view_spending or add_grocery or view_groceries or log_investment or view_investments or add_schedule or view_schedule or general_reply\", \"data\": {\"amount\": null, \"category\": null, \"description\": null, \"currency\": null, \"item\": null, \"quantity\": null, \"date\": null, \"time\": null, \"event\": null, \"asset\": null, \"investment_action\": null, \"notes\": null}, \"reply\": \"your reply\"}. User said: " + userMessage;
  const res = await axios.post(
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=" + GEMINI_API_KEY,
    { contents: [{ parts: [{ text: prompt }] }] }
  );
  const raw = res.data.candidates[0].content.parts[0].text;
  return JSON.parse(raw.replace(/```json|```/g, "").trim());
}

async function handleMessage(from, text) {
  try {
    const result = await askGemini(text);
    let reply = result.reply;
    const d = result.data;
    const date = new Date().toLocaleDateString("en-CA");

    if (result.action === "log_spending") {
      await appendRow("Spending", [date, d.category || "General", d.description || "", d.amount || 0, d.currency || "CAD"]);
    } else if (result.action === "view_spending") {
      const rows = await getRows("Spending");
      if (rows.length === 0) { reply = "No spending logged yet."; }
      else {
        reply = "Recent Spending:\n";
        rows.slice(-5).reverse().forEach(function(r) { reply += "- " + r[0] + " " + r[1] + ": $" + r[3] + " (" + r[2] + ")\n"; });
      }
    } else if (result.action === "add_grocery") {
      await appendRow("Groceries", [d.item || "", d.quantity || "1", "Pending", date]);
    } else if (result.action === "view_groceries") {
      const rows = await getRows("Groceries");
      const pending = rows.filter(function(r) { return r[2] === "Pending"; });
      if (pending.length === 0) { reply = "Your grocery list is empty!"; }
      else { reply = "Grocery List:\n"; pending.forEach(function(r, i) { reply += (i+1) + ". " + r[0] + " - " + r[1] + "\n"; }); }
    } else if (result.action === "log_investment") {
      await appendRow("Investments", [date, d.asset || "", d.investment_action || "", d.amount || 0, d.notes || ""]);
    } else if (result.action === "view_investments") {
      const rows = await getRows("Investments");
      if (rows.length === 0) { reply = "No investments logged yet."; }
      else { reply = "Investments:\n"; rows.slice(-5).reverse().forEach(function(r) { reply += "- " + r[0] + " " + r[2] + " " + r[1] + ": $" + r[3] + "\n"; }); }
    } else if (result.action === "add_schedule") {
      await appendRow("Schedule", [d.date || "", d.time || "", d.event || "", "No"]);
    } else if (result.action === "view_schedule") {
      const rows = await getRows("Schedule");
      if (rows.length === 0) { reply = "No upcoming events."; }
      else { reply = "Schedule:\n"; rows.slice(-5).forEach(function(r) { reply += "- " + r[0] + " at " + r[1] + ": " + r[2] + "\n"; }); }
    }

    await sendWhatsApp(from, reply);
  } catch (err) {
    console.error("BARRY-GON Error:", err.message);
    await sendWhatsApp(from, "BARRY-GON hit a snag. Please try again.");
  }
}

app.get("/webhook", function(req, res) {
  if (req.query["hub.mode"] === "subscribe" && req.query["hub.verify_token"] === VERIFY_TOKEN) {
    res.status(200).send(req.query["hub.challenge"]);
  } else { res.sendStatus(403); }
});

app.post("/webhook", async function(req, res) {
  res.sendStatus(200);
  try {
    var msg = req.body.entry[0].changes[0].value.messages[0];
    if (msg && msg.type === "text") await handleMessage(msg.from, msg.text.body);
  } catch (err) { console.error("Webhook error:", err.message); }
});

app.get("/", function(req, res) { res.send("BARRY-GON is online."); });
app.listen(3000, function() { console.log("BARRY-GON server running on port 3000"); });
