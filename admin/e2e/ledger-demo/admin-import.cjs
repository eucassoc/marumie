// デモ用: 管理画面にログインし、MFクラウド会計形式の CSV を取り込む（人が画面で行う操作をそのまま行う）。
//   node admin/e2e/ledger-demo/admin-import.cjs <年度> <CSVファイル> [スクリーンショットの保存先]
const { chromium } = require("@playwright/test");
const { readFileSync } = require("node:fs");

(async () => {
  const [year, csvPath, shot] = process.argv.slice(2);
  const admin = process.env.ADMIN_URL || "http://localhost:3001";
  // 手元の Chromium を使うときは PW_CHROMIUM_PATH にその場所を入れる（未設定なら Playwright が入れたものを使う）
  const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM_PATH || undefined });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  try {
    await page.goto(`${admin}/login`);
    await page.getByLabel("Email").fill("foo@example.com");
    await page.getByLabel("Password").fill("foo@example.com");
    await page.getByRole("button", { name: "ログイン" }).click();
    await page.waitForURL(`${admin}/`);

    await page.getByRole("button", { name: "現在の対象を切り替え" }).click();
    await page.getByRole("dialog").getByRole("button", { name: `サンプル党／${year}年度` }).click();
    await page.waitForURL(`${admin}/political-organizations`);

    await page.goto(`${admin}/upload-csv`);
    await page.getByRole("main").getByText(`サンプル党／${year}年度`).first().waitFor();
    for (let attempt = 0; ; attempt++) {
      await page.getByLabel("CSVファイル", { exact: true }).setInputFiles({
        name: "import.csv",
        mimeType: "text/csv",
        buffer: readFileSync(csvPath),
      });
      try {
        await page.getByRole("button", { name: "プレビューを表示" }).click({ timeout: 5000 });
        await page.getByRole("heading", { name: "取り込みプレビュー" }).waitFor({ timeout: 10000 });
        break;
      } catch (error) {
        if (attempt >= 4) throw error;
      }
    }
    if (shot) await page.screenshot({ path: shot.replace(/\.png$/, "-preview.png"), fullPage: true });
    await page.getByRole("button", { name: "このデータを保存する" }).click();
    const status = page.getByRole("status").filter({ hasText: "件を処理し" });
    await status.waitFor({ timeout: 60000 });
    console.log((await status.innerText()).split("\n")[0]);
    if (shot) await page.screenshot({ path: shot, fullPage: true });
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
