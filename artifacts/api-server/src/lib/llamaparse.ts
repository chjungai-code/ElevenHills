/**
 * Thin LlamaParse (LlamaCloud) client.
 *
 * Uploads a single PDF and waits for the markdown result.
 * Docs: https://docs.cloud.llamaindex.ai/llamaparse/api_reference
 */

const BASE = process.env.LLAMA_CLOUD_BASE_URL ?? "https://api.cloud.llamaindex.ai";
const POLL_INTERVAL_MS = 1500;
const POLL_TIMEOUT_MS = 120_000;

export class LlamaParseError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "LlamaParseError";
  }
}

export function isConfigured(): boolean {
  return Boolean(process.env.LLAMA_CLOUD_API_KEY);
}

function authHeaders(): Record<string, string> {
  const key = process.env.LLAMA_CLOUD_API_KEY;
  if (!key) {
    throw new LlamaParseError(
      "LLAMA_CLOUD_API_KEY is not configured on the server.",
      503,
    );
  }
  return { Authorization: `Bearer ${key}` };
}

async function uploadPdf(
  buffer: Buffer,
  filename: string,
): Promise<string> {
  const form = new FormData();
  // Korean financial PDFs render best in markdown table mode.
  form.set("result_type", "markdown");
  form.set("language", "ko");
  // node 20+ Blob accepts ArrayBuffer / Uint8Array
  form.set(
    "file",
    new Blob([new Uint8Array(buffer)], { type: "application/pdf" }),
    filename,
  );

  const res = await fetch(`${BASE}/api/v1/parsing/upload`, {
    method: "POST",
    headers: authHeaders(),
    body: form,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new LlamaParseError(
      `LlamaParse upload failed: HTTP ${res.status} ${res.statusText}${text ? ` — ${text.slice(0, 300)}` : ""}`,
      res.status,
    );
  }

  const json = (await res.json()) as { id?: string };
  if (!json.id) {
    throw new LlamaParseError("LlamaParse upload returned no job id");
  }
  return json.id;
}

async function pollJob(jobId: string): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < POLL_TIMEOUT_MS) {
    const res = await fetch(
      `${BASE}/api/v1/parsing/job/${encodeURIComponent(jobId)}`,
      { headers: authHeaders() },
    );
    if (!res.ok) {
      throw new LlamaParseError(
        `LlamaParse job status failed: HTTP ${res.status}`,
        res.status,
      );
    }
    const json = (await res.json()) as { status?: string };
    const status = (json.status ?? "").toUpperCase();
    if (status === "SUCCESS") return;
    if (status === "ERROR" || status === "CANCELLED" || status === "FAILED") {
      throw new LlamaParseError(`LlamaParse job ${status.toLowerCase()}`);
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
  throw new LlamaParseError("LlamaParse job timed out");
}

async function fetchMarkdown(jobId: string): Promise<string> {
  const res = await fetch(
    `${BASE}/api/v1/parsing/job/${encodeURIComponent(jobId)}/result/markdown`,
    { headers: authHeaders() },
  );
  if (!res.ok) {
    throw new LlamaParseError(
      `LlamaParse markdown fetch failed: HTTP ${res.status}`,
      res.status,
    );
  }
  const json = (await res.json()) as { markdown?: string };
  if (typeof json.markdown !== "string") {
    throw new LlamaParseError("LlamaParse result missing markdown field");
  }
  return json.markdown;
}

/**
 * Convert a PDF buffer to markdown via LlamaParse.
 * Blocks (with bounded poll loop) until the parse job completes.
 */
export async function parsePdfToMarkdown(
  buffer: Buffer,
  filename = "statement.pdf",
): Promise<string> {
  const jobId = await uploadPdf(buffer, filename);
  await pollJob(jobId);
  return fetchMarkdown(jobId);
}
