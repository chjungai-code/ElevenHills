import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { sql, eq } from "drizzle-orm";
import {
  companyTable,
  companyLocationTable,
  personTable,
  familyRelationshipTable,
  ownershipTable,
  storeTable,
} from "@workspace/db/schema";
import { COMPANIES_SEED, FAMILY_MEMBERS, COMPANY_IDS } from "./data/companies-seed.js";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL must be set");
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool);

const TODAY = new Date().toISOString().slice(0, 10);

async function backfill() {
  console.log("Starting companies backfill…");

  // ── company ────────────────────────────────────────────────
  // Insert in order so parent_id references resolve. The seed already lists
  // holding before subsidiaries before sub_entities.
  for (let i = 0; i < COMPANIES_SEED.length; i++) {
    const c = COMPANIES_SEED[i];
    await db
      .insert(companyTable)
      .values({
        id: c.id,
        name: c.name,
        short_name: c.short_name,
        category: c.category,
        parent_id: c.parent_id,
        display_order: i,
      })
      .onConflictDoUpdate({
        target: companyTable.id,
        set: {
          name: c.name,
          short_name: c.short_name,
          category: c.category,
          parent_id: c.parent_id,
          display_order: i,
          updated_at: sql`now()`,
        },
      });
  }
  console.log(`  ✓ ${COMPANIES_SEED.length} companies upserted`);

  // ── company_location ──────────────────────────────────────
  // Reset and reinsert (locations are an ordered list; we overwrite).
  await db.delete(companyLocationTable);
  let locCount = 0;
  for (const c of COMPANIES_SEED) {
    for (let i = 0; i < c.locations.length; i++) {
      await db.insert(companyLocationTable).values({
        company_id: c.id,
        name: c.locations[i],
        display_order: i,
        is_active: true,
      });
      locCount++;
    }
  }
  console.log(`  ✓ ${locCount} company_location rows inserted`);

  // ── person ────────────────────────────────────────────────
  // Family members (with role + color) plus every individual shareholder.
  const personMap = new Map<string, { is_family: boolean; role?: string; color?: string; order: number }>();

  for (let i = 0; i < FAMILY_MEMBERS.length; i++) {
    const fm = FAMILY_MEMBERS[i];
    personMap.set(fm.name, { is_family: true, role: fm.role, color: fm.color, order: i });
  }
  let personOrder = FAMILY_MEMBERS.length;
  for (const c of COMPANIES_SEED) {
    for (const sh of c.shareholders) {
      if (sh.is_entity) continue;
      if (!personMap.has(sh.name)) {
        personMap.set(sh.name, { is_family: false, order: personOrder++ });
      }
    }
  }

  for (const [name, meta] of personMap) {
    await db
      .insert(personTable)
      .values({
        name,
        is_family: meta.is_family,
        family_role: meta.role ?? null,
        display_color: meta.color ?? null,
        display_order: meta.order,
      })
      .onConflictDoUpdate({
        target: personTable.name,
        set: {
          is_family: meta.is_family,
          family_role: meta.role ?? null,
          display_color: meta.color ?? null,
          display_order: meta.order,
        },
      });
  }
  console.log(`  ✓ ${personMap.size} persons upserted`);

  // Look up person ids for ownership and family_relationship inserts.
  const personRows = await db.select().from(personTable);
  const personIdByName = new Map(personRows.map((p) => [p.name, p.id]));

  // ── family_relationship ──────────────────────────────────
  // Derive from FAMILY_MEMBERS: 대표 ↔ 배우자 = spouse; 대표/배우자 → 자녀 = parent_of.
  await db.delete(familyRelationshipTable);
  const head = FAMILY_MEMBERS.find((m) => m.role === '대표');
  const spouse = FAMILY_MEMBERS.find((m) => m.role === '배우자');
  const children = FAMILY_MEMBERS.filter((m) => m.role === '자녀');
  let relCount = 0;
  if (head && spouse) {
    const a = personIdByName.get(head.name)!;
    const b = personIdByName.get(spouse.name)!;
    await db.insert(familyRelationshipTable).values({ person_a_id: a, person_b_id: b, kind: 'spouse' });
    relCount++;
  }
  for (const child of children) {
    const childId = personIdByName.get(child.name)!;
    if (head) {
      await db.insert(familyRelationshipTable).values({
        person_a_id: personIdByName.get(head.name)!,
        person_b_id: childId,
        kind: 'parent_of',
      });
      relCount++;
    }
    if (spouse) {
      await db.insert(familyRelationshipTable).values({
        person_a_id: personIdByName.get(spouse.name)!,
        person_b_id: childId,
        kind: 'parent_of',
      });
      relCount++;
    }
  }
  console.log(`  ✓ ${relCount} family_relationship rows inserted`);

  // ── ownership ────────────────────────────────────────────
  await db.delete(ownershipTable);
  // Map company name → company id (for entity shareholders that match a known company).
  const companyIdByName = new Map(COMPANIES_SEED.map((c) => [c.name, c.id]));
  let ownerCount = 0;
  for (const c of COMPANIES_SEED) {
    for (let i = 0; i < c.shareholders.length; i++) {
      const sh = c.shareholders[i];
      const ownerCompanyId = sh.is_entity ? companyIdByName.get(sh.name) ?? null : null;
      const ownerPersonId = !sh.is_entity ? personIdByName.get(sh.name) ?? null : null;
      await db.insert(ownershipTable).values({
        company_id: c.id,
        owner_company_id: ownerCompanyId,
        owner_person_id: ownerPersonId,
        owner_name: sh.name,
        is_entity: sh.is_entity,
        percentage: String(sh.percentage),
        as_of: TODAY,
        display_order: i,
      });
      ownerCount++;
    }
  }
  console.log(`  ✓ ${ownerCount} ownership rows inserted`);

  // ── store ───────────────────────────────────────────────
  // Each location on a non-holding company is also a physical store.
  // The holding company has no operating stores. We treat the location
  // list as the source of truth for store names; if the same physical
  // address appears multiple times in a single location string (e.g.
  // "오클리 밴더 매장 ×6"), it is recorded as a single store row.
  await db.delete(storeTable);
  let storeCount = 0;
  for (const c of COMPANIES_SEED) {
    if (c.category === "holding") continue;
    for (const name of c.locations) {
      await db.insert(storeTable).values({ company_id: c.id, name });
      storeCount++;
    }
  }
  console.log(`  ✓ ${storeCount} store rows inserted`);

  // Sanity check
  const eh = await db.select().from(companyTable).where(eq(companyTable.id, COMPANY_IDS.ELEVEN_HILLS));
  if (eh.length !== 1) throw new Error("Backfill verification failed: holding company not found");

  console.log("Backfill complete.");
}

backfill()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
