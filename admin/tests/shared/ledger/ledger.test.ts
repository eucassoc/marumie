import { createHash } from "node:crypto";
import {
  buildLedgerLine,
  diffLedger,
  ledgerBody,
  ledgerSubject,
  parseLedgerLine,
  replayLedger,
  toLedgerPublicTransaction,
  type LedgerSourceTransaction,
} from "@/shared/ledger/ledger";

const expense: LedgerSourceTransaction = {
  financial_year: 2026,
  transaction_no: "7002",
  transaction_date: new Date("2026-04-25T00:00:00Z"),
  transaction_type: "expense",
  debit_account: "事務所費",
  debit_amount: 80000,
  credit_account: "普通預金",
  credit_amount: 80000,
  friendly_category: "家賃",
  label: "",
};

describe("公開する取引のダイジェスト", () => {
  it("支出は借方の科目と金額、収入は貸方の科目と金額を、公開サイトの CSV と同じ向きで取る", () => {
    expect(toLedgerPublicTransaction(expense)).toEqual({
      year: 2026,
      no: "7002",
      date: "2026-04-25",
      type: "expense",
      amount: 80000,
      account: "事務所費",
      friendly_category: "家賃",
      label: "",
    });
    const income = toLedgerPublicTransaction({
      ...expense,
      transaction_type: "income",
      debit_account: "普通預金",
      credit_account: "個人からの寄附",
    });
    expect(income?.account).toBe("個人からの寄附");
  });

  it("公開サイトに出ない仕訳（相殺・非現金）は記録の対象にしない", () => {
    expect(toLedgerPublicTransaction({ ...expense, transaction_type: "offset_expense" })).toBeNull();
    expect(toLedgerPublicTransaction({ ...expense, transaction_type: "non_cash_journal" })).toBeNull();
  });

  it("ダイジェストの元は、キーの順序が決まった空白なしの JSON で、外の人が同じ値を計算できる", () => {
    const view = toLedgerPublicTransaction(expense);
    if (!view) throw new Error("unreachable");
    const body = ledgerBody(view);
    expect(body).toBe(
      '{"year":2026,"no":"7002","date":"2026-04-25","type":"expense","amount":80000,"account":"事務所費","friendly_category":"家賃","label":""}',
    );
    expect(ledgerSubject(body)).toEqual({
      digest: createHash("sha256").update(body, "utf8").digest("hex"),
      size: Buffer.byteLength(body, "utf8"),
    });
  });
});

describe("記録の行", () => {
  const subject = ledgerSubject("a");
  const first = buildLedgerLine({
    chain: "example.test/ledger",
    seq: 0,
    prevLine: null,
    collectedAt: new Date("2026-11-19T05:00:00.123Z"),
    subject,
    meta: { event: "ledger.opened" },
  });

  it("先頭の行は prev を持たず、時刻は秒までの UTC", () => {
    const record = JSON.parse(first);
    expect(record).not.toHaveProperty("prev");
    expect(record.spec).toBe("deedlog/v0.1");
    expect(record.collected_at).toBe("2026-11-19T05:00:00Z");
  });

  it("次の行は、直前の行のバイト列の SHA-256 を prev に持つ", () => {
    const second = buildLedgerLine({
      chain: "example.test/ledger",
      seq: 1,
      prevLine: first,
      collectedAt: new Date("2026-11-19T05:00:01Z"),
      subject,
      meta: { event: "transaction.created", org: "o", year: "2026", no: "1" },
    });
    expect(JSON.parse(second).prev).toBe(
      `sha256:${createHash("sha256").update(first, "utf8").digest("hex")}`,
    );
    expect(parseLedgerLine(second)).toMatchObject({ seq: 1, org: "o", year: "2026", no: "1" });
  });
});

describe("公開データと記録の差", () => {
  const current = (amount: number) => {
    const view = toLedgerPublicTransaction({ ...expense, debit_amount: amount });
    if (!view) throw new Error("unreachable");
    return new Map([["2026/7002", { year: 2026, no: "7002", body: ledgerBody(view) }]]);
  };

  it("記録にない取引は追加、内容が変わった取引は修正、公開から消えた取引は削除になる", () => {
    const created = diffLedger(current(80000), new Map());
    expect(created.map((c) => c.event)).toEqual(["transaction.created"]);

    const recorded = new Map([["2026/7002", created[0].subject]]);
    expect(diffLedger(current(80000), recorded)).toEqual([]);

    const updated = diffLedger(current(85000), recorded);
    expect(updated).toHaveLength(1);
    expect(updated[0]).toMatchObject({
      event: "transaction.updated",
      replaces: created[0].subject.digest,
    });

    const deleted = diffLedger(new Map(), recorded);
    expect(deleted).toEqual([
      { event: "transaction.deleted", year: "2026", no: "7002", subject: created[0].subject, replaces: null },
    ]);
  });

  it("記録を先頭から読むと、団体ごとに「いまあるはずの取引」が求まる", () => {
    const entry = (seq: number, event: string, org: string, digest: string) => ({
      seq,
      collectedAt: "2026-11-19T05:00:00Z",
      event: event as never,
      org,
      year: "2026",
      no: "1",
      digest,
      size: 1,
      replaces: null,
    });
    const entries = [
      entry(1, "transaction.created", "a", "d1"),
      entry(2, "transaction.created", "b", "d2"),
      entry(3, "transaction.updated", "a", "d3"),
      entry(4, "transaction.deleted", "b", "d2"),
    ];
    expect(replayLedger(entries, "a")).toEqual(new Map([["2026/1", { digest: "d3", size: 1 }]]));
    expect(replayLedger(entries, "b")).toEqual(new Map());
  });
});
