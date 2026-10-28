// Screenshots of the built app with fictional data (Supabase calls are mocked).
// Usage: node tests/screens/capture.mjs <base-url> <out-dir>
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import * as data from "./fixtures.mjs";

const [base = "http://localhost:4173", out = "screens"] = process.argv.slice(2);
mkdirSync(out, { recursive: true });

const REF = "uynegxjtcthcmqgbosvh";
const now = Math.floor(Date.now() / 1000);
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const jwt = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sub: data.user.id, exp: now + 86400 * 365, role: "authenticated" })}.sig`;
const session = {
  access_token: jwt,
  token_type: "bearer",
  expires_in: 86400 * 365,
  expires_at: now + 86400 * 365,
  refresh_token: "demo",
  user: data.user,
};

const pages = [
  ["dashboard", "/"],
  ["reconcile-review", "/reconcile"],
  ["reconcile-unmatched", "/reconcile?tab=unmatched"],
  ["reconcile-matched", "/reconcile?tab=matched"],
  ["expenses", "/expenses"],
  ["notes", "/notes"],
  ["advance", "/advance"],
];

const browser = await chromium.launch();
const errors = [];
for (const [device, viewport] of [["desktop", { width: 1280, height: 900 }], ["mobile", { width: 390, height: 844 }]]) {
  const context = await browser.newContext({ viewport, locale: "fr-FR", timezoneId: "Europe/Paris" });
  await context.addInitScript(([key, value]) => localStorage.setItem(key, value), [`sb-${REF}-auth-token`, JSON.stringify(session)]);
  await context.route(`https://${REF}.supabase.co/**`, async (route) => {
    const url = new URL(route.request().url());
    const accept = route.request().headers()["accept"] ?? "";
    if (url.pathname.startsWith("/auth/v1/user")) return route.fulfill({ json: data.user });
    if (url.pathname.startsWith("/rest/v1/")) {
      const table = url.pathname.split("/").pop();
      const rows = data[table] ?? [];
      if (accept.includes("vnd.pgrst.object")) return route.fulfill({ json: rows[0] ?? null });
      return route.fulfill({ json: rows, headers: { "content-range": `0-${Math.max(rows.length - 1, 0)}/${rows.length}` } });
    }
    return route.fulfill({ json: {} });
  });
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(`${device} ${page.url()}: ${e.message}`));
  page.on("console", (m) => m.type() === "error" && errors.push(`${device} console: ${m.text()}`));
  for (const [name, path] of pages) {
    if (device === "mobile" && !["dashboard", "reconcile-review", "reconcile-unmatched", "expenses"].includes(name)) continue;
    await page.goto(base + path, { waitUntil: "networkidle" });
    await page.waitForTimeout(400);
    if (name === "reconcile-unmatched") {
      // Show the selection bar: one note and one expense ticked.
      const boxes = page.getByRole("checkbox");
      if ((await boxes.count()) > 1) {
        await boxes.first().click();
        await boxes.last().click();
      }
    }
    if (name === "notes") {
      const first = page.locator("main button[aria-expanded]").nth(1);
      if (await first.count()) await first.click();
    }
    await page.screenshot({ path: `${out}/${device}-${name}.png`, fullPage: true });
    if (name === "reconcile-unmatched" && device === "desktop") {
      await page.getByRole("checkbox").last().click();
      const pay = page.getByRole("button", { name: "Payée autrement…" });
      if (await pay.count()) {
        await pay.click();
        await page.waitForTimeout(300);
        await page.screenshot({ path: `${out}/${device}-reconcile-pay.png` });
        await page.keyboard.press("Escape");
      }
    }
    if (name === "notes" && device === "desktop") {
      const row = page.locator('tr[role="button"]').first();
      if (await row.count()) {
        await row.click();
        await page.waitForTimeout(300);
        await page.screenshot({ path: `${out}/${device}-note-details.png` });
        await page.keyboard.press("Escape");
      }
    }
    if (name === "reconcile-review" && device === "desktop") {
      const other = page.getByRole("button", { name: "Autre dépense…" }).first();
      if (await other.count()) {
        await other.click();
        await page.waitForTimeout(300);
        await page.screenshot({ path: `${out}/${device}-reconcile-pick.png` });
        await page.keyboard.press("Escape");
      }
    }
  }
  await context.close();
}
await browser.close();
if (errors.length) {
  console.log(errors.join("\n"));
  for (const e of errors.slice(0, 20)) console.log(`::warning::${e.replace(/\n/g, " ")}`);
}
