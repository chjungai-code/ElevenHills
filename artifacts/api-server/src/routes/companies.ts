import { Router, type IRouter, type Request } from "express";
import { db } from "@workspace/db";
import {
  companyTable,
  companyLocationTable,
  ownershipTable,
  personTable,
} from "@workspace/db/schema";
import { asc } from "drizzle-orm";

function logError(req: Request, err: unknown, msg: string): void {
  const log = (req as { log?: { error: (err: unknown, msg: string) => void } }).log;
  if (log) log.error(err, msg);
  else console.error(msg, err);
}

const router: IRouter = Router();

type ApiShareholder = {
  id: string;
  company_id: string;
  name: string;
  percentage: number;
  is_entity: boolean;
  updated_at: string;
};

type ApiCompany = {
  id: string;
  name: string;
  short_name: string | null;
  category: string;
  parent_id: string | null;
  locations: string[];
  created_at: string;
  shareholders: ApiShareholder[];
  directors: never[];
};

router.get("/companies", async (req, res) => {
  try {
    const [companies, locations, ownerships] = await Promise.all([
      db
        .select()
        .from(companyTable)
        .orderBy(asc(companyTable.display_order), asc(companyTable.name)),
      db
        .select()
        .from(companyLocationTable)
        .orderBy(
          asc(companyLocationTable.company_id),
          asc(companyLocationTable.display_order),
        ),
      db
        .select()
        .from(ownershipTable)
        .orderBy(
          asc(ownershipTable.company_id),
          asc(ownershipTable.display_order),
        ),
    ]);

    const locByCompany = new Map<string, string[]>();
    for (const loc of locations) {
      if (!loc.is_active) continue;
      const list = locByCompany.get(loc.company_id) ?? [];
      list.push(loc.name);
      locByCompany.set(loc.company_id, list);
    }

    const ownersByCompany = new Map<string, ApiShareholder[]>();
    for (const o of ownerships) {
      const list = ownersByCompany.get(o.company_id) ?? [];
      list.push({
        id: o.id,
        company_id: o.company_id,
        name: o.owner_name,
        percentage: Number(o.percentage),
        is_entity: o.is_entity,
        updated_at: o.updated_at.toISOString(),
      });
      ownersByCompany.set(o.company_id, list);
    }

    const result: ApiCompany[] = companies.map((c) => ({
      id: c.id,
      name: c.name,
      short_name: c.short_name,
      category: c.category,
      parent_id: c.parent_id,
      locations: locByCompany.get(c.id) ?? [],
      created_at: c.created_at.toISOString(),
      shareholders: ownersByCompany.get(c.id) ?? [],
      directors: [],
    }));

    res.json(result);
  } catch (err) {
    logError(req, err, "Failed to fetch companies");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/family", async (req, res) => {
  try {
    const rows = await db
      .select()
      .from(personTable)
      .orderBy(asc(personTable.display_order), asc(personTable.name));

    const family = rows
      .filter((p) => p.is_family)
      .map((p) => ({
        name: p.name,
        role: p.family_role ?? "",
        color: p.display_color ?? "#6a6a80",
      }));

    res.json(family);
  } catch (err) {
    logError(req, err, "Failed to fetch family members");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
