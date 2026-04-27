import { Worker } from "bullmq";
import { makeConnection } from "../lib/queue/connection";
import { db as prisma } from "../lib/db";
import { extractPlainText } from "../lib/text-analysis";

function extractNounPhrases(text: string): string[] {
  // Simple noun phrase extraction: 2-4 word sequences with no stopwords at start/end
  const stopwords = new Set(["the", "a", "an", "in", "on", "at", "to", "for", "of", "and", "or", "but", "is", "are", "was", "were", "be", "been", "being", "have", "has", "had"]);
  const words = text.toLowerCase().split(/\W+/).filter((w) => w.length > 2);
  const phrases: string[] = [];

  for (let i = 0; i < words.length; i++) {
    if (stopwords.has(words[i])) continue;
    for (let len = 2; len <= 4 && i + len <= words.length; len++) {
      const phrase = words.slice(i, i + len).join(" ");
      if (!stopwords.has(words[i + len - 1])) {
        phrases.push(phrase);
      }
    }
    phrases.push(words[i]);
  }

  return Array.from(new Set(phrases));
}

function findSentenceWithPhrase(text: string, phrase: string): string {
  const sentences = text.split(/[.!?]+/);
  const found = sentences.find((s) => s.toLowerCase().includes(phrase.toLowerCase()));
  return (found?.trim() ?? "").slice(0, 200);
}

async function findLinkOpportunities(data: { newArticleId: string }) {
  const newArticle = await prisma.article.findUnique({ where: { id: data.newArticleId } });
  if (!newArticle || newArticle.status !== "published") return;

  const newText = extractPlainText((newArticle.content as unknown[]) ?? []);
  const newKeywords = [
    newArticle.targetKeyword?.toLowerCase(),
    ...newArticle.title.toLowerCase().split(/\W+/).filter((w) => w.length > 4),
  ].filter(Boolean) as string[];

  const otherArticles = await prisma.article.findMany({
    where: { status: "published", id: { not: data.newArticleId } },
  });

  for (const other of otherArticles) {
    const otherText = extractPlainText((other.content as unknown[]) ?? []);
    const otherPhrases = extractNounPhrases(otherText);

    // Forward: does other article mention new article's keywords?
    for (const kw of newKeywords) {
      const match = otherPhrases.find((p) => p === kw || p.includes(kw));
      if (!match) continue;

      // Check if already linked
      const alreadyLinked = await prisma.linkOpportunity.findFirst({
        where: {
          sourceArticleId: other.id,
          targetArticleId: data.newArticleId,
          applied: true,
        },
      });
      if (alreadyLinked) continue;

      const existing = await prisma.linkOpportunity.findFirst({
        where: {
          sourceArticleId: other.id,
          targetArticleId: data.newArticleId,
          suggestedAnchor: match,
        },
      });
      if (existing) continue;

      const context = findSentenceWithPhrase(otherText, match);

      await prisma.linkOpportunity.create({
        data: {
          sourceArticleId: other.id,
          targetArticleId: data.newArticleId,
          suggestedAnchor: match,
          context,
          confidence: newArticle.targetKeyword?.toLowerCase() === kw ? "high" : "medium",
        },
      });
    }

    // Reverse: does new article mention existing article's keywords?
    const otherKeywords = [
      other.targetKeyword?.toLowerCase(),
      ...other.title.toLowerCase().split(/\W+/).filter((w) => w.length > 4),
    ].filter(Boolean) as string[];

    const newPhrases = extractNounPhrases(newText);
    for (const kw of otherKeywords) {
      const match = newPhrases.find((p) => p === kw || p.includes(kw));
      if (!match) continue;

      const existing = await prisma.linkOpportunity.findFirst({
        where: {
          sourceArticleId: data.newArticleId,
          targetArticleId: other.id,
          suggestedAnchor: match,
        },
      });
      if (existing) continue;

      const context = findSentenceWithPhrase(newText, match);
      await prisma.linkOpportunity.create({
        data: {
          sourceArticleId: data.newArticleId,
          targetArticleId: other.id,
          suggestedAnchor: match,
          context,
          confidence: other.targetKeyword?.toLowerCase() === kw ? "high" : "medium",
        },
      });
    }
  }
}

async function scanFullLibrary() {
  const articles = await prisma.article.findMany({
    where: { status: "published" },
    select: { id: true },
  });

  // Clear old unapplied opportunities for a fresh scan
  await prisma.linkOpportunity.deleteMany({ where: { applied: false, dismissed: false } });

  for (const article of articles) {
    await findLinkOpportunities({ newArticleId: article.id });
  }
}

async function buildLinkMap() {
  const articles = await prisma.article.findMany({
    where: { status: "published" },
    select: { id: true, title: true, clusterName: true, targetKeyword: true },
  });

  const opportunities = await prisma.linkOpportunity.findMany({
    where: { applied: true },
    select: { sourceArticleId: true, targetArticleId: true },
  });

  const nodes = articles.map((a) => ({
    id: a.id,
    title: a.title,
    cluster: a.clusterName,
    keyword: a.targetKeyword,
  }));

  const edges = opportunities.map((o) => ({
    source: o.sourceArticleId,
    target: o.targetArticleId,
  }));

  // Find orphaned articles (no inbound links)
  const linkedTargets = new Set(opportunities.map((o) => o.targetArticleId));
  const orphaned = articles
    .filter((a) => !linkedTargets.has(a.id))
    .map((a) => a.id);

  await prisma.linkMapSnapshot.create({
    data: { nodes, edges, orphaned },
  });
}

export const linkingWorker = new Worker(
  "linking",
  async (job) => {
    switch (job.name) {
      case "find-link-opportunities": return findLinkOpportunities(job.data as { newArticleId: string });
      case "scan-full-library": return scanFullLibrary();
      case "build-link-map": return buildLinkMap();
    }
  },
  { connection: makeConnection(), concurrency: 2 }
);

linkingWorker.on("failed", (job, err) => {
  console.error(`[linking] ${job?.name} failed:`, err.message);
});
