import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { sql, inArray } from "drizzle-orm";
import { companyTable } from "../schema/company.js";
import {
  kpiDefinitionTable,
  kpiObservationTable,
} from "../schema/kpi.js";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL must be set");
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool);

const COMPANY_IDS = {
  CITY_OF_DREAMS: "c0000001-0000-0000-0000-000000000007",
  SGD_PARTNERS: "c0000001-0000-0000-0000-000000000005",
  TAEMAN_WORLD: "c0000001-0000-0000-0000-000000000004",
} as const;

const DEFINITIONS = [
  {
    code: "occupancy_rate",
    display_name_ko: "공실률",
    unit: "%",
    format: ",.1%",
    target_kind: "lower_is_better",
    description: "임대 가능 면적 대비 공실 면적 비율",
  },
  {
    code: "wale",
    display_name_ko: "WALE",
    unit: "년",
    format: ",.1f",
    target_kind: "higher_is_better",
    description: "Weighted Average Lease Expiry — 가중평균 잔여 임대기간",
  },
  {
    code: "noi_yield",
    display_name_ko: "NOI 수익률",
    unit: "%",
    format: ",.1%",
    target_kind: "higher_is_better",
    description: "순영업이익 / 자산가치",
  },
] as const;

type ObsRow = {
  kpi_code: string;
  company_id: string | null;
  period_kind: string;
  period_start: string;
  value: string;
  target: string | null;
  source: string;
};

function monthlyDates(year: number, throughMonth: number): string[] {
  const out: string[] = [];
  for (let m = 1; m <= throughMonth; m++) {
    out.push(`${year}-${String(m).padStart(2, "0")}-01`);
  }
  return out;
}

async function seed() {
  console.log("Seeding kpi_definition…");
  await db
    .insert(kpiDefinitionTable)
    .values(DEFINITIONS as never)
    .onConflictDoUpdate({
      target: kpiDefinitionTable.code,
      set: {
        display_name_ko: sql`excluded.display_name_ko`,
        unit: sql`excluded.unit`,
        format: sql`excluded.format`,
        target_kind: sql`excluded.target_kind`,
        description: sql`excluded.description`,
      },
    });

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;

  const observations: ObsRow[] = [];

  // Filter to only companies that actually exist in the DB; fall back to a
  // single group-level (NULL company_id) series when none do, so this seed
  // works on a fresh database regardless of whether company seed has run.
  const wanted = [
    COMPANY_IDS.CITY_OF_DREAMS,
    COMPANY_IDS.SGD_PARTNERS,
    COMPANY_IDS.TAEMAN_WORLD,
  ];
  const existing = (
    await db
      .select({ id: companyTable.id })
      .from(companyTable)
      .where(inArray(companyTable.id, wanted as unknown as string[]))
  ).map((r) => r.id);
  const targets: Array<string | null> = existing.length > 0 ? existing : [null];
  console.log(
    `Using ${targets.length} target company id(s): ${targets
      .map((t) => t ?? "NULL (group-level)")
      .join(", ")}`,
  );

  for (const company of targets) {
    // Occupancy: monthly observations for prior + current year-to-date
    for (const year of [currentYear - 1, currentYear]) {
      const through = year === currentYear ? currentMonth : 12;
      for (const period_start of monthlyDates(year, through)) {
        const base = 0.06 + Math.random() * 0.04; // 6%–10% vacancy
        observations.push({
          kpi_code: "occupancy_rate",
          company_id: company,
          period_kind: "monthly",
          period_start,
          value: base.toFixed(4),
          target: "0.0500",
          source: "manual",
        });
      }
    }

    // WALE: quarterly snapshots
    for (const year of [currentYear - 1, currentYear]) {
      const maxQ = year === currentYear ? Math.ceil(currentMonth / 3) : 4;
      for (let q = 1; q <= maxQ; q++) {
        const month = (q - 1) * 3 + 1;
        observations.push({
          kpi_code: "wale",
          company_id: company,
          period_kind: "quarterly",
          period_start: `${year}-${String(month).padStart(2, "0")}-01`,
          value: (4 + Math.random() * 2).toFixed(2),
          target: "5.00",
          source: "manual",
        });
      }
    }

    // NOI yield: annual
    for (const year of [currentYear - 2, currentYear - 1]) {
      observations.push({
        kpi_code: "noi_yield",
        company_id: company,
        period_kind: "annual",
        period_start: `${year}-01-01`,
        value: (0.045 + Math.random() * 0.02).toFixed(4),
        target: "0.0600",
        source: "manual",
      });
    }
  }

  console.log(`Inserting ${observations.length} kpi_observation rows…`);
  await db
    .insert(kpiObservationTable)
    .values(observations as never)
    .onConflictDoUpdate({
      target: [
        kpiObservationTable.kpi_code,
        kpiObservationTable.company_id,
        kpiObservationTable.period_kind,
        kpiObservationTable.period_start,
      ],
      set: {
        value: sql`excluded.value`,
        target: sql`excluded.target`,
        source: sql`excluded.source`,
      },
    });

  console.log("Done.");
  await pool.end();
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
