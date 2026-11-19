import { summarizeLedgerCheckpoint, witnessPageUrl } from "@/server/contexts/public-finance/domain/models/ledger-checkpoint";

describe("summarizeLedgerCheckpoint", () => {
  const body = "marumie.example/ledger\n67\nJLfvcUwTd+yKUxAmYm5uJ9C3o9lr7VAOPgcXjjveJyA=\n";

  it("本文から名前と件数を、署名の行から運営者と連署サーバーを読む", () => {
    const note = `${body}\n— marumie.example/ledger AAAA\n— witness.example BBBB\n— witness.euca.in CCCC\n`;
    expect(summarizeLedgerCheckpoint(note)).toEqual({
      origin: "marumie.example/ledger",
      size: 67,
      operator: "marumie.example/ledger",
      witnesses: ["witness.example", "witness.euca.in"],
    });
  });

  it("連署のないチェックポイントは、連署サーバーが空になる", () => {
    expect(summarizeLedgerCheckpoint(`${body}\n— marumie.example/ledger AAAA\n`)?.witnesses).toEqual([]);
  });

  it("署名付きノートとして読めないものは null", () => {
    expect(summarizeLedgerCheckpoint("")).toBeNull();
    expect(summarizeLedgerCheckpoint("only-origin\n")).toBeNull();
  });
});

describe("witnessPageUrl", () => {
  it("ホスト名の連署サーバーには、記録の名前を添えた確認ページの URL を作る", () => {
    expect(witnessPageUrl("witness.euca.in", "deedlog.org/demo/marumie")).toBe(
      "https://witness.euca.in/#o=deedlog.org%2Fdemo%2Fmarumie",
    );
  });

  it("ホスト名でない名前には作らない", () => {
    expect(witnessPageUrl("local-witness", "o")).toBeNull();
    expect(witnessPageUrl("bad name.example", "o")).toBeNull();
  });
});
