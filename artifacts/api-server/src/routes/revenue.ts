import { Router, type IRouter } from "express";
import {
  selectRevenueRows,
  QueryError,
  type QueryFilter,
} from "@workspace/db";

const router: IRouter = Router();

/**
 * GET /api/revenue
 *
 * Legacy row-level read. Re-implemented internally on top of the typed
 * filter pipeline shared with POST /api/query (see selectRevenueRows in
 * lib/db/src/metrics/index.ts) so the existing useGetRevenue hook keeps
 * working unchanged while every revenue read goes through the same
 * filter→SQL builder.
 */
router.get("/revenue", async (req, res) => {
  try {
    const { company_id, year, month } = req.query;
    const filters: QueryFilter[] = [];

    if (typeof company_id === "string" && company_id) {
      filters.push({ col: "company_id", op: "eq", value: company_id });
    }
    if (typeof year === "string" && year) {
      const yearNum = parseInt(year, 10);
      if (!Number.isInteger(yearNum) || yearNum < 1900 || yearNum > 2100) {
        res.status(400).json({
          error:
            "Invalid 'year' query parameter (expected integer 1900-2100)",
        });
        return;
      }
      filters.push({ col: "year", op: "eq", value: yearNum });
    }
    if (typeof month === "string" && month) {
      const monthNum = parseInt(month, 10);
      if (!Number.isInteger(monthNum) || monthNum < 1 || monthNum > 12) {
        res.status(400).json({
          error: "Invalid 'month' query parameter (expected integer 1-12)",
        });
        return;
      }
      filters.push({ col: "month", op: "eq", value: monthNum });
    }

    const rows = await selectRevenueRows({ filters });
    res.json(rows);
  } catch (err) {
    if (err instanceof QueryError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    req.log.error(err, "Failed to fetch revenue");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
