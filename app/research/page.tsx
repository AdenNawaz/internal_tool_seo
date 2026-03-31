import { db } from "@/lib/db";
import Link from "next/link";
import { NewResearchButton } from "@/components/research/new-research-button";

export const dynamic = "force-dynamic";

export default async function ResearchPage() {
  const reports = await db.researchReport.findMany({
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return (
    <div className="max-w-3xl mx-auto px-8 py-12">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Research</h1>
          <p className="text-sm text-gray-400 mt-1">Keyword research reports with competitor analysis</p>
        </div>
        <NewResearchButton />
      </div>

      {reports.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <p className="text-sm">No research reports yet.</p>
          <p className="text-xs mt-1">Start a new report to analyse a keyword.</p>
        </div>
      ) : (
        <div className="divide-y divide-gray-100">
          {reports.map((report) => (
            <Link
              key={report.id}
              href={`/research/${report.id}`}
              className="flex items-center justify-between py-4 hover:bg-gray-50 -mx-3 px-3 rounded-md transition-colors"
            >
              <div>
                <p className="text-sm font-medium text-gray-900">{report.keyword}</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {new Date(report.createdAt).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <StatusBadge status={report.status} />
                <span className="text-gray-300 text-sm">→</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    pending: "bg-gray-100 text-gray-500",
    running: "bg-blue-50 text-blue-600",
    complete: "bg-green-50 text-green-600",
    error: "bg-red-50 text-red-600",
  };
  return (
    <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${colors[status] ?? colors.pending}`}>
      {status}
    </span>
  );
}
