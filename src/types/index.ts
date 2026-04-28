export type CompanyCategory = 'holding' | 'subsidiary' | 'standalone' | 'sub_entity'

export interface Company {
  id: string
  name: string
  short_name: string | null
  category: CompanyCategory
  parent_id: string | null
  locations: string[]
  created_at: string
}

export interface Shareholder {
  id: string
  company_id: string
  name: string
  percentage: number
  is_entity: boolean
  updated_at: string
}

export type DirectorRole = 'ceo' | 'director' | 'auditor'

export interface Director {
  id: string
  company_id: string
  name: string
  role: DirectorRole
  as_of_date: string | null
  created_at: string
}

export interface Revenue {
  id: string
  company_id: string
  year: number
  month: number
  amount: number
  category: string | null
  memo: string | null
  created_at: string
}

export interface KakaoLog {
  id: string
  type: 'daily' | 'manual'
  recipient: string
  content: string
  status: 'sent' | 'failed'
  sent_at: string
}

// Enriched types used in UI
export interface CompanyWithRelations extends Company {
  shareholders: Shareholder[]
  directors: Director[]
  children?: CompanyWithRelations[]
}

export interface FamilyMember {
  name: string
  role: string
  color: string
}
