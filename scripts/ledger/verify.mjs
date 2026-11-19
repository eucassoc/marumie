// 公開サイトだけを相手に、公開中の取引と記録が合っているかを確かめる。運営者のデータベースには触らない。
//
//   node scripts/ledger/verify.mjs --url https://example.org --org sample-party --year 2025 \
//        --key operator.vkey --witness witness.vkey [--quorum 1]
//
// 確かめること:
//   1. 記録が、運営者が署名し連署サーバーが連署したチェックポイントと一致する（dlog verify）
//   2. 公開中の取引が 1 件ずつ、記録の最後の状態と一致する
// 食い違いがあれば、記録の何番かを添えて示し、終了コード 1 で終わる。
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const values = [];
  for (let i = 0; i < args.length; i++) if (args[i] === `--${name}`) values.push(args[i + 1]);
  return values.length ? values : fallback === undefined ? [] : [fallback];
};
const url = option("url")[0]?.replace(/\/$/, "");
const org = option("org")[0];
const year = option("year")[0];
const key = option("key")[0];
const witnessKeys = option("witness");
const quorum = option("quorum", String(witnessKeys.length))[0];
const dlog = process.env.DLOG || "dlog";
if (!url || !org || !year || !key) {
  console.error("使い方: verify.mjs --url URL --org SLUG --year YEAR --key operator.vkey [--witness w.vkey]... [--quorum N]");
  process.exit(2);
}

const get = async (path) => {
  const res = await fetch(`${url}${path}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  return res.text();
};

// 記録のダイジェストの元。キーはこの順、空白なし（公開サイトの transactions.json と同じ項目）
const body = (t) =>
  JSON.stringify({
    year: t.year,
    no: t.no,
    date: t.date,
    type: t.type,
    amount: t.amount,
    account: t.account,
    friendly_category: t.friendly_category,
    label: t.label,
  });
const sha256 = (text) => createHash("sha256").update(text, "utf8").digest("hex");

const dir = mkdtempSync(join(tmpdir(), "ledger-verify-"));
let failed = false;
try {
  const [chainText, checkpointText, exportText] = await Promise.all([
    get("/ledger/chain.jsonl"),
    get("/ledger/checkpoint"),
    get(`/o/${org}/${year}/ledger/transactions.json`),
  ]);
  const chain = join(dir, "chain.jsonl");
  const checkpoint = join(dir, "checkpoint");
  writeFileSync(chain, chainText);
  writeFileSync(checkpoint, checkpointText);

  // 1. 記録とチェックポイント
  const verifyArgs = ["verify", "-checkpoint", checkpoint, "-key", key];
  for (const w of witnessKeys) verifyArgs.push("-witness", w);
  if (witnessKeys.length) verifyArgs.push("-quorum", quorum);
  verifyArgs.push(chain);
  let summary;
  try {
    summary = JSON.parse(execFileSync(dlog, verifyArgs, { stdio: ["ignore", "pipe", "pipe"] }).toString());
  } catch (error) {
    console.log("✗ 記録が、連署されたチェックポイントと一致しません");
    console.log(`  ${String(error.stderr || error.message).trim().split("\n").join("\n  ")}`);
    process.exit(1);
  }
  const checkpointSize = Number(checkpointText.split("\n")[1]);
  console.log(`✓ 記録は連署されたチェックポイントと一致します（${summary.chain}、${summary.count} 件、うち ${checkpointSize} 件まで連署済み）`);
  if (summary.count > checkpointSize) {
    console.log(`  ・まだ連署されていない記録が ${summary.count - checkpointSize} 件あります`);
  }

  // 2. 公開中の取引と、記録の最後の状態
  const recorded = new Map();
  for (const line of chainText.split("\n").filter(Boolean)) {
    const r = JSON.parse(line);
    const m = r.meta || {};
    if (m.org !== org || m.year !== String(year)) continue;
    if (m.event === "transaction.deleted") recorded.delete(m.no);
    else if (m.event === "transaction.created" || m.event === "transaction.updated")
      recorded.set(m.no, { digest: r.subject.digest.sha256, seq: r.seq });
  }
  const published = JSON.parse(exportText).transactions;
  const problems = [];
  for (const t of published) {
    const entry = recorded.get(t.no);
    if (!entry) problems.push(`取引No ${t.no}: 公開されているが、記録にない`);
    else if (entry.digest !== sha256(body(t)))
      problems.push(`取引No ${t.no}: 公開中の内容が記録（${entry.seq} 番）と違う`);
    recorded.delete(t.no);
  }
  for (const [no, entry] of recorded)
    problems.push(`取引No ${no}: 記録（${entry.seq} 番）にあるが、公開されていない`);

  if (problems.length === 0) {
    console.log(`✓ 公開中の取引 ${published.length} 件は、すべて記録と一致します（${org}・${year}年）`);
  } else {
    failed = true;
    console.log(`✗ 公開中の取引と記録が ${problems.length} 件食い違っています（${org}・${year}年）`);
    for (const p of problems) console.log(`  ・${p}`);
  }
} finally {
  rmSync(dir, { recursive: true, force: true });
}
process.exit(failed ? 1 : 0);
