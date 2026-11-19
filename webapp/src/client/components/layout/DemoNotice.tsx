import "server-only";

/**
 * 公式ではない環境（フォークのデモなど）で、すべてのページの下端に出し続ける注意書き。
 * DEMO_NOTICE が設定されているときだけ出す。DEMO_NOTICE_URL があれば、詳しい説明へのリンクを添える。
 */
export default function DemoNotice() {
  const notice = process.env.DEMO_NOTICE;
  if (!notice) return null;
  const href = process.env.DEMO_NOTICE_URL;
  return (
    <div
      role="note"
      data-testid="demo-notice"
      className="fixed inset-x-0 bottom-0 z-[100] bg-[#1F2937] px-4 py-2.5 text-center text-[13px] font-bold leading-[1.6] text-white min-[641px]:text-[14px]"
    >
      {notice}
      {href && (
        <>
          {" "}
          <a className="underline" href={href}>
            詳しく
          </a>
        </>
      )}
    </div>
  );
}
