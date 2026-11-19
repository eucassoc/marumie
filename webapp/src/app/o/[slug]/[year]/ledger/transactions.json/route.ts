import "server-only";
import { loadLedgerExport } from "@/server/contexts/public-finance/presentation/loaders/load-ledger";

export const dynamic = "force-dynamic";

/**
 * 記録と突き合わせるための、公開中の取引の書き出し。
 * 1 件ごとの JSON（キーはこの順、空白なし）の SHA-256 が、記録に載っているダイジェストになる。
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string; year: string }> },
) {
  const { slug, year } = await params;
  const financialYear = Number.parseInt(year, 10);
  if (!Number.isInteger(financialYear)) {
    return Response.json({ error: "invalid year" }, { status: 400 });
  }

  const transactions = await loadLedgerExport({ slug, financialYear });
  if (transactions === null) {
    return Response.json({ error: "organization not found" }, { status: 404 });
  }

  return Response.json(
    { org: slug, year: financialYear, transactions },
    { headers: { "Cache-Control": "no-store" } },
  );
}
