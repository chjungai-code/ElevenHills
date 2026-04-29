import { CompanyWithRelations, FamilyMember } from '@/types'

// Stable UUIDs for seed data / local dev (replace with Supabase UUIDs after migration)
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

export const FAMILY_MEMBERS: FamilyMember[] = [
  { name: '정주현', role: '대표',  color: '#c8a96e' },
  { name: '이효진', role: '배우자', color: '#7eb8d4' },
  { name: '정찬희', role: '자녀',  color: '#85c49a' },
  { name: '정솔희', role: '자녀',  color: '#85c49a' },
]

export const COMPANIES_SEED: CompanyWithRelations[] = [
  // ── 최상위 홀딩 ─────────────────────────────────────────────
  {
    id: COMPANY_IDS.ELEVEN_HILLS,
    name: '일레븐힐스',
    short_name: 'EH',
    category: 'holding',
    parent_id: null,
    locations: [],
    created_at: '2024-01-01T00:00:00Z',
    shareholders: [
      { id: 's01', company_id: COMPANY_IDS.ELEVEN_HILLS, name: '정주현', percentage: 41, is_entity: false, updated_at: '2025-01-01T00:00:00Z' },
      { id: 's02', company_id: COMPANY_IDS.ELEVEN_HILLS, name: '서봉균', percentage: 27, is_entity: false, updated_at: '2025-01-01T00:00:00Z' },
      { id: 's03', company_id: COMPANY_IDS.ELEVEN_HILLS, name: '양재준', percentage:  8, is_entity: false, updated_at: '2025-01-01T00:00:00Z' },
      { id: 's04', company_id: COMPANY_IDS.ELEVEN_HILLS, name: '임종현', percentage:  8, is_entity: false, updated_at: '2025-01-01T00:00:00Z' },
      { id: 's05', company_id: COMPANY_IDS.ELEVEN_HILLS, name: '정찬희', percentage:  8, is_entity: false, updated_at: '2025-01-01T00:00:00Z' },
      { id: 's06', company_id: COMPANY_IDS.ELEVEN_HILLS, name: '정솔희', percentage:  8, is_entity: false, updated_at: '2025-01-01T00:00:00Z' },
    ],
    directors: [],
  },

  // ── 일레븐힐스 자회사 ─────────────────────────────────────────
  {
    id: COMPANY_IDS.COD_RETAIL,
    name: '씨오디 리테일',
    short_name: 'COD Retail',
    category: 'subsidiary',
    parent_id: COMPANY_IDS.ELEVEN_HILLS,
    locations: ['명동 밀리오레', '홍대 와이즈파크', '신제주 3호건물'],
    created_at: '2024-01-01T00:00:00Z',
    shareholders: [
      { id: 's07', company_id: COMPANY_IDS.COD_RETAIL, name: '일레븐힐스', percentage: 60, is_entity: true,  updated_at: '2025-01-01T00:00:00Z' },
      { id: 's08', company_id: COMPANY_IDS.COD_RETAIL, name: '사공훈',     percentage: 20, is_entity: false, updated_at: '2025-01-01T00:00:00Z' },
      { id: 's09', company_id: COMPANY_IDS.COD_RETAIL, name: '씨엘로',     percentage: 20, is_entity: true,  updated_at: '2025-01-01T00:00:00Z' },
    ],
    directors: [],
  },

  {
    id: COMPANY_IDS.COD_VISION,
    name: '씨오디 비전',
    short_name: 'COD Vision',
    category: 'sub_entity',
    parent_id: COMPANY_IDS.COD_RETAIL,
    locations: ['오클리 밴더 매장 ×6'],
    created_at: '2024-01-01T00:00:00Z',
    shareholders: [
      { id: 's10', company_id: COMPANY_IDS.COD_VISION, name: '씨오디 리테일', percentage: 100, is_entity: true, updated_at: '2025-01-01T00:00:00Z' },
    ],
    directors: [],
  },

  {
    id: COMPANY_IDS.TAEMAN_WORLD,
    name: '태맨월드',
    short_name: 'Taeman',
    category: 'subsidiary',
    parent_id: COMPANY_IDS.ELEVEN_HILLS,
    locations: ['CK 명동', 'CK 홍대', 'CK 성수', '신제주 베르쉬', '신제주 블루'],
    created_at: '2024-01-01T00:00:00Z',
    shareholders: [
      { id: 's11', company_id: COMPANY_IDS.TAEMAN_WORLD, name: '일레븐힐스', percentage: 50, is_entity: true,  updated_at: '2025-01-01T00:00:00Z' },
      { id: 's12', company_id: COMPANY_IDS.TAEMAN_WORLD, name: '기규영',     percentage: 50, is_entity: false, updated_at: '2025-01-01T00:00:00Z' },
    ],
    directors: [],
  },

  {
    id: COMPANY_IDS.SGD_PARTNERS,
    name: '에스지디파트너스',
    short_name: 'SGD',
    category: 'subsidiary',
    parent_id: COMPANY_IDS.ELEVEN_HILLS,
    locations: ['신제주 올영', '이태원 건물'],
    created_at: '2024-01-01T00:00:00Z',
    shareholders: [
      { id: 's13', company_id: COMPANY_IDS.SGD_PARTNERS, name: '일레븐힐스', percentage: 10,   is_entity: true,  updated_at: '2025-01-01T00:00:00Z' },
      { id: 's14', company_id: COMPANY_IDS.SGD_PARTNERS, name: '이효진',     percentage: 22.5, is_entity: false, updated_at: '2025-01-01T00:00:00Z' },
      { id: 's15', company_id: COMPANY_IDS.SGD_PARTNERS, name: '서봉균',     percentage: 22.5, is_entity: false, updated_at: '2025-01-01T00:00:00Z' },
      { id: 's16', company_id: COMPANY_IDS.SGD_PARTNERS, name: '사공훈',     percentage: 22.5, is_entity: false, updated_at: '2025-01-01T00:00:00Z' },
      { id: 's17', company_id: COMPANY_IDS.SGD_PARTNERS, name: '박성민',     percentage: 22.5, is_entity: false, updated_at: '2025-01-01T00:00:00Z' },
    ],
    directors: [],
  },

  {
    id: COMPANY_IDS.NRD,
    name: '엔알디',
    short_name: 'NRD',
    category: 'subsidiary',
    parent_id: COMPANY_IDS.ELEVEN_HILLS,
    locations: ['능라도'],
    created_at: '2024-01-01T00:00:00Z',
    shareholders: [
      { id: 's18', company_id: COMPANY_IDS.NRD, name: '일레븐힐스', percentage: 40, is_entity: true,  updated_at: '2025-01-01T00:00:00Z' },
      { id: 's19', company_id: COMPANY_IDS.NRD, name: '씨엘로',     percentage: 40, is_entity: true,  updated_at: '2025-01-01T00:00:00Z' },
      { id: 's20', company_id: COMPANY_IDS.NRD, name: '사공훈',     percentage: 20, is_entity: false, updated_at: '2025-01-01T00:00:00Z' },
    ],
    directors: [],
  },

  // ── 별도 법인 (일레븐힐스 미관여) ────────────────────────────────
  {
    id: COMPANY_IDS.CITY_OF_DREAMS,
    name: '씨티오브드림스',
    short_name: 'COD',
    category: 'standalone',
    parent_id: null,
    locations: ['제주 칠성점'],
    created_at: '2024-01-01T00:00:00Z',
    shareholders: [
      { id: 's21', company_id: COMPANY_IDS.CITY_OF_DREAMS, name: '정주현', percentage: 41,   is_entity: false, updated_at: '2025-01-01T00:00:00Z' },
      { id: 's22', company_id: COMPANY_IDS.CITY_OF_DREAMS, name: '서봉균', percentage: 20,   is_entity: false, updated_at: '2025-01-01T00:00:00Z' },
      { id: 's23', company_id: COMPANY_IDS.CITY_OF_DREAMS, name: '조경호', percentage: 10,   is_entity: false, updated_at: '2025-01-01T00:00:00Z' },
      { id: 's24', company_id: COMPANY_IDS.CITY_OF_DREAMS, name: '양재준', percentage: 14.5, is_entity: false, updated_at: '2025-01-01T00:00:00Z' },
      { id: 's25', company_id: COMPANY_IDS.CITY_OF_DREAMS, name: '임종현', percentage: 14.5, is_entity: false, updated_at: '2025-01-01T00:00:00Z' },
    ],
    directors: [],
  },

  {
    id: COMPANY_IDS.COD_SPORTS,
    name: '씨오디 스포츠',
    short_name: 'COD Sports',
    category: 'standalone',
    parent_id: null,
    locations: ['신제주 헤트라스'],
    created_at: '2024-01-01T00:00:00Z',
    shareholders: [
      { id: 's26', company_id: COMPANY_IDS.COD_SPORTS, name: '정주현', percentage: 46, is_entity: false, updated_at: '2025-01-01T00:00:00Z' },
      { id: 's27', company_id: COMPANY_IDS.COD_SPORTS, name: '서봉균', percentage: 20, is_entity: false, updated_at: '2025-01-01T00:00:00Z' },
      { id: 's28', company_id: COMPANY_IDS.COD_SPORTS, name: '사공훈', percentage: 10, is_entity: false, updated_at: '2025-01-01T00:00:00Z' },
      { id: 's29', company_id: COMPANY_IDS.COD_SPORTS, name: '조경호', percentage:  8, is_entity: false, updated_at: '2025-01-01T00:00:00Z' },
      { id: 's30', company_id: COMPANY_IDS.COD_SPORTS, name: '양재준', percentage:  8, is_entity: false, updated_at: '2025-01-01T00:00:00Z' },
      { id: 's31', company_id: COMPANY_IDS.COD_SPORTS, name: '임종현', percentage:  8, is_entity: false, updated_at: '2025-01-01T00:00:00Z' },
    ],
    directors: [],
  },

  {
    id: COMPANY_IDS.BNF_SPORTS,
    name: '비엔에프 스포츠',
    short_name: 'BNF',
    category: 'standalone',
    parent_id: null,
    locations: ['명동 스노우피크'],
    created_at: '2024-01-01T00:00:00Z',
    shareholders: [
      { id: 's32', company_id: COMPANY_IDS.BNF_SPORTS, name: '정주현', percentage: 35, is_entity: false, updated_at: '2025-01-01T00:00:00Z' },
      { id: 's33', company_id: COMPANY_IDS.BNF_SPORTS, name: '서봉균', percentage: 15, is_entity: false, updated_at: '2025-01-01T00:00:00Z' },
      { id: 's34', company_id: COMPANY_IDS.BNF_SPORTS, name: '임귀현', percentage: 50, is_entity: false, updated_at: '2025-01-01T00:00:00Z' },
    ],
    directors: [],
  },
]

/** Returns a tree: holding → subsidiaries → sub_entities; standalones separate */
export function buildCompanyTree(): {
  holding: CompanyWithRelations
  standalones: CompanyWithRelations[]
} {
  const byId = new Map(COMPANIES_SEED.map(c => [c.id, { ...c, children: [] as CompanyWithRelations[] }]))

  for (const company of byId.values()) {
    if (company.parent_id && byId.has(company.parent_id)) {
      byId.get(company.parent_id)!.children!.push(company)
    }
  }

  const holding = byId.get(COMPANY_IDS.ELEVEN_HILLS)!
  const standalones = COMPANIES_SEED
    .filter(c => c.category === 'standalone')
    .map(c => byId.get(c.id)!)

  return { holding, standalones }
}
