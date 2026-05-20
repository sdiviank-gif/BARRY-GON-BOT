const express = require("express");
const axios = require("axios");
const { GoogleSpreadsheet } = require("google-spreadsheet");

const app = express();
app.use(express.json());

const CONFIG = {
  WHATSAPP_TOKEN: process.env.WHATSAPP_TOKEN,
  PHONE_NUMBER_ID: "1170844492772192",
  VERIFY_TOKEN: "barrygon2024",
  SPREADSHEET_ID: process.env.SPREADSHEET_ID,
  GOOGLE_SERVICE_ACCOUNT_EMAIL: "barry-gon-bot@healthy-anthem-496908-a4.iam.gserviceaccount.com",
  GOOGLE_PRIVATE_KEY: process.env.PRIVATE_KEY,
  GEMINI_API_KEY: process.env.GEMINI_API_KEY,
};

async function getSheet(tabName) {
  const doc = new GoogleSpreadsheet(CONFIG.SPREADSHEET_ID);
  await doc.useServiceAccountAuth({
    client_email: CONFIG.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    private_key: CONFIG.GOOGLE_PRIVATE_KEY,
  });
  await doc.loadInfo();
  return doc.sheetsByTitle[tabName];
}

async function sendWhatsApp(to, message) {
  await axios.post(
    "https://graph.facebook.com/v18.0/" + CONFIG.PHONE_NUMBER_ID + "/messages",
    {
      messaging_product: "whatsapp",
      to: to,
      type: "text",
      text: { body: message },
    },
    {
      headers: {
        Authorization: "Bearer " + CONFIG.WHATSAPP_TOKEN,
        "Content-Type": "application/json",
      },
    }
  );
}

async function askGemini(userMessage) {
  const prompt = "You are BARRY-GON, a sharp personal assistant on WhatsApp. Help with spending tracking, grocery lists, investments, and scheduling. Respond ONLY in this exact JSON format with no extra text: {\"action\": \"log_spending or view_spending or add_grocery or view_groceries or log_investment or view_investments or add_schedule or view_schedule or general_reply\", \"data\": {\"amount\": null, \"category\": null, \"description\": null, \"currency\": null, \"item\": null, \"quantity\": null, \"date\": null, \"time\": null, \"event\": null, \"asset\": null, \"investment_action\": null, \"notes\": null}, \"reply\": \"your reply here\"}. User message: " + userMessage;

  const response = await axios.post(
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=" + CONFIG.GEMINI_API_KEY,
    { contents: [{ parts: [{ text: prompt }] }] }
  );

  const raw = response.data.candidates[0].content.parts[0].text;
  const clean = raw.replace(/```json|```/g, "").trim();
  return JSON.parse(clean);
}

async function logSpending(data) {
  const sheet = await getSheet("Spending");
  await sheet.addRow({
    Date: new Date().toLocaleDateString("en-CA"),
    Category: data.category || "General",
    Description: data.description || "",
    Amount: data.amount || 0,
    Currency: data.currency || "CAD",
  });
}

async function viewSpending() {
  const sheet = await getSheet("Spending");
  const rows = await sheet.getRows();
  if (rows.length === 0) return "No spending logged yet.";
  let summary = "Recent Spending:\n\n";
  let total = 0;
  rows.slice(-5).reverse().forEach(function(row) {
    summary += "- " + row.Date + " " + row.Category + ": $" + row.Amount + " (" + row.Description + ")\n";
    total += parseFloat(row.Amount) || 0;
  });
  summary += "\nTotal: $" + total.toFixed(2);
  return summary;
}

async function addGrocery(data) {
  const sheet = await getSheet("Groceries");
  await sheet.addRow({
    Item: data.item || "",
    Quantity: data.quantity || "1",
    Status: "Pending",
    "Date Added": new Date().toLocaleDateString("en-CA"),
  });
}

async function viewGroceries() {
  const sheet = await getSheet("Groceries");
  const rows = await sheet.getRows();
  const pending = rows.filter(function(r) { return r.Status === "Pending"; });
  if (pending.length === 0) return "Your grocery list is empty!";
  let list = "Grocery List:\n\n";
  pending.forEach(function(row, i) {
    list += (i + 1) + ". " + row.Item + " - " + row.Quantity + "\n";
  });
  return list;
}

async function logInvestment(data) {
  const sheet = await getSheet("Investments");
  await sheet.addRow({
    Date: new Date().toLocaleDateString("en-CA"),
    Asset: data.asset || "",
    Action: data.investment_action || "",
    Amount: data.amount || 0,
    Notes: data.notes || "",
  });
}

async function viewInvestments() {
  const sheet = await getSheet("Investments");
  const rows = await sheet.getRows();
  if (rows.length === 0) return "No investments logged yet.";
  let summary = "Recent Investments:\n\n";
  rows.slice(-5).reverse().forEach(function(row) {
    summary += "- " + row.Date + " " + row.Action + " " + row.Asset + ": $" + row.Amount + "\n";
  });
  return summary;
}

async function addSchedule(data) {
  const sheet = await getSheet("Schedule");
  await sheet.addRow({
    Date: data.date || "",
    Time: data.time || "",
    Event: data.event || "",
    "Reminder Sent": "No",
  });
}

async function viewSchedule() {
  const sheet = await getSheet("Schedule");
  const rows = await sheet.getRows();
  if (rows.length === 0) return "No upcoming events scheduled.";
  let schedule = "Upcoming Schedule:\n\n";
  rows.slice(-5).forEach(function(row) {
    schedule += "- " + row.Date + " at " + row.Time + ": " + row.Event + "\n";
  });
  return schedule;
}

async function handleMessage(from, userMessage) {
  try {
    const result = await askGemini(userMessage);
    let finalReply = result.reply;
    if (result.action === "log_spending") { await logSpending(result.data); }
    else if (result.action === "view_spending") { finalReply = await viewSpending(); }
    else if (result.action === "add_grocery") { await addGrocery(result.data); }
    else if (result.action === "view_groceries") { finalReply = await viewGroceries(); }
    else if (result.action === "log_investment") { await logInvestment(result.data); }
    else if (result.action === "view_investments") { finalReply = await viewInvestments(); }
    else if (result.action === "add_schedule") { await addSchedule(result.data); }
    else if (result.action === "view_schedule") { finalReply = await viewSchedule(); }
    await sendWhatsApp(from, finalReply);
  } catch (err) {
    console.error("BARRY-GON Error:", err.message);
    await sendWhatsApp(from, "BARRY-GON hit a snag. Please try again in a moment.");
  }
}

app.get("/webhook", function(req, res) {
  var mode = req.query["hub.mode"];
  var token = req.query["hub.verify_token"];
  var challenge = req.query["hub.challenge"];
  if (mode === "subscribe" && token === CONFIG.VERIFY_TOKEN) {
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

app.post("/webhook", async function(req, res) {
  res.sendStatus(200);
  try {
    var entry = req.body.entry && req.body.entry[0];
    var change = entry && entry.changes && entry.changes[0];
    var message = change && change.value && change.value.messages && change.value.messages[0];
    if (!message || message.type !== "text") return;
    await handleMessage(message.from, message.text.body);
  } catch (err) {
    console.error("Webhook error:", err.message);
  }
});

app.get("/", function(req, res) { res.send("BARRY-GON is online and ready."); });
app.listen(3000, function() { console.log("BARRY-GON server running on port 3000"); });
