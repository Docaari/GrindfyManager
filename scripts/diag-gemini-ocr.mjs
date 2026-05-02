// Diagnostico OCR Gemini — replica exato chamada do hudOcrService
import "dotenv/config";
import fs from "fs";
import path from "path";

const apiKey = process.env.GOOGLE_API_KEY ?? process.env.GEMINI_API_KEY;
const modelName = process.env.OCR_MODEL || "gemini-2.5-flash";
const provider = (process.env.OCR_PROVIDER ?? "anthropic").toLowerCase();

console.log("=== ENV ===");
console.log("OCR_PROVIDER:", provider);
console.log("OCR_MODEL:", modelName);
console.log("GOOGLE_API_KEY:", apiKey ? `set (len ${apiKey.length})` : "MISSING");

if (!apiKey) process.exit(1);

const imgArg = process.argv[2];
if (!imgArg) {
  console.error("usage: node scripts/diag-gemini-ocr.mjs <path-to-image>");
  process.exit(1);
}
const buffer = fs.readFileSync(path.resolve(imgArg));
const mime = imgArg.endsWith(".png") ? "image/png" : imgArg.endsWith(".webp") ? "image/webp" : "image/jpeg";
console.log("Image:", imgArg, "size:", buffer.length, "mime:", mime);

const mod = await import("@google/generative-ai");
const GoogleGenerativeAI = mod.GoogleGenerativeAI ?? mod.default;
const client = new GoogleGenerativeAI(apiKey);
const model = client.getGenerativeModel({ model: modelName });

const promptMod = await import("../server/services/hudOcrPrompt.ts").catch(() => null);
const SYSTEM = promptMod?.OCR_SYSTEM_PROMPT ?? "Extract HUD stats as JSON {stats:[{label,value,confidence}]}";
console.log("Prompt source:", promptMod ? "imported" : "fallback");

try {
  console.time("gemini-call");
  const result = await model.generateContent([
    { text: SYSTEM },
    { inlineData: { mimeType: mime, data: buffer.toString("base64") } },
    { text: "Extraia os pares label/value desta imagem seguindo o schema. Retorne apenas JSON." },
  ]);
  console.timeEnd("gemini-call");
  const text = result?.response?.text?.() ?? "";
  console.log("=== RESPONSE TEXT ===");
  console.log(text.slice(0, 2000));
  console.log("=== USAGE ===");
  console.log(JSON.stringify(result?.response?.usageMetadata ?? {}, null, 2));
} catch (e) {
  console.error("=== GEMINI ERROR ===");
  console.error("name:", e?.name);
  console.error("message:", e?.message);
  console.error("status:", e?.status ?? e?.response?.status);
  console.error("stack:", e?.stack?.split("\n").slice(0, 5).join("\n"));
  if (e?.response?.data) console.error("data:", JSON.stringify(e.response.data).slice(0, 1000));
  process.exit(2);
}
