import { useRef, useState } from 'react'
import { AlertTriangle, CheckCircle2, Database, Download, FileSpreadsheet, Upload } from 'lucide-react'
import { useApp, useAsync, useToast } from '../context/AppContext'
import { api } from '../services/api'
import {
  Card,
  EmptyState,
  Kpi,
  Notice,
  PageHeader,
  Spinner,
} from '../components/ui'
import { num } from '../lib/format'

export function UploadPage() {
  const { meta, health, reload } = useApp()
  const { push } = useToast()
  const fileRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<Awaited<ReturnType<typeof api.upload>> | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const quality = useAsync(() => api.summary(), [])

  const doUpload = async (file: File) => {
    setBusy(true)
    setErr(null)
    setResult(null)
    try {
      const r = await api.upload(file)
      setResult(r)
      push(`Imported ${r.rows_imported} batteries from ${file.name}.`, 'success')
      reload()
      quality.reload()
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setErr(msg)
      push(msg, 'error')
    } finally {
      setBusy(false)
    }
  }

  const columns = meta?.upload_required_columns ?? []

  return (
    <>
      <PageHeader
        title="Data Upload"
        subtitle="Replace the synthetic demo fleet with your own CSV to run the same pipeline on operator data."
        actions={
          <a href={api.templateUrl} download className="btn">
            <Download size={14} /> Download template CSV
          </a>
        }
      />

      <Notice kind="warn">
        <b>Honest warning.</b> The models are trained on synthetic data. Pointing them at your CSV
        is an <b>unvalidated transfer</b>, not a validated measurement of your batteries. Use it to
        demonstrate the pipeline; retrain on labelled real data before relying on the numbers.
      </Notice>

      {/* ---------- current data ---------- */}
      <Card className="mt-4" title="Active dataset">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Kpi label="Source" value={health?.provenance.label ?? '—'} testId="upload-source" />
          <Kpi label="Batteries" value={num(health?.batteries ?? 0)} />
          <Kpi
            label="Mean confidence"
            value={quality.data ? quality.data.data_quality.mean_confidence.toFixed(1) : '—'}
            sub={
              quality.data
                ? `${quality.data.data_quality.batteries} batteries assessed`
                : undefined
            }
          />
          <Kpi
            label="Low-confidence packs"
            value={num(quality.data?.data_quality.low_confidence_count ?? 0)}
            tone={(quality.data?.data_quality.low_confidence_count ?? 0) > 0 ? 'warn' : 'good'}
          />
        </div>
        <p className="mt-3 text-[11.5px] leading-snug text-ink-500">
          {health?.provenance.notice}
        </p>
      </Card>

      {/* ---------- uploader ---------- */}
      <Card
        className="mt-4"
        title="Upload a fleet CSV"
        subtitle={`${columns.length} required columns. Missing columns are reported explicitly rather than guessed.`}
      >
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault()
            const f = e.dataTransfer.files?.[0]
            if (f) doUpload(f)
          }}
          className="rounded-xl border-2 border-dashed border-ink-300 bg-ink-50/40 px-6 py-8 text-center"
        >
          <Database size={26} className="mx-auto text-ink-400" />
          <div className="mt-2 text-[13px] font-semibold text-ink-800">
            Drop a CSV here, or choose a file
          </div>
          <div className="mt-1 text-[12px] text-ink-500">CSV only · up to a few MB</div>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            data-testid="file-input"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) doUpload(f)
            }}
          />
          <button
            className="btn btn-primary mt-3"
            disabled={busy}
            onClick={() => fileRef.current?.click()}
            data-testid="choose-file-btn"
          >
            <Upload size={14} /> {busy ? 'Uploading…' : 'Choose CSV file'}
          </button>
        </div>

        {busy && <Spinner label="Analysing uploaded rows" />}

        {err && (
          <div className="mt-3" data-testid="upload-error">
            <Notice kind="danger">
              <b>Upload rejected.</b> {err}
            </Notice>
          </div>
        )}

        {result && (
          <div className="mt-3" data-testid="upload-success">
            <Notice kind="good">
              <div className="flex items-start gap-2">
                <CheckCircle2 size={15} className="mt-0.5 shrink-0" />
                <div>
                  <div className="font-semibold">Imported {result.rows_imported} batteries</div>
                  <div className="mt-1">{result.provenance.notice}</div>
                  {result.history_note && (
                    <div className="mt-1 text-[12px] opacity-90">{result.history_note}</div>
                  )}
                </div>
              </div>
            </Notice>
          </div>
        )}
      </Card>

      {/* ---------- schema ---------- */}
      <Card
        className="mt-4"
        title="Required CSV schema"
        subtitle="Derived columns are computed for you — you do not need to supply them"
      >
        <div className="flex flex-wrap gap-1.5">
          {columns.map((c) => (
            <span
              key={c}
              className="rounded border border-ink-200 bg-ink-50 px-2 py-1 font-mono text-[11.5px] text-ink-700"
            >
              {c}
            </span>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-[12px] text-ink-500">
          <FileSpreadsheet size={13} />
          <a href={api.templateUrl} download className="link">
            Download a correctly shaped template
          </a>
          <span>· then edit the values and upload it back.</span>
        </div>
      </Card>

      {/* ---------- error handling reference ---------- */}
      <Card className="mt-4" title="How bad input is handled" subtitle="No upload should ever crash the app">
        <table className="table-base">
          <thead>
            <tr>
              <th>Situation</th>
              <th>Response</th>
            </tr>
          </thead>
          <tbody>
            {[
              ['Empty file', '400 with an explicit message'],
              ['Unparseable CSV', '400 naming the parser error'],
              ['Missing columns', '422 listing exactly which columns are missing and which were found'],
              ['Header only, no rows', '400 rather than a blank dashboard'],
              ['Some rows unparseable', 'Imported with the affected rows dropped and counted'],
              ['All rows unparseable', '422 listing the offending columns'],
              ['Backend offline', 'Frontend shows a retry panel, not a blank screen'],
              ['Database empty', '409 telling you to load the demo fleet'],
            ].map(([situation, response]) => (
              <tr key={situation}>
                <td className="text-ink-700">{situation}</td>
                <td className="text-[12px] text-ink-600">{response}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mt-3 flex items-start gap-1.5 text-[11.5px] text-ink-400">
          <AlertTriangle size={12} className="mt-0.5 shrink-0" />
          The whole application runs offline. No external API is required; GenAI is optional and
          degrades to a deterministic local explainer.
        </div>
      </Card>

      {!health && <EmptyState message="Connecting to backend" />}
    </>
  )
}