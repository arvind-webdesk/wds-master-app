'use client'

import { useRef, useState, useTransition } from 'react'
import { Upload, FileText, Trash2, Download, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { uploadScopeDocument, deleteScopeDocument } from '../upload-action'

export interface ScopeDocumentDraft {
  id:         number
  filename:   string
  mimeType:   string
  sizeBytes:  number
  uploadedAt: string
}

interface ScopeUploaderProps {
  docs:     ReadonlyArray<ScopeDocumentDraft>
  onChange: (docs: ScopeDocumentDraft[]) => void
  disabled?: boolean
}

const ACCEPT = [
  '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
  '.txt', '.md',
  '.png', '.jpg', '.jpeg', '.webp',
].join(',')

export function ScopeUploader({ docs, onChange, disabled }: ScopeUploaderProps) {
  const fileRef = useRef<HTMLInputElement | null>(null)
  const [pending, startTransition] = useTransition()
  const [busy, setBusy] = useState(false)

  function pick() {
    if (disabled || pending || busy) return
    fileRef.current?.click()
  }

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return
    setBusy(true)
    const next = [...docs]
    for (const file of Array.from(files)) {
      const fd = new FormData()
      fd.append('file', file)
      const result = await uploadScopeDocument(fd)
      if (!result.ok) {
        toast.error(`${file.name}: ${result.error ?? 'Upload failed.'}`)
        continue
      }
      if (result.document) {
        next.push(result.document)
        toast.success(`${file.name} uploaded.`)
      }
    }
    onChange(next)
    setBusy(false)
    if (fileRef.current) fileRef.current.value = ''
  }

  function remove(id: number) {
    startTransition(async () => {
      const result = await deleteScopeDocument(id)
      if (!result.ok) {
        toast.error(result.error ?? 'Could not remove document.')
        return
      }
      onChange(docs.filter((d) => d.id !== id))
    })
  }

  return (
    <div className="flex flex-col gap-3">
      <input
        ref={fileRef}
        type="file"
        accept={ACCEPT}
        multiple
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />

      <button
        type="button"
        onClick={pick}
        disabled={disabled || pending || busy}
        className="flex flex-col items-center justify-center gap-2 rounded-md border border-dashed border-border bg-muted/30 px-6 py-10 text-center transition-colors hover:bg-muted/50 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {busy ? <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /> : <Upload className="h-6 w-6 text-muted-foreground" />}
        <div className="text-sm font-medium">
          {busy ? 'Uploading…' : 'Click to upload scope documents'}
        </div>
        <div className="text-xs text-muted-foreground">
          PDF, Word, Excel, PowerPoint, images. Max 25 MB per file.
        </div>
      </button>

      {docs.length > 0 ? (
        <ul className="flex flex-col divide-y divide-border rounded-md border border-border">
          {docs.map((d) => (
            <li key={d.id} className="flex items-center gap-3 px-3 py-2.5 text-sm">
              <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{d.filename}</div>
                <div className="text-xs text-muted-foreground">
                  {formatBytes(d.sizeBytes)} · uploaded {formatDate(d.uploadedAt)}
                </div>
              </div>
              <a
                href={`/api/onboarding/scope-doc/${d.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-muted-foreground hover:text-foreground"
                aria-label={`Download ${d.filename}`}
              >
                <Download className="h-4 w-4" />
              </a>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => remove(d.id)}
                disabled={pending || disabled}
                className="text-destructive hover:text-destructive"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}
function formatDate(iso: string): string {
  try { return new Date(iso.replace(' ', 'T') + (iso.includes('Z') ? '' : 'Z')).toLocaleString() } catch { return iso }
}
