import { db } from "@/lib/db";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ReportClient } from "@/components/research/report-client";
import type { KeywordCluster } from "@/lib/cluster-builder";
import type { CompetitorPage, OwnDomainData } from "@/lib/competitor-analysis";

interface Props {
  params: { id: string };
}

export const dynamic = "force-dynamic";

export default async function ReportPage({ params }: Props) {
  const report = await db.researchReport.findUnique({ where: { id: params.id } });
  if (!report) notFound();

  const serpResults =
    (report.summary as { serpResults?: { url: string; title: string; snippet: string }[] } | null)
      ?.serpResults ?? [];
  const competitors = (report.competitors as CompetitorPage[] | null) ?? [];
  const ownData = (report.ownData as OwnDomainData | null);
  const clusters = (report.clusters as KeywordCluster[] | null) ?? [];
  const authority = (report.competitorAuthority as AuthorityEntry[] | null) ?? [];

  return (
    <div className="max-w-4xl mx-auto px-8 py-12">
      {/* Header */}
      <div className="mb-8">
        <Link href="/research" className="text-sm text-gray-400 hover:text-gray-700 mb-4 block">
          ← Research
        </Link>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{report.keyword}</h1>
            <p className="text-sm text-gray-400 mt-1">
              {new Date(report.createdAt).toLocaleDateString("en-US", {
                month: "long",
                day: "numeric",
                year: "numeric",
              })}
              {" · "}
              <StatusBadge status={report.status} />
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-10">
        {/* Competitor landscape */}
        {competitors.length > 0 && (
          <section>
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">
              Competitor landscape
            </h2>
            <div className="divide-y divide-gray-100">
              {competitors.map((c, i) => (
                <div key={i} className="flex items-center justify-between py-3">
                  <div>
                    <a
                      href={c.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm font-medium text-blue-600 hover:underline"
                    >
                      {c.domain}
                    </a>
                  </div>
                  {c.trafficShare != null && (
                    <span className="text-xs text-gray-400">
                      {(c.trafficShare * 100).toFixed(1)}% traffic share
                    </span>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Competitor authority section */}
        {authority.length > 0 && (
          <CompetitorAuthoritySection entries={authority} />
        )}

        {/* SERP results */}
        {serpResults.length > 0 && (
          <section>
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">
              SERP results
            </h2>
            <div className="space-y-3">
              {serpResults.map((r, i) => (
                <div key={i} className="flex gap-3">
                  <span className="text-xs text-gray-300 w-4 shrink-0 pt-0.5">{i + 1}</span>
                  <div>
                    <a
                      href={r.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm font-medium text-blue-600 hover:underline"
                    >
                      {r.title}
                    </a>
                    <p className="text-xs text-gray-400 mt-0.5 line-clamp-2">{r.snippet}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Own domain data */}
        {ownData && ownData.topKeywords.length > 0 && (
          <section>
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">
              Our rankings
            </h2>
            <div className="divide-y divide-gray-100">
              {ownData.topKeywords.slice(0, 15).map((kw, i) => (
                <div key={i} className="flex items-center justify-between py-2">
                  <span className="text-sm text-gray-700">{kw.keyword}</span>
                  <div className="flex items-center gap-3">
                    {kw.volume != null && (
                      <span className="text-xs text-gray-400">{kw.volume.toLocaleString()} vol</span>
                    )}
                    <span className="text-xs text-gray-500 font-medium">#{kw.position}</span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Keyword clusters */}
        <section>
          <ReportClient
            reportId={report.id}
            initialClusters={clusters}
            reportStatus={report.status}
            hasOpenAI={!!process.env.OPENAI_API_KEY}
            anyHighDrCompetitor={authority.some((a) => (a.dr ?? 0) > 65)}
          />
        </section>
      </div>
    </div>
  );
}

// ── Types ──────────────────────────────────────────────────────────────────

interface AuthorityEntry {
  domain: string;
  dr: number | null;
  backlinks: number | null;
  referringDomains: number | null;
  drTrend: "rising" | "falling" | "stable" | null;
  drHistory: { date: string; dr: number }[];
}

// ── Competitor authority section ───────────────────────────────────────────

function CompetitorAuthoritySection({ entries }: { entries: AuthorityEntry[] }) {
  const anyHighRising = entries.find(
    (e) => (e.dr ?? 0) > 65 && e.drTrend === "rising"
  );
  const allLow = entries.every((e) => (e.dr ?? 0) < 40);

  const drColor = (dr: number | null) => {
    if (dr === null) return "text-gray-400";
    if (dr < 40) return "text-green-600";
    if (dr <= 65) return "text-amber-600";
    return "text-red-600";
  };

  const trendDisplay = (trend: AuthorityEntry["drTrend"]) => {
    if (!trend) return <span className="text-gray-300">—</span>;
    if (trend === "rising") return <span className="text-red-500 text-xs">↑ Rising</span>;
    if (trend === "falling") return <span className="text-green-600 text-xs">↓ Falling</span>;
    return <span className="text-gray-400 text-xs">→ Stable</span>;
  };

  return (
    <section>
      <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">
        Competitor authority
      </h2>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[10px] text-gray-400 uppercase tracking-wide border-b border-gray-100">
              <th className="text-left pb-2 font-medium">Competitor</th>
              <th className="text-right pb-2 font-medium">DR</th>
              <th className="text-right pb-2 font-medium">Referring Domains</th>
              <th className="text-right pb-2 font-medium">Backlinks</th>
              <th className="text-right pb-2 font-medium">DR Trend</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {entries.map((e, i) => (
              <tr key={i}>
                <td className="py-2.5 text-gray-700 font-medium">{e.domain}</td>
                <td className={`py-2.5 text-right font-semibold ${drColor(e.dr)}`}>
                  {e.dr ?? "—"}
                </td>
                <td className="py-2.5 text-right text-gray-500">
                  {e.referringDomains != null ? e.referringDomains.toLocaleString() : "—"}
                </td>
                <td className="py-2.5 text-right text-gray-500">
                  {e.backlinks != null ? e.backlinks.toLocaleString() : "—"}
                </td>
                <td className="py-2.5 text-right">{trendDisplay(e.drTrend)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {anyHighRising && (
        <p className="mt-3 text-xs text-amber-700 bg-amber-50 rounded-md px-3 py-2">
          ⚠ {anyHighRising.domain} is rapidly gaining authority — clusters competing with them
          should be prioritised.
        </p>
      )}
      {!anyHighRising && allLow && (
        <p className="mt-3 text-xs text-green-700 bg-green-50 rounded-md px-3 py-2">
          ✓ Competitor authority is low — this category has a low barrier to entry.
        </p>
      )}
    </section>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    pending: "text-gray-500",
    running: "text-blue-600",
    complete: "text-green-600",
    error: "text-red-600",
  };
  return <span className={`font-medium ${colors[status] ?? "text-gray-500"}`}>{status}</span>;
}
