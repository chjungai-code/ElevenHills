/**
 * Thin LlamaParse (LlamaCloud) client wrapper.
 *
 * Uses the official @llamaindex/llama-cloud SDK to upload a single PDF
 * and return the parsed markdown.
 *
 * Flow (per LlamaCloud guideline):
 *   1. client.files.create({ file, purpose: "parse" })  → file id
 *   2. client.parsing.parse({ file_id, tier, expand })  → parsed result
 *   3. return result.markdown_full (fallback to result.markdown.md)
 */

import LlamaCloud, { toFile, APIError } from "@llamaindex/llama-cloud";

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

function getClient(): LlamaCloud {
  const apiKey = process.env.LLAMA_CLOUD_API_KEY;
  if (!apiKey) {
    throw new LlamaParseError(
      "LLAMA_CLOUD_API_KEY is not configured on the server.",
      503,
    );
  }
  // SDK reads LLAMA_CLOUD_BASE_URL automatically; pass apiKey explicitly so
  // tests / scripts using a different env name still work.
  return new LlamaCloud({ apiKey });
}

function wrapError(err: unknown, prefix: string): LlamaParseError {
  if (err instanceof APIError) {
    const detail =
      err.error && typeof err.error === "object"
        ? JSON.stringify(err.error).slice(0, 300)
        : err.message;
    return new LlamaParseError(
      `${prefix}: HTTP ${err.status ?? "?"}${detail ? ` — ${detail}` : ""}`,
      typeof err.status === "number" ? err.status : undefined,
    );
  }
  if (err instanceof Error) {
    return new LlamaParseError(`${prefix}: ${err.message}`);
  }
  return new LlamaParseError(`${prefix}: ${String(err)}`);
}

/**
 * Convert a PDF buffer to markdown via LlamaParse.
 * Blocks until the parse job completes (the SDK polls internally).
 */
export async function parsePdfToMarkdown(
  buffer: Buffer,
  filename = "statement.pdf",
): Promise<string> {
  const client = getClient();

  // 1. Upload the PDF as a "parse" file.
  const uploadable = await toFile(new Uint8Array(buffer), filename, {
    type: "application/pdf",
  });
  let fileId: string;
  try {
    const fileObj = await client.files.create({
      file: uploadable,
      purpose: "parse",
    });
    fileId = fileObj.id;
  } catch (err) {
    throw wrapError(err, "LlamaParse file upload failed");
  }

  // 2. Kick off the parse job and wait for completion (SDK polls).
  //    Korean financial PDFs render best with the agentic tier and the
  //    full-document markdown expansion.
  let result;
  try {
    result = await client.parsing.parse({
      file_id: fileId,
      tier: "agentic",
      version: "latest",
      expand: ["markdown_full", "markdown"],
    });
  } catch (err) {
    throw wrapError(err, "LlamaParse parse job failed");
  }

  // 3. Prefer the full-document markdown; fall back to the per-page
  //    markdown's joined `md` if `markdown_full` is empty.
  const full = result.markdown_full;
  if (typeof full === "string" && full.trim().length > 0) {
    return full;
  }
  const pages = result.markdown?.pages;
  if (Array.isArray(pages) && pages.length > 0) {
    const joined = pages
      .map((p) => ("markdown" in p && typeof p.markdown === "string" ? p.markdown : ""))
      .filter((s) => s.length > 0)
      .join("\n\n");
    if (joined.trim().length > 0) return joined;
  }
  throw new LlamaParseError("LlamaParse result missing markdown content");
}
