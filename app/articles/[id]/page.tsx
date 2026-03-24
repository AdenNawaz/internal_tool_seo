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
    />
  );
}
