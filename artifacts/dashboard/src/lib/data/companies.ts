import type { CompanyWithRelations as ApiCompanyWithRelations } from '@workspace/api-client-react'
import type { CompanyCategory, CompanyWithRelations } from '@/types'

/**
 * Converts the loosely-typed API response (where `directors` is `object[]`
 * and `category` is `string`) into the strongly-typed shape the dashboard
 * components consume. Directors aren't returned by the API yet, so we drop
 * them down to an empty array.
 */
export function fromApiCompanies(
  apiCompanies: ApiCompanyWithRelations[],
): CompanyWithRelations[] {
  return apiCompanies.map(c => ({
    id: c.id,
    name: c.name,
    short_name: c.short_name ?? null,
    category: c.category as CompanyCategory,
    parent_id: c.parent_id ?? null,
    locations: c.locations,
    created_at: c.created_at,
    shareholders: c.shareholders.map(s => ({
      id: s.id,
      company_id: s.company_id,
      name: s.name,
      percentage: s.percentage,
      is_entity: s.is_entity,
      updated_at: s.updated_at,
    })),
    directors: [],
  }))
}

// Stable UUIDs for the companies. The seed (and live DB) use these IDs so
// `revenue.company_id` joins continue to work. The runtime values now come
// from the API (`useGetCompanies`); these constants remain as a typed
// reference for any code that still needs to mention a specific company.
export const COMPANY_IDS = {
  ELEVEN_HILLS:   'c0000001-0000-0000-0000-000000000001',
  COD_RETAIL:     'c0000001-0000-0000-0000-000000000002',
  COD_VISION:     'c0000001-0000-0000-0000-000000000003',
  TAEMAN_WORLD:   'c0000001-0000-0000-0000-000000000004',
  SGD_PARTNERS:   'c0000001-0000-0000-0000-000000000005',
  NRD:            'c0000001-0000-0000-0000-000000000006',
  CITY_OF_DREAMS: 'c0000001-0000-0000-0000-000000000007',
  COD_SPORTS:     'c0000001-0000-0000-0000-000000000008',
  BNF_SPORTS:     'c0000001-0000-0000-0000-000000000009',
} as const

/** Builds a tree from a flat list of companies returned by the API. */
export function buildCompanyTree(companies: CompanyWithRelations[]): {
  holding: CompanyWithRelations | null
  standalones: CompanyWithRelations[]
} {
  const byId = new Map(companies.map(c => [c.id, { ...c, children: [] as CompanyWithRelations[] }]))

  for (const company of byId.values()) {
    if (company.parent_id && byId.has(company.parent_id)) {
      byId.get(company.parent_id)!.children!.push(company)
    }
  }

  const holding = byId.get(COMPANY_IDS.ELEVEN_HILLS) ?? null
  const standalones = companies
    .filter(c => c.category === 'standalone')
    .map(c => byId.get(c.id)!)
    .filter(Boolean)

  return { holding, standalones }
}
