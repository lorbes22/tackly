import { Search } from "lucide-react";

export default function SearchPage() {
  return (
    <div className="mx-auto max-w-xl animate-fade-up text-center">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-periwinkle-tint">
        <Search className="h-6 w-6 text-periwinkle-deep" />
      </div>
      <h1 className="mt-4 font-display text-3xl font-bold tracking-tight text-ink">
        Search
      </h1>
      <p className="mt-2 text-ink-soft">
        Semantic search across every node and session is coming once your maps
        have nodes to find.
      </p>
    </div>
  );
}
