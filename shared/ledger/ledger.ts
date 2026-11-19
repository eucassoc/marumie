/**
 * 公開する取引の「記録」（deedlog のチェーン）の形式と、その読み書きの純粋な処理。
 *
 * 記録に入るのは、公開サイトに出している取引 1 件ごとのダイジェストだけで、取引の中身は入らない。
 * 何をダイジェストにするか（LedgerPublicTransaction）は公開サイトの CSV と同じ項目に取引No を足したもので、
 * 公開データを持つ人なら誰でも同じ値を計算できる。
 *
 * 形式は deedlog の evidence chain v0.1（https://github.com/eucassoc/deedlog/blob/main/spec/evidence-chain.md）。
 * ダイジェストは行のバイト列そのものから計算するため、行は一度作ったら作り直さず、文字列のまま保存する。
 */
import { createHash } from "node:crypto";

export const LEDGER_SPEC = "deedlog/v0.1";
const LEDGER_COLLECTOR = "marumie-ledger/0.1";

export type LedgerEvent =
  | "ledger.opened"
  | "transaction.created"
  | "transaction.updated"
  | "transaction.deleted";

/** 公開サイトが 1 件の取引について見せているもの。記録のダイジェストはこの JSON から計算する */
export interface LedgerPublicTransaction {
  year: number;
  no: string;
  date: string;
  type: "income" | "expense";
  amount: number;
  account: string;
  friendly_category: string;
  label: string;
}

/** LedgerPublicTransaction を作るのに要る取引の項目 */
export interface LedgerSourceTransaction {
  financial_year: number;
  transaction_no: string;
  transaction_date: Date;
  transaction_type: string;
  debit_account: string;
  debit_amount: number;
  credit_account: string;
  credit_amount: number;
  friendly_category: string;
  label: string;
}

/** 記録の先頭に置く宣言。何を記録するかを、記録そのものに固定する */
export const LEDGER_DECLARATION = JSON.stringify({
  records:
    "Every creation, update and deletion of a transaction shown on the public site (income and expense).",
  subject:
    "sha256 of the JSON below for that transaction, keys in this order, no whitespace, UTF-8.",
  fields: ["year", "no", "date", "type", "amount", "account", "friendly_category", "label"],
  deleted: "A deletion carries the digest of the transaction as it was last recorded.",
});

export function sha256Hex(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

/** 公開サイトに出るのは収入と支出だけ（相殺・非現金の仕訳は出ない）。記録するのも同じ範囲にする */
export function isLedgerTransactionType(type: string): type is "income" | "expense" {
  return type === "income" || type === "expense";
}

export function toLedgerPublicTransaction(
  tx: LedgerSourceTransaction,
): LedgerPublicTransaction | null {
  if (!isLedgerTransactionType(tx.transaction_type)) return null;
  const income = tx.transaction_type === "income";
  return {
    year: tx.financial_year,
    no: tx.transaction_no,
    date: new Date(tx.transaction_date).toISOString().split("T")[0],
    type: tx.transaction_type,
    amount: Number(income ? tx.credit_amount : tx.debit_amount),
    account: income ? tx.credit_account : tx.debit_account,
    friendly_category: tx.friendly_category ?? "",
    label: tx.label ?? "",
  };
}

/** ダイジェストの元になる文字列。キーの順序を固定するため、項目を並べて書く */
export function ledgerBody(view: LedgerPublicTransaction): string {
  return JSON.stringify({
    year: view.year,
    no: view.no,
    date: view.date,
    type: view.type,
    amount: view.amount,
    account: view.account,
    friendly_category: view.friendly_category,
    label: view.label,
  });
}

export function ledgerKey(year: number | string, no: string): string {
  return `${year}/${no}`;
}

export interface LedgerSubject {
  digest: string;
  size: number;
}

export function ledgerSubject(body: string): LedgerSubject {
  return { digest: sha256Hex(body), size: Buffer.byteLength(body, "utf8") };
}

export interface LedgerLineInput {
  chain: string;
  seq: number;
  /** 直前の行（seq 0 では null） */
  prevLine: string | null;
  collectedAt: Date;
  subject: LedgerSubject;
  meta: Record<string, string>;
}

/** 1 行を作る。キーの順序は deedlog のサンプルに合わせる */
export function buildLedgerLine(input: LedgerLineInput): string {
  const record: Record<string, unknown> = {
    spec: LEDGER_SPEC,
    chain: input.chain,
    seq: input.seq,
  };
  if (input.prevLine !== null) record.prev = `sha256:${sha256Hex(input.prevLine)}`;
  record.collected_at = input.collectedAt.toISOString().replace(/\.\d{3}Z$/, "Z");
  record.source = { type: "marumie", id: "admin", collector: LEDGER_COLLECTOR };
  record.subject = {
    media_type: "application/json",
    size: input.subject.size,
    digest: { sha256: input.subject.digest },
  };
  record.meta = input.meta;
  return JSON.stringify(record);
}

export interface LedgerEntry {
  seq: number;
  collectedAt: string;
  event: LedgerEvent;
  org: string | null;
  year: string | null;
  no: string | null;
  digest: string;
  size: number;
  replaces: string | null;
}

export function parseLedgerLine(line: string): LedgerEntry {
  const r = JSON.parse(line) as {
    seq: number;
    collected_at: string;
    subject: { size: number; digest: { sha256: string } };
    meta?: Record<string, string>;
  };
  const meta = r.meta ?? {};
  return {
    seq: r.seq,
    collectedAt: r.collected_at,
    event: meta.event as LedgerEvent,
    org: meta.org ?? null,
    year: meta.year ?? null,
    no: meta.no ?? null,
    digest: r.subject.digest.sha256,
    size: r.subject.size,
    replaces: meta.replaces ?? null,
  };
}

/** 記録を先頭から読んで、ある団体について「いま記録上あるはずの取引」のダイジェストを求める。削除の記録には、消した取引の最後のダイジェストが載る */
export function replayLedger(entries: LedgerEntry[], org: string): Map<string, LedgerSubject> {
  const state = new Map<string, LedgerSubject>();
  for (const e of entries) {
    if (e.org !== org || e.year === null || e.no === null) continue;
    const key = ledgerKey(e.year, e.no);
    if (e.event === "transaction.deleted") state.delete(key);
    else if (e.event === "transaction.created" || e.event === "transaction.updated")
      state.set(key, { digest: e.digest, size: e.size });
  }
  return state;
}

export interface LedgerChange {
  event: Exclude<LedgerEvent, "ledger.opened">;
  year: string;
  no: string;
  subject: LedgerSubject;
  replaces: string | null;
}

/**
 * いまの公開データと記録上の状態を比べて、記録に足すべき出来事を求める。
 * 結果の順序は取引のキー順で、同じ入力からは必ず同じ並びになる。
 */
export function diffLedger(
  current: Map<string, { year: number; no: string; body: string }>,
  recorded: Map<string, LedgerSubject>,
): LedgerChange[] {
  const changes: LedgerChange[] = [];
  const keys = [...new Set([...current.keys(), ...recorded.keys()])].sort((a, b) =>
    a.localeCompare(b, "en", { numeric: true }),
  );
  for (const key of keys) {
    const now = current.get(key);
    const before = recorded.get(key);
    if (now) {
      const subject = ledgerSubject(now.body);
      if (before === undefined) {
        changes.push({
          event: "transaction.created",
          year: String(now.year),
          no: now.no,
          subject,
          replaces: null,
        });
      } else if (before.digest !== subject.digest) {
        changes.push({
          event: "transaction.updated",
          year: String(now.year),
          no: now.no,
          subject,
          replaces: before.digest,
        });
      }
    } else if (before !== undefined) {
      const [year, ...rest] = key.split("/");
      changes.push({
        event: "transaction.deleted",
        year,
        no: rest.join("/"),
        subject: before,
        replaces: null,
      });
    }
  }
  return changes;
}
