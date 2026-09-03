import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const METADATA_URL =
  "https://raw.githubusercontent.com/xsalazar/emoji-kitchen-backend/main/app/metadata.json";
const TARGET_DIR = path.resolve(__dirname, "../data");
const TARGET_FILE = path.join(TARGET_DIR, "metadata.json");

async function downloadMetadata() {
  console.log(`Downloading metadata from ${METADATA_URL}...`);
  if (!fs.existsSync(TARGET_DIR)) {
    fs.mkdirSync(TARGET_DIR, { recursive: true });
  }

  const response = await fetch(METADATA_URL);
  if (!response.ok) {
    throw new Error(`Failed to fetch metadata: ${response.status} ${response.statusText}`);
  }

  const text = await response.text();
  fs.writeFileSync(TARGET_FILE, text, "utf-8");
  console.log(
    `Successfully downloaded metadata to ${TARGET_FILE} (${(text.length / (1024 * 1024)).toFixed(2)} MB)`
  );
}

downloadMetadata().catch((err) => {
  console.error("Error downloading metadata:", err);
  process.exit(1);
});
