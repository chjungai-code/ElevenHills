import { useState, useMemo, useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
  useGetCompanies,
  previewFinancialStatement,
  saveFinancialStatement,
  customFetch,
  getParseFinancialStatementPdfUrl,
  getGetFinancialStatementsQueryKey,
  type FinancialStatementPreview,
  type FinancialStatementPdfMarkdown,
  type ParsedFinancialLine,
  type StatementVerifyIssue,
  type FinancialStatementSaveRequestStatementType,
} from '@workspace/api-client-react'

const C = {
  card: '#13141a',
  border: '#1e1f2a',
  faint: '#1e1f2a',
  ink: '#f4eedd',
  muted: '#8a8a9a',
  gold: '#c8a96e',
  goldLight: 'rgba(200,169,110,0.12)',
  warn: '#f59e0b',
  err: '#f87171',
  ok: '#4ade80',
}

type StatementType = FinancialStatementSaveRequestStatementType
const STATEMENT_LABEL: Record<StatementType, string> = {
  income_statement: '손익계산서',
  balance_sheet: '재무상태표',
}

const FISCAL_YEAR_OPTIONS = [2027, 2026, 2025, 2024, 2023, 2022, 2021] as const

type Props = {
  open: boolean
  onClose: () => void
  defaultCompanyId?: string
  defaultFiscalYear?: number
  defaultStatementType?: StatementType
}

export function UploadStatementModal({
  open,
  onClose,
  defaultCompanyId,
  defaultFiscalYear,
  defaultStatementType,
}: Props) {
  const queryClient = useQueryClient()
  const { data: companies = [] } = useGetCompanies()

  const [companyId, setCompanyId] = useState<string>('')
  const [fiscalYear, setFiscalYear] = useState<number>(
    defaultFiscalYear ?? new Date().getFullYear(),
  )
  const [statementType, setStatementType] = useState<StatementType>(
    defaultStatementType ?? 'income_statement',
  )
  const [markdown, setMarkdown] = useState<string>('')
  const [preview, setPreview] = useState<FinancialStatementPreview | null>(null)
  const [busy, setBusy] = useState<null | 'pdf' | 'preview' | 'save'>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [savedAt, setSavedAt] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  // Initialise / reset state when the modal opens.
  useEffect(() => {
    if (!open) return
    setCompanyId(defaultCompanyId && defaultCompanyId !== 'all' ? defaultCompanyId : '')
    if (defaultFiscalYear) setFiscalYear(defaultFiscalYear)
    if (defaultStatementType) setStatementType(defaultStatementType)
    setMarkdown('')
    setPreview(null)
    setBusy(null)
    setErrorMsg(null)
    setSavedAt(null)
  }, [open, defaultCompanyId, defaultFiscalYear, defaultStatementType])

  const companyOptions = useMemo(
    () => companies.map((c) => ({ id: c.id, label: c.name })),
    [companies],
  )

  if (!open) return null

  function clearPreview() {
    setPreview(null)
    setSavedAt(null)
    setErrorMsg(null)
  }

  async function handlePdfChosen(file: File) {
    if (!file) return
    setErrorMsg(null)
    setBusy('pdf')
    try {
      const buf = await file.arrayBuffer()
      // Bypass the generated mutation (it JSON.stringifies Blob bodies).
      // customFetch handles base URL + auth and treats `application/pdf` correctly.
      const data = await customFetch<FinancialStatementPdfMarkdown>(
        getParseFinancialStatementPdfUrl(),
        {
          method: 'POST',
          headers: {
            'content-type': 'application/pdf',
            'x-filename': encodeURIComponent(file.name),
            accept: 'application/json',
          },
          body: buf,
          responseType: 'json',
        },
      )
      setMarkdown(data.markdown)
      setPreview(null)
      setSavedAt(null)
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(null)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  async function handlePreview() {
    if (!markdown.trim()) {
      setErrorMsg('마크다운 또는 PDF를 먼저 입력하세요.')
      return
    }
    setErrorMsg(null)
    setBusy('preview')
    try {
      const data = await previewFinancialStatement({ markdown, statement_type: statementType })
      setPreview(data)
      setSavedAt(null)
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(null)
    }
  }

  async function handleSave(opts: { skip_verification?: boolean } = {}) {
    if (!companyId) {
      setErrorMsg('회사를 선택하세요.')
      return
    }
    if (!markdown.trim()) {
      setErrorMsg('마크다운이 비어 있습니다.')
      return
    }
    setErrorMsg(null)
    setBusy('save')
    try {
      const result = await saveFinancialStatement({
        company_id: companyId,
        fiscal_year: fiscalYear,
        statement_type: statementType,
        markdown,
        skip_verification: opts.skip_verification,
      })
      setSavedAt(new Date().toISOString())
      // Invalidate the dashboard query so the table re-renders with new data.
      await queryClient.invalidateQueries({
        queryKey: getGetFinancialStatementsQueryKey({ company_id: companyId, year: fiscalYear }),
      })
      // Refresh the preview metadata too.
      const fresh = await previewFinancialStatement({ markdown, statement_type: statementType })
      setPreview({ ...fresh, line_count: result.line_count, issues: result.issues })
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(null)
    }
  }

  const issues: StatementVerifyIssue[] = preview?.issues ?? []
  const canSave = Boolean(companyId && markdown.trim() && !busy)

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        padding: 32, zIndex: 100, overflowY: 'auto',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: C.card, border: `1px solid ${C.border}`,
          borderRadius: 14, width: '100%', maxWidth: 920,
          padding: 24, color: C.ink,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>
            재무제표 업로드
          </h2>
          <button onClick={onClose} style={iconBtn()} aria-label="Close">×</button>
        </div>

        {/* Selectors */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 14 }}>
          <Field label="회사">
            <select value={companyId} onChange={(e) => { setCompanyId(e.target.value); clearPreview() }} style={selectStyle()}>
              <option value="">— 선택 —</option>
              {companyOptions.map((o) => (
                <option key={o.id} value={o.id}>{o.label}</option>
              ))}
            </select>
          </Field>
          <Field label="회계연도">
            <select value={fiscalYear} onChange={(e) => { setFiscalYear(Number(e.target.value)); clearPreview() }} style={selectStyle()}>
              {FISCAL_YEAR_OPTIONS.map((y) => (
                <option key={y} value={y}>FY {y}</option>
              ))}
            </select>
          </Field>
          <Field label="유형">
            <select value={statementType} onChange={(e) => { setStatementType(e.target.value as StatementType); clearPreview() }} style={selectStyle()}>
              {(Object.keys(STATEMENT_LABEL) as StatementType[]).map((t) => (
                <option key={t} value={t}>{STATEMENT_LABEL[t]}</option>
              ))}
            </select>
          </Field>
        </div>

        {/* PDF upload */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf,.pdf"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) void handlePdfChosen(file)
            }}
            style={{ display: 'none' }}
            id="upload-pdf-input"
          />
          <label htmlFor="upload-pdf-input" style={primaryBtn(busy === 'pdf')}>
            {busy === 'pdf' ? 'PDF → MD 변환 중…' : 'PDF 업로드 (LlamaParse)'}
          </label>
          <span style={{ fontSize: 11, color: C.muted }}>
            또는 K-GAAP 마크다운을 아래에 붙여넣기
          </span>
        </div>

        {/* Markdown textarea */}
        <textarea
          value={markdown}
          onChange={(e) => { setMarkdown(e.target.value); clearPreview() }}
          placeholder={'<table>…</table> 형식의 K-GAAP 마크다운을 여기에 붙여넣으세요.'}
          spellCheck={false}
          style={{
            width: '100%', minHeight: 180, maxHeight: 320,
            background: '#0e0f15', border: `1px solid ${C.border}`,
            borderRadius: 8, padding: 10, color: C.ink,
            fontFamily: "'DM Mono', monospace", fontSize: 11, lineHeight: 1.5,
            resize: 'vertical', outline: 'none', marginBottom: 12,
          }}
        />

        <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
          <button onClick={handlePreview} disabled={!markdown.trim() || !!busy} style={secondaryBtn(busy === 'preview')}>
            {busy === 'preview' ? '파싱 중…' : '미리보기 파싱'}
          </button>
          <button onClick={() => handleSave()} disabled={!canSave} style={primaryBtn(busy === 'save')}>
            {busy === 'save' ? '저장 중…' : '저장 (덮어쓰기)'}
          </button>
          {issues.length > 0 && (
            <button onClick={() => handleSave({ skip_verification: true })} disabled={!canSave} style={warnBtn()}>
              경고 무시하고 저장
            </button>
          )}
        </div>

        {errorMsg && (
          <div style={banner(C.err)}>오류: {errorMsg}</div>
        )}
        {savedAt && (
          <div style={banner(C.ok)}>
            ✓ 저장 완료. {companyOptions.find(c => c.id === companyId)?.label} / FY{fiscalYear} / {STATEMENT_LABEL[statementType]} ({preview?.line_count ?? 0}행)
          </div>
        )}

        {/* Preview */}
        {preview && (
          <div style={{ marginTop: 4 }}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 8 }}>
              <span style={{ fontSize: 11, color: C.muted }}>
                파싱된 행: <span style={{ color: C.ink, fontWeight: 600 }}>{preview.line_count}</span>
              </span>
              {issues.length === 0 ? (
                <span style={{ fontSize: 11, color: C.ok }}>K-GAAP 검증 통과</span>
              ) : (
                <span style={{ fontSize: 11, color: C.warn }}>
                  검증 경고 {issues.length}건
                </span>
              )}
            </div>
            {issues.length > 0 && (
              <ul style={{ margin: '0 0 10px', padding: 0, listStyle: 'none' }}>
                {issues.map((iss, i) => (
                  <li key={i} style={{ fontSize: 11, color: C.warn, padding: '2px 0' }}>
                    • [{iss.period === 'current' ? '당기' : '전기'}] {iss.message}
                  </li>
                ))}
              </ul>
            )}
            <PreviewTable lines={preview.lines} />
          </div>
        )}
      </div>
    </div>
  )
}

function PreviewTable({ lines }: { lines: ParsedFinancialLine[] }) {
  return (
    <div style={{ maxHeight: 320, overflow: 'auto', border: `1px solid ${C.border}`, borderRadius: 8 }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
        <thead style={{ position: 'sticky', top: 0, background: C.card }}>
          <tr style={{ borderBottom: `1px solid ${C.border}` }}>
            <th style={th('left')}>과 목</th>
            <th style={{ ...th('right'), width: 140 }}>당기</th>
            <th style={{ ...th('right'), width: 140 }}>전기</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l, i) => (
            <tr key={i} style={{ borderBottom: `1px solid ${C.faint}` }}>
              <td style={{
                padding: '4px 8px',
                paddingLeft: 8 + l.depth * 14,
                color: l.depth === 0 ? C.ink : C.muted,
                fontWeight: l.is_subtotal ? 600 : 400,
              }}>
                {l.section_code && <span style={{ color: C.gold, marginRight: 4 }}>{l.section_code}.</span>}
                {l.account_name_ko}
              </td>
              <td style={tdNum(l.is_subtotal)}>{fmt(l.amount)}</td>
              <td style={tdNum(l.is_subtotal, '#5a5a6a')}>{fmt(l.prior_amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function fmt(s: string | null | undefined): string {
  if (s == null || s === '') return ''
  const n = Number(s)
  if (!isFinite(n)) return ''
  if (n === 0) return '0'
  return (n < 0 ? '△' : '') + Math.abs(n).toLocaleString('ko-KR')
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ fontSize: 10, color: C.muted, fontWeight: 600, letterSpacing: '0.06em' }}>{label}</span>
      {children}
    </label>
  )
}

function selectStyle(): React.CSSProperties {
  return {
    background: '#0e0f15', border: `1px solid ${C.border}`, borderRadius: 6,
    color: C.ink, fontSize: 12, padding: '6px 8px', outline: 'none',
  }
}
function primaryBtn(busy: boolean): React.CSSProperties {
  return {
    background: busy ? '#7a6743' : C.gold, color: '#0b0c10',
    border: 'none', borderRadius: 6, padding: '7px 14px',
    fontSize: 11.5, fontWeight: 600, cursor: busy ? 'progress' : 'pointer',
    opacity: busy ? 0.9 : 1,
  }
}
function secondaryBtn(busy: boolean): React.CSSProperties {
  return {
    background: 'transparent', color: C.ink, border: `1px solid ${C.border}`,
    borderRadius: 6, padding: '7px 14px', fontSize: 11.5, fontWeight: 500,
    cursor: busy ? 'progress' : 'pointer',
  }
}
function warnBtn(): React.CSSProperties {
  return { ...secondaryBtn(false), color: C.warn, borderColor: C.warn }
}
function iconBtn(): React.CSSProperties {
  return {
    background: 'transparent', color: C.muted, border: 'none',
    fontSize: 22, lineHeight: 1, cursor: 'pointer', padding: 4,
  }
}
function th(align: 'left' | 'right'): React.CSSProperties {
  return {
    textAlign: align, padding: '6px 8px', color: C.muted,
    fontSize: 10, letterSpacing: '0.05em', fontWeight: 600,
  }
}
function tdNum(bold: boolean, color = C.muted): React.CSSProperties {
  return {
    padding: '4px 8px', textAlign: 'right',
    fontFamily: "'DM Mono', monospace", fontSize: 11,
    color, fontWeight: bold ? 600 : 400,
  }
}
function banner(color: string): React.CSSProperties {
  return {
    background: `${color}1a`, border: `1px solid ${color}55`,
    color, borderRadius: 6, padding: '8px 10px', fontSize: 11.5,
    marginBottom: 10,
  }
}
