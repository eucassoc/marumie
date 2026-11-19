/** チェックポイント（c2sp.org/tlog-checkpoint の署名付きノート）から、画面に出すものを読む */
export interface LedgerCheckpointSummary {
  /** 記録の名前（チェーン ID） */
  origin: string;
  /** このチェックポイントが押さえている記録の件数 */
  size: number;
  /** 署名した運営者の鍵の名前 */
  operator: string | null;
  /** 連署した連署サーバーの鍵の名前 */
  witnesses: string[];
}

/**
 * 署名付きノートは「本文、空行、署名の行」の順で、本文の 1 行目が名前、2 行目が件数。
 * 署名の行は「— 鍵の名前 署名」。名前が origin と同じものが運営者、それ以外が連署サーバー。
 * ここでは署名の検証はしない（検証は記録を受け取った側が dlog で行う）。
 */
export function summarizeLedgerCheckpoint(note: string): LedgerCheckpointSummary | null {
  const [body, signatures = ""] = note.split("\n\n");
  const [origin, sizeText] = body.split("\n");
  const size = Number.parseInt(sizeText ?? "", 10);
  if (!origin || !Number.isInteger(size)) return null;

  const names = signatures
    .split("\n")
    .filter((line) => line.startsWith("— "))
    .map((line) => line.slice(2).split(" ")[0]);

  return {
    origin,
    size,
    operator: names.find((name) => name === origin) ?? null,
    witnesses: [...new Set(names.filter((name) => name !== origin))],
  };
}
