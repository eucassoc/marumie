import "server-only";

import {
  buildLedgerLine,
  diffLedger,
  LEDGER_DECLARATION,
  ledgerBody,
  ledgerKey,
  ledgerSubject,
  parseLedgerLine,
  replayLedger,
  toLedgerPublicTransaction,
} from "@/shared/ledger/ledger";
import type { ILedgerRepository } from "@/server/contexts/shared/domain/repositories/ledger-repository.interface";

interface SyncLedgerResult {
  /** 今回の実行で記録に足した行数（記録を開いた最初の 1 行を含む） */
  appended: number;
}

/**
 * 公開している取引と記録を突き合わせ、記録にまだ載っていない追加・更新・削除を追記する。
 *
 * 取引を書き換える処理のあとに呼ぶ。どの画面からどう書き換えたかを問わず、いまの公開データと
 * 記録の差だけを見るので、書き換える経路が増えても記録の漏れが起きない。
 * 記録を通さずにデータベースを直接書き換えた場合も、次に呼ばれたときに「更新」として記録に残る。
 */
export class SyncLedgerUsecase {
  constructor(
    private ledgerRepository: ILedgerRepository,
    /** 記録の名前（deedlog のチェーン ID。運営者のドメイン配下の、スキームなしの URL） */
    private chain: string,
    private now: () => Date = () => new Date(),
  ) {}

  async execute(): Promise<SyncLedgerResult> {
    const organizations = await this.ledgerRepository.findPublicTransactions();

    const added = await this.ledgerRepository.append((lines) => {
      const all = [...lines];
      const push = (subject: { digest: string; size: number }, meta: Record<string, string>) => {
        all.push(
          buildLedgerLine({
            chain: this.chain,
            seq: all.length,
            prevLine: all.length > 0 ? all[all.length - 1] : null,
            collectedAt: this.now(),
            subject,
            meta,
          }),
        );
      };

      if (all.length === 0) {
        push(ledgerSubject(LEDGER_DECLARATION), { event: "ledger.opened" });
      }

      const entries = all.map(parseLedgerLine);
      for (const org of organizations) {
        const current = new Map<string, { year: number; no: string; body: string }>();
        for (const transaction of org.transactions) {
          const view = toLedgerPublicTransaction(transaction);
          if (!view) continue;
          current.set(ledgerKey(view.year, view.no), {
            year: view.year,
            no: view.no,
            body: ledgerBody(view),
          });
        }

        for (const change of diffLedger(current, replayLedger(entries, org.slug))) {
          const meta: Record<string, string> = {
            event: change.event,
            org: org.slug,
            year: change.year,
            no: change.no,
          };
          if (change.replaces) meta.replaces = change.replaces;
          push(change.subject, meta);
        }
      }

      return all.slice(lines.length);
    });

    return { appended: added.length };
  }
}
