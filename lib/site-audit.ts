import { cachedAhrefs } from "./ahrefs-cached";
import { parseMcpRows, parseMcpText } from "./ahrefs-utils";

export interface AuditIssue {
  id: string;
  label: string;
  severity: "error" | "warning" | "info";
}

export interface AuditPageData {
  statusCode: number | null;
  wordCount: number | null;
  internalLinksIn: number | null;
  internalLinksOut: number | null;
  metaTitle: string | null;
  metaDescription: string | null;
  canonical: string | null;
  isIndexable: boolean | null;
}

export interface PageAuditResult {
  available: boolean;
  issues: AuditIssue[];
  pageData: AuditPageData | null;
}

const NOT_FOUND_SIGNALS = ["no audit", "not found", "no project", "not configured", "no site audit"];

function isNotFound(err: unknown): boolean {
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
  return NOT_FOUND_SIGNALS.some((s) => msg.includes(s));
}

export async function getPageAuditData(url: string): Promise<PageAuditResult> {
  // Step 1 — issues
  let issues: AuditIssue[] = [];
  let auditAvailable = true;

  try {
    const rawIssues = await cachedAhrefs(
      "site-audit-issues",
      { target: url, select: "id,name,severity", limit: 50 },
      3600
    );
    const rows = parseMcpRows(rawIssues);
    issues = rows.map((r) => ({
      id: String(r.id ?? r.name ?? ""),
      label: String(r.name ?? r.id ?? "Unknown issue"),
      severity: (["error", "warning", "info"].includes(String(r.severity))
        ? r.severity
        : "info") as AuditIssue["severity"],
    }));
  } catch (err) {
    if (isNotFound(err)) {
      return { available: false, issues: [], pageData: null };
    }
    auditAvailable = false;
  }

  if (!auditAvailable) return { available: false, issues: [], pageData: null };

  // Step 2 — page data (non-fatal if it fails)
  let pageData: AuditPageData | null = null;
  try {
    const rawPage = await cachedAhrefs(
      "site-audit-page-explorer",
      {
        target: url,
        select: "status_code,word_count,links_internal_in,links_internal_out,meta_title,meta_description,canonical,is_indexable",
      },
      3600
    );
    const parsed = parseMcpText(rawPage);
    const rows = Array.isArray(parsed)
      ? parsed
      : parsed && typeof parsed === "object"
      ? [parsed]
      : [];
    const row = rows[0] as Record<string, unknown> | undefined;
    if (row) {
      pageData = {
        statusCode: row.status_code != null ? Number(row.status_code) : null,
        wordCount: row.word_count != null ? Number(row.word_count) : null,
        internalLinksIn: row.links_internal_in != null ? Number(row.links_internal_in) : null,
        internalLinksOut: row.links_internal_out != null ? Number(row.links_internal_out) : null,
        metaTitle: row.meta_title != null ? String(row.meta_title) : null,
        metaDescription: row.meta_description != null ? String(row.meta_description) : null,
        canonical: row.canonical != null ? String(row.canonical) : null,
        isIndexable: row.is_indexable != null ? Boolean(row.is_indexable) : null,
      };
    }
  } catch {
    // pageData stays null — not fatal
  }

  return { available: true, issues, pageData };
}
