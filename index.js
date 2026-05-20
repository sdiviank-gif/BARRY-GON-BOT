const express = require("express");
const axios = require("axios");
const { GoogleSpreadsheet } = require("google-spreadsheet");

const app = express();
app.use(express.json());

const CONFIG = {
WHATSAPP_TOKEN: process.env.WHATSAPP_TOKEN,
PHONE_NUMBER_ID: "1170844492772192",
VERIFY_TOKEN: "barrygon2024",
YOUR_WHATSAPP_NUMBER: "12894890980",
SPREADSHEET_ID: process.env.SPREADSHEET_ID,
GOOGLE_SERVICE_ACCOUNT_EMAIL: "barry-gon-bot@healthy-anthem-496908-a4.iam.gserviceaccount.com",
GOOGLE_PRIVATE_KEY: process.env.PRIVATE_KEY,
GEMINI_API_KEY: process.env.API_KEY,
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
`https://graph.facebook.com/v18.0/${CONFIG.PHONE_NUMBER_ID}/messages`,
{
messaging_product: "whatsapp",
to: to,
type: "text",
text: { body: message },
},
{
headers: {
Authorization: `Bearer ${CONFIG.WHATSAPP_TOKEN}`,
"Content-Type": "application/json",
},
}
);
}

async function askGemini(userMessage) {
const prompt = `You are BARRY-GON, a sharp and intelligent personal assistant living inside WhatsApp.
You help the user with: spending tracking, grocery lists, investment alerts, and scheduling.
Respond in this JSON format only, no extra text:
{
"action": "log_spending" or "view_spending" or "add_grocery" or "view_groceries" or "log_investment" or "view_investments" or "add_schedule" or "view_schedule" or "general_reply",
"data": {
"amount": number or null,
"category": string or null,
"description": string or null,
"currency": "CAD" or "INR" or "USD" or null,
"item": string or null,
"quantity": string or null,
"date": string or null,
"time": string or null,
"event": string or null,
"asset": string or null,
"investment_action": "buy" or "sell" or null,
"notes": string or null
},
"reply": "Your friendly concise reply to send back"
}
User message: ${userMessage}`;

const response = await axios.post(
`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${CONFIG.GEMINI_API_KEY}`,
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
let summary = "📊 *Recent Spending:*\n\n";
let total = 0;
rows.slice(-5).reverse().forEach((row) => {
summary += `• ${row.Date} — ${row.Category}: ${row.Currency} $${row.Amount} (${row.Description})\n`;
total += parseFloat(row.Amount) || 0;
});
summary += `\n*Total shown: $${total.toFixed(2)}*`;
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
const pending = rows.filter((r) => r.Status === "Pending");
if (pending.length === 0) return "🛒 Your grocery list is empty!";
let list = "🛒 *Grocery List:*\n\n";
pending.forEach((row, i) => {
list += `${i + 1}. ${row.Item} — ${row.Quantity}\n`;
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
let summary = "📈 *Recent Investments:*\n\n";
rows.slice(-5).reverse().forEach((row) => {
summary += `• ${row.Date} — ${row.Action} ${row.Asset}: $${row.Amount}\n`;
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
if (rows.length === 0) return "📅 No upcoming events scheduled.";
let schedule = "📅 *Upcoming Schedule:*\n\n";
rows.slice(-5).forEach((row) => {
schedule += `• ${row.Date} at ${row.Time} — ${row.Event}\n`;
});
return schedule;
}

async function handleMessage(from, userMessage) {
try {
const result = await askGemini(userMessage);
let finalReply = result.reply;
switch (result.action) {
case "log_spending": await logSpending(result.data); break;
case "view_spending": finalReply = await viewSpending(); break;
case "add_grocery": await addGrocery(result.data); break;
case "view_groceries": finalReply = await viewGroceries(); break;
case "log_investment": await logInvestment(result.data); break;
case "view_investments": finalReply = await viewInvestments(); break;
case "add_schedule": await addSchedule(result.data); break;
case "view_schedule": finalReply = await viewSchedule(); break;
}
await sendWhatsApp(from, finalReply);
} catch (err) {
console.error("BARRY-GON Error:", err.message);
await sendWhatsApp(from, "⚠️ BARRY-GON hit a snag. Please try again in a moment.");
}
}

app.get("/webhook", (req, res) => {
const mode = req.query["hub.mode"];
const token = req.query["hub.verify_token"];
const challenge = req.query["hub.challenge"];
if (mode === "subscribe" && token === CONFIG.VERIFY_TOKEN) {
res.status(200).send(challenge);
} else {
res.sendStatus(403);
}
});

app.post("/webhook", async (req, res) => {
res.sendStatus(200);
try {
const entry = req.body.entry?.[0];
const change = entry?.changes?.[0];
const message = change?.value?.messages?.[0];
if (!message || message.type !== "text") return;
await handleMessage(message.from, message.text.body);
} catch (err) {
console.error("Webhook error:", err.message);
}
});

app.get("/", (req, res) => res.send("BARRY-GON is online and ready."));
app.listen(3000, () => console.log("BARRY-GON server running on port 3000"));
