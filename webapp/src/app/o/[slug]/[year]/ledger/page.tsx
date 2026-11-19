import "server-only";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Breadcrumbs from "@/client/components/layout/Breadcrumbs";
import MainColumn from "@/client/components/layout/MainColumn";
import SectionCard from "@/client/components/layout/SectionCard";
import { witnessPageUrl } from "@/server/contexts/public-finance/domain/models/ledger-checkpoint";
import { loadLedgerHistory } from "@/server/contexts/public-finance/presentation/loaders/load-ledger";
import { loadOrganizations } from "@/server/contexts/public-finance/presentation/loaders/load-organizations";
import type { LedgerEntry } from "@/shared/ledger/ledger";

export const dynamic = "force-dynamic";

interface LedgerPageProps {
  params: Promise<{ slug: string; year: string }>;
}

export const metadata: Metadata = { title: "更新の記録" };

const EVENT_LABELS: Record<string, { label: string; className: string }> = {
  "transaction.created": { label: "追加", className: "bg-[#E2F6F3] text-[#0F8472]" },
  "transaction.updated": { label: "修正", className: "bg-[#FFF3D6] text-[#8A5A00]" },
  "transaction.deleted": { label: "削除", className: "bg-[#FDE7E7] text-[#B4322A]" },
};

const dateTimeFormatter = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo",
  year: "numeric",
  month: "numeric",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

function EventBadge({ entry }: { entry: LedgerEntry }) {
  const event = EVENT_LABELS[entry.event] ?? { label: entry.event, className: "bg-gray-100" };
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-[12px] font-bold ${event.className}`}>
      {event.label}
    </span>
  );
}

export default async function LedgerPage({ params }: LedgerPageProps) {
  const { slug, year } = await params;
  const financialYear = Number.parseInt(year, 10);
  const { organizations } = await loadOrganizations();
  const organization = organizations.find((org) => org.slug === slug);
  if (!organization || !Number.isInteger(financialYear)) notFound();

  const history = await loadLedgerHistory({ slug, financialYear });
  const { checkpoint } = history;
  const covered = checkpoint ? Math.min(checkpoint.size, history.totalRecords) : 0;
  const parent = {
    label: `${organization.displayName}の収支・${financialYear}年`,
    href: `/o/${slug}/${financialYear}`,
  };

  return (
    <MainColumn spacing="compact">
      <div className="flex flex-col gap-5">
        <Breadcrumbs parent={parent} current="更新の記録" />
        <SectionCard
          id="ledger"
          iconSrc="/icons/icon-cashback.svg"
          iconLabel="Ledger icon"
          eyebrow={`${organization.displayName}・${financialYear}年`}
          title="更新の記録"
          updatedAt=""
          headingLevel="h1"
          revealHeading={false}
        >
          <div className="flex flex-col gap-8 text-[15px] leading-[1.8] text-[#1F2937]">
            <p>
              このページの出入金データは、追加・修正・削除のたびに、あとから書き換えられない記録に残しています。
              記録に入るのは取引ごとのダイジェスト（ハッシュ）だけで、運営者とは別の立場の連署サーバーが連署します。
              公開後に数字を直せば「修正」として残り、記録のほうを書き換えれば検証で分かります。
            </p>

            <dl className="grid gap-3 rounded-[20px] bg-[#F3FAF9] p-5 min-[641px]:grid-cols-3">
              <div>
                <dt className="text-[13px] font-bold text-[#238778]">記録の件数</dt>
                <dd className="text-[22px] font-bold" data-testid="ledger-total">
                  {history.totalRecords}件
                </dd>
              </div>
              <div>
                <dt className="text-[13px] font-bold text-[#238778]">連署済み</dt>
                <dd className="text-[22px] font-bold" data-testid="ledger-covered">
                  {checkpoint ? `${covered}件まで` : "まだありません"}
                </dd>
              </div>
              <div>
                <dt className="text-[13px] font-bold text-[#238778]">連署サーバー</dt>
                <dd className="break-all text-[15px] font-bold" data-testid="ledger-witnesses">
                  {checkpoint && checkpoint.witnesses.length > 0
                    ? checkpoint.witnesses.map((witness, i) => {
                        const href = witnessPageUrl(witness, checkpoint.origin);
                        return (
                          <span key={witness}>
                            {i > 0 && "、"}
                            {href ? (
                              <a
                                className="text-[#238778] underline"
                                href={href}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                {witness}
                              </a>
                            ) : (
                              witness
                            )}
                          </span>
                        );
                      })
                    : "—"}
                </dd>
              </div>
            </dl>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] border-collapse text-left text-[14px]">
                <thead>
                  <tr className="border-b border-[#D1E5E2] text-[13px] text-[#4B5563]">
                    <th className="py-2 pr-3 font-bold">記録した日時</th>
                    <th className="py-2 pr-3 font-bold">出来事</th>
                    <th className="py-2 pr-3 font-bold">取引No</th>
                    <th className="py-2 pr-3 font-bold">ダイジェスト</th>
                    <th className="py-2 font-bold">記録の番号</th>
                  </tr>
                </thead>
                <tbody>
                  {history.entries.map((entry) => (
                    <tr key={entry.seq} className="border-b border-[#EEF4F3]">
                      <td className="py-2 pr-3 whitespace-nowrap">
                        {dateTimeFormatter.format(new Date(entry.collectedAt))}
                      </td>
                      <td className="py-2 pr-3">
                        <EventBadge entry={entry} />
                      </td>
                      <td className="py-2 pr-3">{entry.no}</td>
                      <td className="py-2 pr-3 font-mono text-[13px]">
                        {entry.replaces ? `${entry.replaces.slice(0, 10)}… → ` : ""}
                        {entry.digest.slice(0, 10)}…
                      </td>
                      <td className="py-2 font-mono text-[13px]">{entry.seq}</td>
                    </tr>
                  ))}
                  {history.entries.length === 0 && (
                    <tr>
                      <td colSpan={5} className="py-6 text-center text-[#6B7280]">
                        この年の記録はまだありません。
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="flex flex-col gap-2">
              <h2 className="text-[17px] font-bold">自分で確かめる</h2>
              <p>
                記録、チェックポイント、公開中の取引の3つを取得すれば、誰でも確かめられます。記録の形式は{" "}
                <a
                  className="font-bold text-[#238778] underline"
                  href="https://github.com/eucassoc/deedlog"
                >
                  deedlog
                </a>{" "}
                で、検証には dlog コマンドを使います。
              </p>
              <ul className="list-disc pl-5">
                <li>
                  <a className="font-bold text-[#238778] underline" href="/ledger/chain.jsonl">
                    記録（chain.jsonl）
                  </a>
                </li>
                <li>
                  <a className="font-bold text-[#238778] underline" href="/ledger/checkpoint">
                    チェックポイント（署名と連署）
                  </a>
                </li>
                <li>
                  <a
                    className="font-bold text-[#238778] underline"
                    href={`/o/${slug}/${financialYear}/ledger/transactions.json`}
                  >
                    公開中の取引（transactions.json）
                  </a>
                </li>
              </ul>
            </div>
          </div>
        </SectionCard>
      </div>
      <Breadcrumbs parent={parent} current="更新の記録" position="bottom" />
    </MainColumn>
  );
}
