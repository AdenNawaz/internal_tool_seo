export const dynamic = "force-dynamic";
import { db } from "@/lib/db";
import { notFound } from "next/navigation";
import { ArticleEditor } from "@/components/editor/article-editor";

interface Props {
  params: { id: string };
}

export default async function ArticlePage({ params }: Props) {
  const article = await db.article.findUnique({ where: { id: params.id } });
  if (!article) notFound();

  return (
    <ArticleEditor
      id={article.id}
      initialTitle={article.title}
      initialContent={article.content}
      initialKeyword={article.targetKeyword}
      initialMeta={article.metaDescription}
      initialSlug={article.slug}
      initialPublishedUrl={article.publishedUrl}
      initialStatus={article.status}
      initialRevampUrl={(article as Record<string, unknown>).revampUrl as string ?? null}
      initialIsRevamp={(article as Record<string, unknown>).isRevamp as boolean ?? false}
      initialSecondaryKeywords={(article as Record<string, unknown>).secondaryKeywords ?? null}
      initialChatOutline={(article as Record<string, unknown>).chatOutline ?? null}
      initialChatResearchState={(article as Record<string, unknown>).chatResearchState ?? null}
    />
  );
}
