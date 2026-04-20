import { ChatInterface } from "@/components/chat/chat-interface";

interface Props {
  searchParams: { reportId?: string; primaryKeyword?: string; clusterName?: string; keywords?: string };
}

export default function ChatPage({ searchParams }: Props) {
  return (
    <ChatInterface
      preloadReportId={searchParams.reportId}
      preloadPrimaryKeyword={searchParams.primaryKeyword}
      preloadClusterName={searchParams.clusterName}
      preloadKeywords={searchParams.keywords}
    />
  );
}
