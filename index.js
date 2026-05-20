const express = require("express");
const axios = require("axios");
const { GoogleSpreadsheet } = require("google-spreadsheet");
const { JWT } = require("google-auth-library");

const app = express();
app.use(express.json());

const CONFIG = {
WHATSAPP_TOKEN: "EAAN7ZCBMJS6wBRvZAJimbjhb778ZCe5QxUo4dEmMqaf8ZA01lz9fvKpJ2ZA6l5FhUZCZAP3F9IP21DxAZCOZCeZBmdHD7VPVat8zSq0V71yLkJpKUXMoBX7af1PKPxp254g9U3tiv0vg3FeaqJbXReTRl8Ru7QXRkwBZAfC7LIJjPZAZBKCLQ7U28nwncQa9qulUqhXZBNVGKOoGF1WcrXVClyYmh2Uoq2W4NiDKJjOSizKe6r5bqJZBtgY9qWBRXrsoqVHZBidZBY5gQI6ldrtltr6285pBKLfELNPL2YQtjCngPAEcZD",
PHONE_NUMBER_ID: "1170844492772192",
VERIFY_TOKEN: "barrygon2024",
YOUR_WHATSAPP_NUMBER: "12894890980",
SPREADSHEET_ID: "1Vo75Qdp_SpxFHc8NGG2odnczkr0Yuuex4tXJ3CFQZTk",
GOOGLE_SERVICE_ACCOUNT_EMAIL: "barry-gon-bot@healthy-anthem-496908-a4.iam.gserviceaccount.com",
GOOGLE_PRIVATE_KEY: "-----BEGIN PRIVATE KEY-----\nYOUR_PRIVATE_KEY_HERE\n-----END PRIVATE KEY-----\n",
GEMINI_API_KEY: "AIzaSyA1CW3wmWW7ar7zkv4aA-vQtdutdNC8vxI",
};

async function getSheet(tabName) {
const auth = new JWT({
email: CONFIG.GOOGLE_SERVICE_ACCOUNT_EMAIL,
key: CONFIG.GOOGLE_PRIVATE_KEY,
scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});
const doc = new GoogleSpreadsheet(CONFIG.SPREADSHEET_ID, auth);
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

async function askGemini(userMessage, context) {
const prompt = `You are BARRY-GON, a sharp and intelligent personal assistant living inside WhatsApp.
You help the user with: spending tracking, grocery lists, investment alerts, and scheduling.

When the user sends a message, you must respond in the following JSON format only — no extra text:
{
"action": "log_spending" | "view_spending" | "add_grocery" | "view_groceries" | "clear_grocery" | "log_investment" | "view_investments" | "add_schedule" | "view_schedule" | "general_reply",
"data": {
"amount": number or null,
"category": string or null,
"description": string or null,
"currency": "CAD" | "INR" | "USD" or null,
"item": string or null,
"quantity": string or null,
"date": string or null,
"time": string or null,
"event": string or null,
"asset": string or null,
"investment_action": "buy" | "sell" | null,
"notes": string or null
},
"reply": "Your friendly, concise reply to send back to the user"
}

Current context: ${context}
User message: ${userMessage}`;

const response = await axios.post(
`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${CONFIG.GEMINI_API_KEY}`,
{
contents: [{ parts: [{ text: prompt }] }],
}
);

const raw = response.data.candidates[0].content.parts[0].text;
const clean = raw.replace(/```json|```/g, "").trim();
return JSON.parse(clean);
}

async function logSpending(data) {
const sheet = await getSheet("Spending");
const date = new Date().toLocaleDateString("en-CA");
await sheet.addRow({
Date: date,
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
const recent = rows.slice(-5).reverse();
let summary = "📊 *Recent Spending (Last 5 entries):*\n\n";
let total = 0;
recent.forEach((row) => {
summary += `• ${row.get("Date")} — ${row.get("Category")}: ${row.get("Currency")} $${row.get("Amount")} (${row.get("Description")})\n`;
total += parseFloat(row.get("Amount")) || 0;
});
summary += `\n*Total shown: $${total.toFixed(2)}*`;
return summary;
}

async function addGrocery(data) {
const sheet = await getSheet("Groceries");
const date = new Date().toLocaleDateString("en-CA");
await sheet.addRow({
Item: data.item || "",
Quantity: data.quantity || "1",
Status: "Pending",
"Date Added": date,
});
}

async function viewGroceries() {
const sheet = await getSheet("Groceries");
const rows = await sheet.getRows();
const pending = rows.filter((r) => r.get("Status") === "Pending");
if (pending.length === 0) return "🛒 Your grocery list is empty!";
let list = "🛒 *Grocery List:*\n\n";
pending.forEach((row, i) => {
list += `${i + 1}. ${row.get("Item")} — ${row.get("Quantity")}\n`;
});
return list;
}

async function logInvestment(data) {
const sheet = await getSheet("Investments");
const date = new Date().toLocaleDateString("en-CA");
await sheet.addRow({
Date: date,
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
const recent = rows.slice(-5).reverse();
let summary = "📈 *Recent Investments:*\n\n";
recent.forEach((row) => {
summary += `• ${row.get("Date")} — ${row.get("Action")} ${row.get("Asset")}: $${row.get("Amount")}\n`;
if (row.get("Notes")) summary += ` Notes: ${row.get("Notes")}\n`;
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
schedule += `• ${row.get("Date")} at ${row.get("Time")} — ${row.get("Event")}\n`;
});
return schedule;
}

async function handleMessage(from, userMessage) {
try {
const result = await askGemini(userMessage, "User is messaging BARRY-GON on WhatsApp");
let finalReply = result.reply;

switch (result.action) {
case "log_spending":
await logSpending(result.data);
break;
case "view_spending":
finalReply = await viewSpending();
break;
case "add_grocery":
await addGrocery(result.data);
break;
case "view_groceries":
finalReply = await viewGroceries();
break;
case "log_investment":
await logInvestment(result.data);
break;
case "view_investments":
finalReply = await viewInvestments();
break;
case "add_schedule":
await addSchedule(result.data);
break;
case "view_schedule":
finalReply = await viewSchedule();
break;
default:
break;
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
const from = message.from;
const text = message.text.body;
console.log(`BARRY-GON received from ${from}: ${text}`);
await handleMessage(from, text);
} catch (err) {
console.error("Webhook error:", err.message);
}
});

app.get("/", (req, res) => res.send("BARRY-GON is online and ready."));

app.listen(3000, () => console.log("BARRY-GON server running on port 3000"));
