import { Router, type IRouter } from "express";
import { METRICS, executeQuery, QueryError } from "@workspace/db";
import { RunQueryBody } from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/metrics", (_req, res) => {
  res.json(METRICS);
});

router.post("/query", async (req, res) => {
  // Validate the request body against the OpenAPI-generated zod schema
  // so the typed contract is enforced at runtime, not just at compile time.
  const parsed = RunQueryBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: `Invalid query request: ${parsed.error.issues
        .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
        .join("; ")}`,
    });
    return;
  }

  try {
    // Cast: the generated zod type is structurally identical to QueryRequest;
    // string-typed `col`/`metrics` are validated against the registry inside
    // executeQuery so unknown values surface as 400s.
    const result = await executeQuery(parsed.data as never);
    res.json(result);
  } catch (err) {
    if (err instanceof QueryError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    req.log.error(err, "Failed to execute query");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
