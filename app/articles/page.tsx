import { db } from "@/lib/db";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { NewArticleButton } from "@/components/new-article-button";
import { ArticlesFilter } from "@/components/articles-filter";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export const dynamic = "force-dynamic";

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(date));
}

interface Props {
  searchParams: { mine?: string };
}

export default async function ArticlesPage({ searchParams }: Props) {
  const mine = searchParams.mine === "true";
  const session = await getServerSession(authOptions);
  const userEmail = session?.user?.email ?? null;

  const articles = await db.article.findMany({
    where: mine && userEmail ? { authorEmail: userEmail } : undefined,
    orderBy: { updatedAt: "desc" },
  });

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-4xl mx-auto px-8 py-12">
        <div className="flex items-center justify-between mb-10">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Articles</h1>
            <p className="text-sm text-gray-500 mt-1">
              {articles.length} {articles.length === 1 ? "article" : "articles"}
              {mine && " by you"}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <ArticlesFilter mine={mine} />
            <NewArticleButton />
          </div>
        </div>

        {articles.length === 0 ? (
          <div className="text-center py-24 text-gray-400">
            <p className="text-base">{mine ? "No articles by you yet." : "No articles yet."}</p>
            <p className="text-sm mt-1">Click &ldquo;New Article&rdquo; to get started.</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="border-gray-100">
                <TableHead className="text-gray-500 font-medium">Title</TableHead>
                <TableHead className="text-gray-500 font-medium">Status</TableHead>
                <TableHead className="text-gray-500 font-medium text-right">
                  Last updated
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {articles.map((article) => (
                <TableRow
                  key={article.id}
                  className="border-gray-100 hover:bg-gray-50/50 cursor-pointer"
                >
                  <TableCell>
                    <a
                      href={`/articles/${article.id}`}
                      className="font-medium text-gray-900 hover:text-gray-700 block"
                    >
                      {article.title || "Untitled"}
                    </a>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={article.status === "published" ? "default" : "secondary"}
                      className={
                        article.status === "published"
                          ? "bg-green-100 text-green-700 hover:bg-green-100"
                          : "bg-gray-100 text-gray-500 hover:bg-gray-100"
                      }
                    >
                      {article.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right text-sm text-gray-400">
                    {formatDate(article.updatedAt)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
