// デモ用: 運営者が「修正した事実そのもの」を記録から消そうとする場面を再現する。
// 指定した取引の「修正」の記録を抜き、最初の「追加」の記録を修正後の内容に差し替えたうえで、
// それ以降の行のつながり（prev）をすべて作り直す。こうして作った記録は、それだけを見れば正しい鎖になる。
//
//   node scripts/ledger/demo/rewrite-history.mjs <団体のslug> <年度> <取引No>
import { createHash } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import "dotenv/config";

const [org, year, no] = process.argv.slice(2);
const prisma = new PrismaClient();
const sha256 = (text) => createHash("sha256").update(text, "utf8").digest("hex");

try {
  const records = (await prisma.ledgerRecord.findMany({ orderBy: { seq: "asc" } })).map((r) =>
    JSON.parse(r.line),
  );
  const mine = (r, event) =>
    r.meta?.org === org && r.meta?.year === year && r.meta?.no === no && r.meta?.event === event;
  const updated = records.findLast((r) => mine(r, "transaction.updated"));
  const created = records.find((r) => mine(r, "transaction.created"));
  if (!updated || !created) throw new Error("書き換える対象の記録が見つかりません");

  created.subject = updated.subject;
  const kept = records.filter((r) => r !== updated);
  const lines = [];
  kept.forEach((r, seq) => {
    const { spec, chain, collected_at, source, subject, meta } = r;
    const next = { spec, chain, seq };
    if (seq > 0) next.prev = `sha256:${sha256(lines[seq - 1])}`;
    lines.push(JSON.stringify({ ...next, collected_at, source, subject, meta }));
  });

  await prisma.$transaction([
    prisma.ledgerRecord.deleteMany(),
    prisma.ledgerRecord.createMany({ data: lines.map((line, seq) => ({ seq, line })) }),
  ]);
  console.log(`記録を書き換えました: ${records.length} 件 → ${lines.length} 件（取引No ${no} の「修正」を消去）`);
} finally {
  await prisma.$disconnect();
}
