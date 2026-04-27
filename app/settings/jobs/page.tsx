"use client";

import { useEffect, useState, useCallback } from "react";
import { RefreshCw, RotateCcw, CheckCircle2, XCircle, Clock, Zap } from "lucide-react";

interface QueueStat {
  name: string;
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
}

interface FailedJob {
  id: string;
  queue: string;
  name: string;
  data: unknown;
  failedReason: string;
  processedOn: number;
  timestamp: number;
}

export default function JobsPage() {
  const [stats, setStats] = useState<QueueStat[]>([]);
  const [failures, setFailures] = useState<FailedJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [retrying, setRetrying] = useState<string | null>(null);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/jobs/status");
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json() as { stats: QueueStat[]; failures: FailedJob[] };
      setStats(data.stats ?? []);
      setFailures(data.failures ?? []);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 10000);
    return () => clearInterval(interval);
  }, [refresh]);

  async function retry(jobId: string, queue: string) {
    setRetrying(jobId);
    try {
      await fetch(`/api/jobs/${jobId}/retry?queue=${encodeURIComponent(queue)}`, { method: "POST" });
      await refresh();
    } finally {
      setRetrying(null);
    }
  }

  const totalActive = stats.reduce((s, q) => s + q.active, 0);
  const totalFailed = stats.reduce((s, q) => s + q.failed, 0);
  const totalWaiting = stats.reduce((s, q) => s + q.waiting, 0);

  return (
    <div className="max-w-5xl mx-auto px-8 py-10 space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Background Jobs</h1>
          <p className="text-sm text-gray-400 mt-0.5">Monitor and manage background agent queues</p>
        </div>
        <button
          onClick={refresh}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors disabled:opacity-50"
        >
          <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
          Refresh
        </button>
      </div>

      {error && (
        <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
          {error} — is <code className="font-mono">UPSTASH_REDIS_URL</code> configured?
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
          <div className="flex items-center gap-2 text-blue-600 mb-1">
            <Zap size={14} />
            <span className="text-xs font-semibold uppercase tracking-wide">Active</span>
          </div>
          <p className="text-2xl font-bold text-blue-700">{totalActive}</p>
        </div>
        <div className="bg-amber-50 border border-amber-100 rounded-xl p-4">
          <div className="flex items-center gap-2 text-amber-600 mb-1">
            <Clock size={14} />
            <span className="text-xs font-semibold uppercase tracking-wide">Waiting</span>
          </div>
          <p className="text-2xl font-bold text-amber-700">{totalWaiting}</p>
        </div>
        <div className="bg-red-50 border border-red-100 rounded-xl p-4">
          <div className="flex items-center gap-2 text-red-600 mb-1">
            <XCircle size={14} />
            <span className="text-xs font-semibold uppercase tracking-wide">Failed</span>
          </div>
          <p className="text-2xl font-bold text-red-700">{totalFailed}</p>
        </div>
      </div>

      {/* Queue table */}
      <div>
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Queues</h2>
        <div className="border border-gray-100 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
              <tr>
                <th className="text-left px-4 py-3 font-medium">Queue</th>
                <th className="text-right px-4 py-3 font-medium">Active</th>
                <th className="text-right px-4 py-3 font-medium">Waiting</th>
                <th className="text-right px-4 py-3 font-medium">Delayed</th>
                <th className="text-right px-4 py-3 font-medium">Completed</th>
                <th className="text-right px-4 py-3 font-medium">Failed</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {stats.map((q) => (
                <tr key={q.name} className="hover:bg-gray-50/50">
                  <td className="px-4 py-3 font-medium text-gray-800">{q.name}</td>
                  <td className="px-4 py-3 text-right">
                    <span className={`${q.active > 0 ? "text-blue-600 font-semibold" : "text-gray-400"}`}>{q.active}</span>
                  </td>
                  <td className="px-4 py-3 text-right text-gray-500">{q.waiting}</td>
                  <td className="px-4 py-3 text-right text-gray-500">{q.delayed}</td>
                  <td className="px-4 py-3 text-right">
                    <span className="text-green-600">{q.completed}</span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className={`${q.failed > 0 ? "text-red-600 font-semibold" : "text-gray-400"}`}>{q.failed}</span>
                  </td>
                </tr>
              ))}
              {stats.length === 0 && !loading && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-sm text-gray-400">
                    No queue data — Redis may not be connected
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Recent failures */}
      {failures.length > 0 && (
        <div>
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Recent Failures</h2>
          <div className="space-y-2">
            {failures.map((job) => (
              <div key={`${job.queue}-${job.id}`} className="border border-red-100 bg-red-50/50 rounded-xl p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <XCircle size={12} className="text-red-500 shrink-0" />
                      <span className="text-xs font-semibold text-gray-700">{job.queue} / {job.name}</span>
                      <span className="text-[10px] text-gray-400">
                        {job.processedOn ? new Date(job.processedOn).toLocaleString() : ""}
                      </span>
                    </div>
                    <p className="text-xs text-red-700 font-mono truncate">{job.failedReason}</p>
                  </div>
                  <button
                    onClick={() => retry(job.id!, job.queue)}
                    disabled={retrying === job.id}
                    className="shrink-0 flex items-center gap-1.5 text-xs px-3 py-1.5 bg-white border border-gray-200 hover:border-gray-300 rounded-lg transition-colors disabled:opacity-50"
                  >
                    <RotateCcw size={11} className={retrying === job.id ? "animate-spin" : ""} />
                    Retry
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {failures.length === 0 && !loading && stats.length > 0 && (
        <div className="flex items-center gap-2 text-sm text-green-600">
          <CheckCircle2 size={14} />
          No failed jobs
        </div>
      )}

      <div className="text-xs text-gray-400 border-t border-gray-100 pt-4">
        To start workers: <code className="font-mono bg-gray-100 px-1.5 py-0.5 rounded">npm run dev:workers</code>
      </div>
    </div>
  );
}
