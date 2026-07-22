import { createClientFromRequest } from "npm:@base44/sdk";

// Mints a single-use temporary AssemblyAI streaming token so the browser
// never sees the real API key (AssemblyAI Operating Rule 5).
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const apiKey = Deno.env.get("ASSEMBLYAI_API_KEY");
    if (!apiKey) {
      return Response.json(
        { error: "ASSEMBLYAI_API_KEY is not configured" },
        { status: 500 },
      );
    }

    // Raw key, no Bearer prefix (AssemblyAI STT convention)
    const res = await fetch(
      "https://streaming.assemblyai.com/v3/token?expires_in_seconds=600",
      { headers: { authorization: apiKey } },
    );
    if (!res.ok) {
      const detail = await res.text();
      return Response.json(
        { error: `Token mint failed (${res.status}): ${detail.slice(0, 200)}` },
        { status: 502 },
      );
    }

    const { token } = await res.json();
    return Response.json({ token });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
});
