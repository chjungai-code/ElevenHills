import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { revenueTable } from "@workspace/db/schema";
import { eq, and, type SQL } from "drizzle-orm";

const router: IRouter = Router();

router.get("/revenue", async (req, res) => {
  try {
    const { company_id, year, month } = req.query;

    const conditions: SQL[] = [];

    if (typeof company_id === "string" && company_id) {
      conditions.push(eq(revenueTable.company_id, company_id));
    }
    if (typeof year === "string" && year) {
      const yearNum = parseInt(year, 10);
      if (!Number.isInteger(yearNum) || yearNum < 1900 || yearNum > 2100) {
        res
          .status(400)
          .json({ error: "Invalid 'year' query parameter (expected integer 1900-2100)" });
        return;
      }
      conditions.push(eq(revenueTable.year, yearNum));
    }
    if (typeof month === "string" && month) {
      const monthNum = parseInt(month, 10);
      if (!Number.isInteger(monthNum) || monthNum < 1 || monthNum > 12) {
        res
          .status(400)
          .json({ error: "Invalid 'month' query parameter (expected integer 1-12)" });
        return;
      }
      conditions.push(eq(revenueTable.month, monthNum));
    }

    const rows =
      conditions.length > 0
        ? await db.select().from(revenueTable).where(and(...conditions))
        : await db.select().from(revenueTable);

    res.json(rows);
  } catch (err) {
    req.log.error(err, "Failed to fetch revenue");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
