// ==========================================
// INCES BOT - POLLING VERSION
// Tanpa webhook, jalan di VPS
// ==========================================
const { google } = require("googleapis");
const TelegramBot = require("node-telegram-bot-api");

// === ENV VARIABEL ===
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const SPREADSHEET_ID = process.env.SPREADSHEET_ID;
const SHEET_NAME = process.env.SHEET_NAME;

if (!TELEGRAM_TOKEN || !SPREADSHEET_ID || !SHEET_NAME || !process.env.GOOGLE_CREDENTIALS) {
  console.error("❌ ENV belum lengkap");
  process.exit(1);
}

const GOOGLE_CREDENTIALS = JSON.parse(process.env.GOOGLE_CREDENTIALS);

// === Inisialisasi Telegram Bot (Long Polling — Optimized) ===
const bot = new TelegramBot(TELEGRAM_TOKEN, {
  polling: {
    autoStart: false,
    interval: 0,
    params: {
      timeout: 50,
      allowed_updates: ["message"],
    },
  },
});

// === Koneksi ke Google Sheets ===
async function authorize() {
  const auth = new google.auth.GoogleAuth({
    credentials: GOOGLE_CREDENTIALS,
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });
  return auth.getClient();
}

async function getSheetData() {
  const authClient = await authorize();
  const sheets = google.sheets({ version: "v4", auth: authClient });
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEET_NAME}!A1:C100`,
  });
  return response.data.values || [];
}

async function getDataByCommand(command) {
  try {
    const rows = await getSheetData();
    const foundRow = rows.find(
      (row) => row[0] && row[0].toLowerCase() === `/${command}`.toLowerCase()
    );
    if (!foundRow) {
      return `❌ Tidak ditemukan data untuk perintah *${command}*`;
    }
    const dataText = foundRow[1] || "(kosong)";
    const note = foundRow[2] ? `\n📝 Catatan: ${foundRow[2]}` : "";
    return `📄 *${command.toUpperCase()}*\n\n${dataText}${note}`;
  } catch (err) {
    console.error("❌ ERROR getDataByCommand:", err.message);
    return "⚠️ Terjadi kesalahan saat mengambil data dari Google Sheets.";
  }
}

// === MESSAGE HANDLER ===
bot.on("message", async (message) => {
  if (!message || !message.text) return;

  const chatId = message.chat.id;
  const text = message.text.trim().toLowerCase();

  if (text === "/start") {
    bot.sendMessage(
      chatId,
      `👋 Halo ${message.from.first_name}! Ketik /help untuk melihat daftar perintah.`,
      { parse_mode: "Markdown" }
    );
  } else if (text === "/help") {
    const rows = await getSheetData();
    const commands = rows
      .filter((row) => row[0] && row[0].startsWith("/"))
      .map((row) => row[0])
      .join("\n");
    bot.sendMessage(chatId, `📘 *Daftar Perintah:*\n${commands}`, {
      parse_mode: "Markdown",
    });
  } else if (text.startsWith("/")) {
    const command = text.slice(1);
    const data = await getDataByCommand(command);
    bot.sendMessage(chatId, data, { parse_mode: "Markdown" });
  }
});

// === Error handler buat polling errors (network glitch, dll) ===
bot.on("polling_error", (err) => {
  console.error("⚠️ Polling error:", err.code, "-", err.message);
});

// === Start polling ===
(async () => {
  try {
    // Bersihin webhook lama dari setup Render
    await bot.deleteWebHook({ drop_pending_updates: true });
    // Start long polling
    await bot.startPolling();
    console.log("✅ Bot INCES aktif (polling mode)");
  } catch (err) {
    console.error("❌ Gagal start bot:", err.message);
    process.exit(1);
  }
})();
