import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const baseUrl = process.env.WEBAPP_URL || "https://marumie.team-mir.ai";

  // 公式ではない環境（DEMO_NOTICE のあるデモ）は検索に載せない
  if (process.env.DEMO_NOTICE) {
    return { rules: { userAgent: "*", disallow: "/" } };
  }

  return {
    rules: {
      userAgent: "*",
      allow: "/",
    },
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
