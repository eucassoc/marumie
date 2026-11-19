import { SyncLedgerUsecase } from "@/server/contexts/shared/application/usecases/sync-ledger-usecase";
import type {
  ILedgerRepository,
  LedgerOrganizationTransactions,
} from "@/server/contexts/shared/domain/repositories/ledger-repository.interface";
import { parseLedgerLine, type LedgerSourceTransaction } from "@/shared/ledger/ledger";

const transaction = (no: string, amount: number): LedgerSourceTransaction => ({
  financial_year: 2026,
  transaction_no: no,
  transaction_date: new Date("2026-04-25T00:00:00Z"),
  transaction_type: "expense",
  debit_account: "事務所費",
  debit_amount: amount,
  credit_account: "普通預金",
  credit_amount: amount,
  friendly_category: "家賃",
  label: "",
});

/** 行をメモリに持つだけのリポジトリ。公開データは published を書き換えて変える */
class InMemoryLedgerRepository implements ILedgerRepository {
  lines: string[] = [];
  published: LedgerOrganizationTransactions[] = [];

  async findPublicTransactions() {
    return this.published;
  }

  async append(build: (lines: string[]) => string[]) {
    const added = build([...this.lines]);
    this.lines.push(...added);
    return added;
  }
}

describe("SyncLedgerUsecase", () => {
  const setup = () => {
    const repository = new InMemoryLedgerRepository();
    const usecase = new SyncLedgerUsecase(
      repository,
      "example.test/ledger",
      () => new Date("2026-11-19T05:00:00Z"),
    );
    const events = () => repository.lines.map(parseLedgerLine).map((e) => `${e.event} ${e.no ?? ""}`.trim());
    return { repository, usecase, events };
  };

  it("最初の実行で記録を開き、公開中の取引をすべて追加として記録する", async () => {
    const { repository, usecase, events } = setup();
    repository.published = [{ slug: "sample", transactions: [transaction("2", 100), transaction("1", 200)] }];

    expect(await usecase.execute()).toEqual({ appended: 3 });
    expect(events()).toEqual(["ledger.opened", "transaction.created 1", "transaction.created 2"]);
    expect(repository.lines.map((line) => JSON.parse(line).seq)).toEqual([0, 1, 2]);
  });

  it("公開データが変わっていなければ、何も足さない", async () => {
    const { repository, usecase } = setup();
    repository.published = [{ slug: "sample", transactions: [transaction("1", 200)] }];
    await usecase.execute();

    expect(await usecase.execute()).toEqual({ appended: 0 });
    expect(repository.lines).toHaveLength(2);
  });

  it("金額を直すと修正、取引を消すと削除が、元のダイジェストとともに残る", async () => {
    const { repository, usecase, events } = setup();
    repository.published = [{ slug: "sample", transactions: [transaction("1", 200), transaction("2", 100)] }];
    await usecase.execute();
    const before = parseLedgerLine(repository.lines[1]).digest;

    repository.published = [{ slug: "sample", transactions: [transaction("1", 250)] }];
    expect(await usecase.execute()).toEqual({ appended: 2 });

    expect(events().slice(3)).toEqual(["transaction.updated 1", "transaction.deleted 2"]);
    expect(parseLedgerLine(repository.lines[3]).replaces).toBe(before);
    // 行は足すだけで、すでにある行は変えない
    expect(parseLedgerLine(repository.lines[1]).digest).toBe(before);
  });

  it("団体が違えば、同じ年度・取引No でも別の取引として記録する", async () => {
    const { repository, usecase } = setup();
    repository.published = [
      { slug: "a", transactions: [transaction("1", 200)] },
      { slug: "b", transactions: [transaction("1", 200)] },
    ];
    await usecase.execute();

    repository.published = [
      { slug: "a", transactions: [transaction("1", 200)] },
      { slug: "b", transactions: [] },
    ];
    await usecase.execute();

    const last = parseLedgerLine(repository.lines[repository.lines.length - 1]);
    expect(last).toMatchObject({ event: "transaction.deleted", org: "b", no: "1" });
  });
});
