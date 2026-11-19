// デモ用: 公開サイトの「更新の記録」ページを撮る。
//   node admin/e2e/ledger-demo/shot-public.cjs <団体のslug> <年度> <保存先.png>
const { chromium } = require("@playwright/test");

(async () => {
  const [slug, year, out] = process.argv.slice(2);
  const base = process.env.WEBAPP_URL || "http://localhost:3000";
  // 手元の Chromium を使うときは PW_CHROMIUM_PATH にその場所を入れる（未設定なら Playwright が入れたものを使う）
  const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM_PATH || undefined });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2 });
  await page.goto(`${base}/o/${slug}/${year}/ledger`, { waitUntil: "networkidle" });
  await page.screenshot({ path: out, fullPage: true });
  await browser.close();
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
