import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { revenueTable } from "../schema/revenue.js";
import { sql } from "drizzle-orm";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL must be set");
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool);

const COMPANY_IDS = {
  ELEVEN_HILLS:   'c0000001-0000-0000-0000-000000000001',
  COD_RETAIL:     'c0000001-0000-0000-0000-000000000002',
  COD_VISION:     'c0000001-0000-0000-0000-000000000003',
  TAEMAN_WORLD:   'c0000001-0000-0000-0000-000000000004',
  SGD_PARTNERS:   'c0000001-0000-0000-0000-000000000005',
  NRD:            'c0000001-0000-0000-0000-000000000006',
  CITY_OF_DREAMS: 'c0000001-0000-0000-0000-000000000007',
  COD_SPORTS:     'c0000001-0000-0000-0000-000000000008',
  BNF_SPORTS:     'c0000001-0000-0000-0000-000000000009',
} as const;

// Base monthly revenue targets per company (in KRW 만원 units)
const BASE_REVENUE: Record<string, number> = {
  [COMPANY_IDS.ELEVEN_HILLS]:   0,        // Holding — no direct revenue
  [COMPANY_IDS.COD_RETAIL]:     180_000,  // ~1.8억/month
  [COMPANY_IDS.COD_VISION]:     90_000,   // ~9000만/month
  [COMPANY_IDS.TAEMAN_WORLD]:   250_000,  // ~2.5억/month
  [COMPANY_IDS.SGD_PARTNERS]:   120_000,  // ~1.2억/month
  [COMPANY_IDS.NRD]:            60_000,   // ~6000만/month
  [COMPANY_IDS.CITY_OF_DREAMS]: 320_000,  // ~3.2억/month (flagship)
  [COMPANY_IDS.COD_SPORTS]:     140_000,  // ~1.4억/month
  [COMPANY_IDS.BNF_SPORTS]:     80_000,   // ~8000만/month
};

// Seasonal multipliers (month index 1-12)
const SEASONAL: Record<number, number> = {
  1: 0.75, 2: 0.80, 3: 0.90, 4: 0.95,
  5: 1.00, 6: 1.10, 7: 1.20, 8: 1.25,
  9: 1.05, 10: 1.00, 11: 1.10, 12: 1.30,
};

function jitter(base: number, pct = 0.08): number {
  return Math.round(base * (1 + (Math.random() * 2 - 1) * pct));
}

type InsertRow = {
  company_id: string;
  year: number;
  month: number;
  amount: string;
  category?: string;
  memo?: string;
};

async function seed() {
  const rows: InsertRow[] = [];

  const currentYear = new Date().getFullYear();
  const years = [currentYear - 1, currentYear];

  for (const [companyId, base] of Object.entries(BASE_REVENUE)) {
    if (base === 0) continue; // Skip holding with no revenue

    for (const year of years) {
      const maxMonth = year === currentYear ? new Date().getMonth() + 1 : 12; // up to current month (getMonth() is 0-based)
      for (let month = 1; month <= maxMonth; month++) {
        const seasonal = SEASONAL[month] ?? 1;
        const amount = jitter(base * seasonal);
        rows.push({
          company_id: companyId,
          year,
          month,
          amount: amount.toString(),
          category: '매출',
        });
      }
    }
  }

  console.log(`Seeding ${rows.length} revenue rows…`);

  // Upsert in batches of 50
  const BATCH = 50;
  let inserted = 0;
  let updated = 0;

  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const result = await db
      .insert(revenueTable)
      .values(batch)
      .onConflictDoUpdate({
        target: [
          revenueTable.company_id,
          revenueTable.year,
          revenueTable.month,
          revenueTable.category,
        ],
        set: {
          amount: sql`excluded.amount`,
          memo: sql`excluded.memo`,
        },
      })
      .returning({
        id: revenueTable.id,
        xmax: sql<string>`xmax::text`,
      });
    for (const row of result) {
      if (row.xmax === "0") {
        inserted++;
      } else {
        updated++;
      }
    }
  }

  console.log(`Done — ${inserted} inserted, ${updated} updated (${inserted + updated} total).`);
  await pool.end();
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
