"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function NewArticleButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleClick() {
    setLoading(true);
    const res = await fetch("/api/articles", { method: "POST" });
    const { id } = await res.json();
    router.push(`/articles/${id}`);
  }

  return (
    <Button onClick={handleClick} disabled={loading}>
      {loading ? "Creating…" : "New Article"}
    </Button>
  );
}
