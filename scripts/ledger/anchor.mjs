// 記録（deedlog のチェーン）にチェックポイントを作り、連署サーバーの連署を受けて保存する。
// 定期的に（たとえば 1 時間ごとに）動かす。署名の鍵を持つのはこのジョブだけで、アプリは鍵を持たない。
//
//   node scripts/ledger/anchor.mjs
//
// 環境変数:
//   DATABASE_URL            記録とチェックポイントのあるデータベース
//   LEDGER_OPERATOR_KEY     運営者の秘密鍵のファイル（dlog keygen が作る .key）
//   LEDGER_OPERATOR_VKEY    運営者の公開鍵のファイル（.vkey）
//   LEDGER_WITNESSES        連署サーバー。「公開鍵のファイル=URL」をカンマ区切りで
//   DLOG                    dlog コマンド（省略時は PATH の dlog）
//
// 連署サーバーは、前に連署したチェックポイントと矛盾する記録には連署しない。
// 記録が書き換えられていると、ここで失敗し、チェックポイントは保存されない。
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import "dotenv/config";

const dlog = process.env.DLOG || "dlog";
const need = (name) => {
  const value = process.env[name];
  if (!value) {
    console.error(`${name} が設定されていません`);
    process.exit(2);
  }
  return value;
};
const operatorKey = need("LEDGER_OPERATOR_KEY");
const operatorVkey = need("LEDGER_OPERATOR_VKEY");
const witnesses = need("LEDGER_WITNESSES").split(",").filter(Boolean);

const prisma = new PrismaClient();
const dir = mkdtempSync(join(tmpdir(), "ledger-anchor-"));
try {
  const records = await prisma.ledgerRecord.findMany({ orderBy: { seq: "asc" } });
  if (records.length === 0) {
    console.log("記録がまだありません");
    process.exit(0);
  }
  const latest = await prisma.ledgerCheckpoint.findFirst({ orderBy: [{ size: "desc" }, { id: "desc" }] });
  if (latest && latest.size === records.length) {
    console.log(`新しい記録はありません（${records.length} 件まで連署済み）`);
    process.exit(0);
  }

  const chain = join(dir, "chain.jsonl");
  const checkpoint = join(dir, "checkpoint");
  const cosigned = join(dir, "checkpoint.cosigned");
  writeFileSync(chain, `${records.map((r) => r.line).join("\n")}\n`);
  writeFileSync(checkpoint, execFileSync(dlog, ["checkpoint", "-key", operatorKey, chain]));

  const args = ["cosign", "-key", operatorVkey];
  for (const witness of witnesses) args.push("-witness", witness);
  args.push("-out", cosigned, chain, checkpoint);
  try {
    execFileSync(dlog, args, { stdio: ["ignore", "inherit", "pipe"] });
  } catch (error) {
    console.error("連署を受けられませんでした。チェックポイントは保存していません。");
    console.error(String(error.stderr || error.message).trim());
    process.exit(1);
  }

  await prisma.ledgerCheckpoint.create({
    data: { size: records.length, note: readFileSync(cosigned, "utf8") },
  });
  console.log(`${records.length} 件までのチェックポイントに連署を受けて保存しました`);
} finally {
  rmSync(dir, { recursive: true, force: true });
  await prisma.$disconnect();
}
