// Seed data used by the one-time backfill script.
// Source of truth was previously `artifacts/dashboard/src/lib/data/companies.ts`.
// After backfill, the database is the source of truth — this file exists only
// to populate the database on a fresh install.

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
} as const;

export type CompanyCategory = 'holding' | 'subsidiary' | 'standalone' | 'sub_entity';

export interface SeedShareholder {
  name: string;
  percentage: number;
  is_entity: boolean;
}

export interface SeedCompany {
  id: string;
  name: string;
  short_name: string | null;
  category: CompanyCategory;
  parent_id: string | null;
  locations: string[];
  shareholders: SeedShareholder[];
}

export interface SeedFamilyMember {
  name: string;
  role: string;
  color: string;
}

export const FAMILY_MEMBERS: SeedFamilyMember[] = [
  { name: '정주현', role: '대표',   color: '#c8a96e' },
  { name: '이효진', role: '배우자', color: '#7eb8d4' },
  { name: '정찬희', role: '자녀',   color: '#85c49a' },
  { name: '정솔희', role: '자녀',   color: '#85c49a' },
];

export const COMPANIES_SEED: SeedCompany[] = [
  {
    id: COMPANY_IDS.ELEVEN_HILLS,
    name: '일레븐힐스',
    short_name: 'EH',
    category: 'holding',
    parent_id: null,
    locations: [],
    shareholders: [
      { name: '정주현', percentage: 41, is_entity: false },
      { name: '서봉균', percentage: 27, is_entity: false },
      { name: '양재준', percentage:  8, is_entity: false },
      { name: '임종현', percentage:  8, is_entity: false },
      { name: '정찬희', percentage:  8, is_entity: false },
      { name: '정솔희', percentage:  8, is_entity: false },
    ],
  },
  {
    id: COMPANY_IDS.COD_RETAIL,
    name: '씨오디 리테일',
    short_name: 'COD Retail',
    category: 'subsidiary',
    parent_id: COMPANY_IDS.ELEVEN_HILLS,
    locations: ['명동 밀리오레', '홍대 와이즈파크', '신제주 3호건물'],
    shareholders: [
      { name: '일레븐힐스', percentage: 60, is_entity: true  },
      { name: '사공훈',     percentage: 20, is_entity: false },
      { name: '씨엘로',     percentage: 20, is_entity: true  },
    ],
  },
  {
    id: COMPANY_IDS.COD_VISION,
    name: '씨오디 비전',
    short_name: 'COD Vision',
    category: 'sub_entity',
    parent_id: COMPANY_IDS.COD_RETAIL,
    locations: ['오클리 밴더 매장 ×6'],
    shareholders: [
      { name: '씨오디 리테일', percentage: 100, is_entity: true },
    ],
  },
  {
    id: COMPANY_IDS.TAEMAN_WORLD,
    name: '태맨월드',
    short_name: 'Taeman',
    category: 'subsidiary',
    parent_id: COMPANY_IDS.ELEVEN_HILLS,
    locations: ['CK 명동', 'CK 홍대', 'CK 성수', '신제주 베르쉬', '신제주 블루'],
    shareholders: [
      { name: '일레븐힐스', percentage: 50, is_entity: true  },
      { name: '기규영',     percentage: 50, is_entity: false },
    ],
  },
  {
    id: COMPANY_IDS.SGD_PARTNERS,
    name: '에스지디파트너스',
    short_name: 'SGD',
    category: 'subsidiary',
    parent_id: COMPANY_IDS.ELEVEN_HILLS,
    locations: ['신제주 올영', '이태원 건물'],
    shareholders: [
      { name: '일레븐힐스', percentage: 10,   is_entity: true  },
      { name: '이효진',     percentage: 22.5, is_entity: false },
      { name: '서봉균',     percentage: 22.5, is_entity: false },
      { name: '사공훈',     percentage: 22.5, is_entity: false },
      { name: '박성민',     percentage: 22.5, is_entity: false },
    ],
  },
  {
    id: COMPANY_IDS.NRD,
    name: '엔알디',
    short_name: 'NRD',
    category: 'subsidiary',
    parent_id: COMPANY_IDS.ELEVEN_HILLS,
    locations: ['능라도'],
    shareholders: [
      { name: '일레븐힐스', percentage: 40, is_entity: true  },
      { name: '씨엘로',     percentage: 40, is_entity: true  },
      { name: '사공훈',     percentage: 20, is_entity: false },
    ],
  },
  {
    id: COMPANY_IDS.CITY_OF_DREAMS,
    name: '씨티오브드림스',
    short_name: 'COD',
    category: 'standalone',
    parent_id: null,
    locations: ['제주 칠성점'],
    shareholders: [
      { name: '정주현', percentage: 41,   is_entity: false },
      { name: '서봉균', percentage: 20,   is_entity: false },
      { name: '조경호', percentage: 10,   is_entity: false },
      { name: '양재준', percentage: 14.5, is_entity: false },
      { name: '임종현', percentage: 14.5, is_entity: false },
    ],
  },
  {
    id: COMPANY_IDS.COD_SPORTS,
    name: '씨오디 스포츠',
    short_name: 'COD Sports',
    category: 'standalone',
    parent_id: null,
    locations: ['신제주 헤트라스'],
    shareholders: [
      { name: '정주현', percentage: 46, is_entity: false },
      { name: '서봉균', percentage: 20, is_entity: false },
      { name: '사공훈', percentage: 10, is_entity: false },
      { name: '조경호', percentage:  8, is_entity: false },
      { name: '양재준', percentage:  8, is_entity: false },
      { name: '임종현', percentage:  8, is_entity: false },
    ],
  },
  {
    id: COMPANY_IDS.BNF_SPORTS,
    name: '비엔에프 스포츠',
    short_name: 'BNF',
    category: 'standalone',
    parent_id: null,
    locations: ['명동 스노우피크'],
    shareholders: [
      { name: '정주현', percentage: 35, is_entity: false },
      { name: '서봉균', percentage: 15, is_entity: false },
      { name: '임귀현', percentage: 50, is_entity: false },
    ],
  },
];
