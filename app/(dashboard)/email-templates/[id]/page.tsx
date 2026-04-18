'use client'

import { useCallback, useEffect, useMemo, useState, useTransition } from 'react'
import { useParams, useRouter } from 'next/navigation'
import {
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  Loader2,
  MoreHorizontal,
  Plus,
  Send,
  Trash2,
} from 'lucide-react'
import { toast } from 'sonner'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import Link from 'next/link'
import { useAbility } from '@/lib/acl/ability-context'
import { DataTable } from '@/components/data-table/DataTable'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { type ColumnDef } from '@tanstack/react-table'
import { SendTestDialog, type EmailPhrase } from '@/components/email-templates/send-test-dialog'
import { PhraseSheet } from '@/components/email-templates/phrase-sheet'

// ─── Types ────────────────────────────────────────────────────────────────────

type EmailTemplate = {
  id: number
  title: string
  code: string
  subject: string
  body: string
  status: 'active' | 'inactive'
  allowTo: string | null
  emailType: string | null
  createdAt: string
  updatedAt: string
  deletedAt: string | null
  phrases: EmailPhrase[]
}

// ─── Editor form schema ───────────────────────────────────────────────────────

const editorSchema = z.object({
  title:     z.string().trim().min(1, 'Title is required').max(200),
  subject:   z.string().trim().min(1, 'Subject is required').max(300),
  body:      z.string().min(1, 'Body is required').max(100_000),
  status:    z.enum(['active', 'inactive']),
  emailType: z.string().trim().max(50).optional().or(z.literal('')),
  allowTo:   z.string().trim().max(1000).optional().or(z.literal('')),
})

type EditorValues = z.infer<typeof editorSchema>

// ─── Relative time helper ─────────────────────────────────────────────────────

function relativeTime(iso: string): string {
  const diff  = Date.now() - new Date(iso).getTime()
  const mins  = Math.floor(diff / 60_000)
  const hours = Math.floor(diff / 3_600_000)
  const days  = Math.floor(diff / 86_400_000)
  if (mins < 1)   return 'just now'
  if (mins < 60)  return `${mins}m ago`
  if (hours < 24) return `${hours}h ago`
  if (days < 30)  return `${days}d ago`
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function EmailTemplateEditorPage() {
  const params  = useParams<{ id: string }>()
  const router  = useRouter()
  const ability = useAbility()

  const canRead   = ability.can('read',   'EmailTemplate')
  const canUpdate = ability.can('update', 'EmailTemplate')
  const canDelete = ability.can('delete', 'EmailTemplate')
  const canSend   = ability.can('send',   'EmailTemplate')

  // ── Template state ──
  const [template, setTemplate]     = useState<EmailTemplate | null>(null)
  const [isLoading, setIsLoading]   = useState(true)
  const [notFound, setNotFound]     = useState(false)

  // ── Save state ──
  const [savePending, startSave]    = useTransition()

  // ── Delete state ──
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deletePending, startDelete] = useTransition()

  // ── Phrase sheet ──
  const [phraseSheetOpen, setPhraseSheetOpen] = useState(false)
  const [editPhrase, setEditPhrase]           = useState<EmailPhrase | null>(null)

  // ── Phrase delete ──
  const [phraseDeleteTarget, setPhraseDeleteTarget] = useState<EmailPhrase | null>(null)
  const [phraseDeletePending, startPhraseDelete]     = useTransition()

  // ── Send test ──
  const [sendDialogOpen, setSendDialogOpen] = useState(false)

  // ── Advanced section ──
  const [advancedOpen, setAdvancedOpen] = useState(false)

  // ── Source view toggle ──
  const [sourceView, setSourceView] = useState(false)

  // ── Form ──
  const form = useForm<EditorValues>({
    resolver: zodResolver(editorSchema),
    defaultValues: {
      title: '', subject: '', body: '', status: 'active', emailType: '', allowTo: '',
    },
  })

  // ── Load template ──
  const load = useCallback(async () => {
    setIsLoading(true)
    try {
      const res  = await fetch(`/api/email-templates/${params.id}`)
      const json = await res.json()
      if (res.status === 404) { setNotFound(true); return }
      if (!res.ok) {
        toast.error(json.error?.message ?? 'Failed to load template')
        return
      }
      const t: EmailTemplate = json.data
      setTemplate(t)
      form.reset({
        title:     t.title,
        subject:   t.subject,
        body:      t.body,
        status:    t.status,
        emailType: t.emailType ?? '',
        allowTo:   t.allowTo  ?? '',
      })
    } finally {
      setIsLoading(false)
    }
  }, [params.id]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load() }, [load])

  // ── Save ──
  function onSave(values: EditorValues) {
    if (!template) return
    startSave(async () => {
      const res  = await fetch(`/api/email-templates/${template.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title:     values.title,
          subject:   values.subject,
          body:      values.body,
          status:    values.status,
          emailType: values.emailType || null,
          allowTo:   values.allowTo   || null,
        }),
      })
      const json = await res.json()
      if (!res.ok) {
        toast.error(json.error?.message ?? 'Save failed')
        return
      }
      toast.success('Template saved')
      setTemplate((prev) => prev ? { ...prev, ...json.data, phrases: prev.phrases } : prev)
    })
  }

  // ── Delete template ──
  function executeDelete() {
    if (!template) return
    startDelete(async () => {
      const res  = await fetch(`/api/email-templates/${template.id}`, { method: 'DELETE' })
      const json = await res.json()
      if (res.ok) {
        toast.success('Template deleted')
        router.push('/email-templates')
      } else {
        toast.error(json.error?.message ?? 'Delete failed')
      }
      setDeleteOpen(false)
    })
  }

  // ── Phrase actions ──
  function handleAddPhrase() {
    setEditPhrase(null)
    setPhraseSheetOpen(true)
  }

  function handleEditPhrase(p: EmailPhrase) {
    setEditPhrase(p)
    setPhraseSheetOpen(true)
  }

  function handlePhraseDeleteConfirm(p: EmailPhrase) {
    setPhraseDeleteTarget(p)
  }

  function executePhraseDelete() {
    if (!template || !phraseDeleteTarget) return
    const p = phraseDeleteTarget
    startPhraseDelete(async () => {
      const res  = await fetch(`/api/email-templates/${template.id}/phrases/${p.id}`, { method: 'DELETE' })
      const json = await res.json()
      if (res.ok) {
        toast.success('Phrase deleted')
        load()
      } else {
        toast.error(json.error?.message ?? 'Delete failed')
      }
      setPhraseDeleteTarget(null)
    })
  }

  // ── Insert phrase token into body textarea ──
  function insertPhrase(key: string) {
    const token = `{{${key}}}`
    const ta = document.getElementById('body-editor') as HTMLTextAreaElement | null
    if (!ta) {
      const current = form.getValues('body')
      form.setValue('body', current + token, { shouldDirty: true })
      return
    }
    const start  = ta.selectionStart
    const end    = ta.selectionEnd
    const before = ta.value.slice(0, start)
    const after  = ta.value.slice(end)
    const next   = before + token + after
    form.setValue('body', next, { shouldDirty: true })
    // Restore cursor after the inserted token
    requestAnimationFrame(() => {
      ta.selectionStart = start + token.length
      ta.selectionEnd   = start + token.length
      ta.focus()
    })
  }

  // ── Phrases sub-table columns ──
  const phraseColumns = useMemo<ColumnDef<EmailPhrase, unknown>[]>(
    () => [
      {
        accessorKey: 'key',
        header: 'Key',
        enableSorting: false,
        cell: ({ getValue }) => (
          <code className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">
            {`{{${getValue() as string}}}`}
          </code>
        ),
      },
      {
        accessorKey: 'value',
        header: 'Value',
        enableSorting: false,
        cell: ({ getValue }) => {
          const v = getValue() as string
          return v ? (
            <span className="text-muted-foreground text-xs truncate max-w-[200px] block">{v}</span>
          ) : (
            <span className="text-muted-foreground/40 text-xs italic">empty</span>
          )
        },
      },
      {
        id: 'actions',
        header: () => <span className="sr-only">Actions</span>,
        size: 48,
        enableHiding: false,
        cell: ({ row }) => {
          const p = row.original
          if (!canUpdate) return null
          return (
            <DropdownMenu>
              <DropdownMenuTrigger
                render={<Button variant="ghost" size="icon" className="h-7 w-7" />}
              >
                <MoreHorizontal className="h-4 w-4" />
                <span className="sr-only">Phrase actions</span>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel className="font-medium">Actions</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => handleEditPhrase(p)}>Edit</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onClick={() => handlePhraseDeleteConfirm(p)}>
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )
        },
      },
    ],
    [canUpdate], // eslint-disable-line react-hooks/exhaustive-deps
  )

  // ── Not found ──
  if (!isLoading && notFound) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 p-12 text-center">
        <p className="text-lg font-semibold text-foreground">Template not found</p>
        <p className="text-sm text-muted-foreground">
          This template may have been deleted or never existed.
        </p>
        <Link href="/email-templates">
          <Button variant="outline" className="gap-2">
            <ArrowLeft className="h-4 w-4" />
            Back to templates
          </Button>
        </Link>
      </div>
    )
  }

  // ── No access ──
  if (!canRead && !isLoading) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 p-12 text-center">
        <p className="text-sm font-medium">Access restricted</p>
        <p className="text-xs text-muted-foreground">
          You do not have permission to view this template.
        </p>
      </div>
    )
  }

  const phrases = template?.phrases ?? []

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Top navigation */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/email-templates" className="hover:text-foreground transition-colors flex items-center gap-1">
          <ArrowLeft className="h-3.5 w-3.5" />
          Email Templates
        </Link>
        {template && (
          <>
            <span>/</span>
            <span className="text-foreground">{template.title}</span>
          </>
        )}
      </div>

      {/* Main two-column layout */}
      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">

        {/* ── Left column: editor ── */}
        <div className="flex flex-col gap-4 min-w-0">

          {/* Header card */}
          <Card className="rounded-[0.625rem] border border-border shadow-none">
            <CardContent className="p-4">
              {isLoading ? (
                <div className="flex items-center gap-3 h-10">
                  <div className="h-5 w-48 rounded bg-muted animate-pulse" />
                </div>
              ) : (
                <Form {...form}>
                  <form onSubmit={form.handleSubmit(onSave)}>
                    <div className="flex flex-col gap-4">
                      {/* Title + code + status + actions row */}
                      <div className="flex items-start gap-3 flex-wrap">
                        <div className="flex-1 min-w-0">
                          <FormField
                            control={form.control}
                            name="title"
                            render={({ field }) => (
                              <FormItem className="gap-1">
                                <FormControl>
                                  <input
                                    {...field}
                                    disabled={!canUpdate}
                                    className="w-full text-xl font-semibold bg-transparent outline-none text-foreground placeholder:text-muted-foreground disabled:cursor-default"
                                    placeholder="Template title"
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          {template && (
                            <code className="text-xs text-muted-foreground font-mono mt-0.5 block">
                              {template.code}
                            </code>
                          )}
                        </div>

                        {/* Status switch */}
                        {canUpdate && (
                          <FormField
                            control={form.control}
                            name="status"
                            render={({ field }) => (
                              <div className="flex items-center gap-2 shrink-0">
                                <span className="text-xs text-muted-foreground">
                                  {field.value === 'active' ? 'Active' : 'Inactive'}
                                </span>
                                <Switch
                                  checked={field.value === 'active'}
                                  onCheckedChange={(c) => field.onChange(c ? 'active' : 'inactive')}
                                />
                              </div>
                            )}
                          />
                        )}

                        {/* Action buttons */}
                        <div className="flex items-center gap-2 shrink-0">
                          {canSend && template?.status === 'active' && (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="gap-1.5"
                              onClick={() => setSendDialogOpen(true)}
                            >
                              <Send className="h-3.5 w-3.5" />
                              Send test
                            </Button>
                          )}
                          {canDelete && (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="gap-1.5 text-destructive hover:text-destructive border-destructive/30 hover:border-destructive/50"
                              onClick={() => setDeleteOpen(true)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                              Delete
                            </Button>
                          )}
                          {canUpdate && (
                            <Button
                              type="submit"
                              size="sm"
                              disabled={savePending}
                            >
                              {savePending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                              Save
                            </Button>
                          )}
                        </div>
                      </div>

                      {/* Subject */}
                      <FormField
                        control={form.control}
                        name="subject"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Subject</FormLabel>
                            <FormControl>
                              <Input
                                placeholder="Email subject line"
                                disabled={!canUpdate}
                                {...field}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      {/* Body editor */}
                      <FormField
                        control={form.control}
                        name="body"
                        render={({ field }) => (
                          <FormItem>
                            <div className="flex items-center justify-between gap-2">
                              <FormLabel>Body HTML</FormLabel>
                              <div className="flex items-center gap-2">
                                {/* Insert phrase dropdown */}
                                {phrases.length > 0 && canUpdate && (
                                  <DropdownMenu>
                                    <DropdownMenuTrigger className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground border border-border rounded-md px-2 py-1 transition-colors">
                                      Insert phrase
                                      <ChevronDown className="h-3 w-3" />
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end">
                                      <DropdownMenuLabel>Available phrases</DropdownMenuLabel>
                                      <DropdownMenuSeparator />
                                      {phrases.map((p) => (
                                        <DropdownMenuItem
                                          key={p.id}
                                          onClick={() => insertPhrase(p.key)}
                                        >
                                          <code className="font-mono text-xs">{`{{${p.key}}}`}</code>
                                        </DropdownMenuItem>
                                      ))}
                                    </DropdownMenuContent>
                                  </DropdownMenu>
                                )}
                                {/* Source/preview toggle */}
                                <button
                                  type="button"
                                  onClick={() => setSourceView((v) => !v)}
                                  className="text-xs text-muted-foreground hover:text-foreground border border-border rounded-md px-2 py-1 transition-colors"
                                >
                                  {sourceView ? 'Preview' : 'Source'}
                                </button>
                              </div>
                            </div>

                            {sourceView ? (
                              /* Rendered preview — isolated iframe so template CSS/scripts can't leak into the app */
                              <iframe
                                title="Email preview"
                                sandbox=""
                                srcDoc={field.value ?? ''}
                                className="w-full rounded-md border border-input bg-white min-h-[300px] max-h-[600px]"
                              />
                            ) : (
                              <FormControl>
                                <Textarea
                                  id="body-editor"
                                  placeholder="<p>Hello {{name}},</p>"
                                  disabled={!canUpdate}
                                  className="font-mono text-xs leading-relaxed resize-y min-h-[300px]"
                                  {...field}
                                />
                              </FormControl>
                            )}
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      {/* Advanced disclosure */}
                      <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
                        <CollapsibleTrigger className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors w-full">
                          {advancedOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                          Advanced settings
                        </CollapsibleTrigger>
                        <CollapsibleContent className="pt-3">
                          <div className="flex flex-col gap-4 rounded-[0.625rem] border border-border p-4">
                            <FormField
                              control={form.control}
                              name="emailType"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Email type</FormLabel>
                                  <FormControl>
                                    <Input
                                      placeholder="transactional"
                                      disabled={!canUpdate}
                                      {...field}
                                    />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                            <FormField
                              control={form.control}
                              name="allowTo"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Allow-to</FormLabel>
                                  <FormControl>
                                    <Textarea
                                      placeholder="user@example.com, *@example.com"
                                      disabled={!canUpdate}
                                      className="resize-none"
                                      rows={2}
                                      {...field}
                                    />
                                  </FormControl>
                                  <FormDescription>
                                    Comma-separated allow-list. Leave empty to allow any recipient.
                                  </FormDescription>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                          </div>
                        </CollapsibleContent>
                      </Collapsible>

                    </div>
                  </form>
                </Form>
              )}
            </CardContent>
          </Card>
        </div>

        {/* ── Right column: phrases ── */}
        <div className="flex flex-col gap-4">
          <Card className="rounded-[0.625rem] border border-border shadow-none">
            <CardHeader className="pb-2 px-4 pt-4">
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="text-sm font-medium">Phrases</CardTitle>
                {canUpdate && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 gap-1 text-xs"
                    onClick={handleAddPhrase}
                    disabled={isLoading}
                  >
                    <Plus className="h-3 w-3" />
                    Add phrase
                  </Button>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Use <code className="font-mono">{'{{key}}'}</code> tokens in the subject and body.
              </p>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              {isLoading ? (
                <div className="flex flex-col gap-2">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="h-8 rounded bg-muted animate-pulse" />
                  ))}
                </div>
              ) : (
                <DataTable
                  columns={phraseColumns}
                  data={phrases}
                  total={phrases.length}
                  page={1}
                  limit={phrases.length || 20}
                  emptyMessage="No phrases yet — add one to start using tokens."
                />
              )}
            </CardContent>
          </Card>

          {/* Template metadata */}
          {template && (
            <Card className="rounded-[0.625rem] border border-border shadow-none">
              <CardContent className="p-4 flex flex-col gap-2 text-xs text-muted-foreground">
                <div className="flex justify-between">
                  <span>Status</span>
                  {template.status === 'active' ? (
                    <Badge
                      variant="secondary"
                      className="bg-green-500/10 text-green-700 border-green-500/20 dark:text-green-400 text-xs"
                    >
                      Active
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-muted-foreground text-xs">Inactive</Badge>
                  )}
                </div>
                <div className="flex justify-between">
                  <span>Updated</span>
                  <span title={new Date(template.updatedAt).toLocaleString()}>
                    {relativeTime(template.updatedAt)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Created</span>
                  <span>{new Date(template.createdAt).toLocaleDateString()}</span>
                </div>
                {template.emailType && (
                  <div className="flex justify-between">
                    <span>Type</span>
                    <span className="text-foreground">{template.emailType}</span>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* ── Dialogs / Sheets ── */}

      {/* Send test */}
      <SendTestDialog
        open={sendDialogOpen}
        onOpenChange={setSendDialogOpen}
        templateId={template?.id ?? 0}
        phrases={phrases}
      />

      {/* Phrase create / edit */}
      {template && (
        <PhraseSheet
          open={phraseSheetOpen}
          onOpenChange={setPhraseSheetOpen}
          templateId={template.id}
          phrase={editPhrase}
          onSaved={load}
        />
      )}

      {/* Delete template confirm */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete template</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <strong>"{template?.title}"</strong>?
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletePending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={executeDelete}
              disabled={deletePending}
            >
              {deletePending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Phrase delete confirm */}
      <AlertDialog
        open={!!phraseDeleteTarget}
        onOpenChange={(open) => { if (!open) setPhraseDeleteTarget(null) }}
      >
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete phrase</AlertDialogTitle>
            <AlertDialogDescription>
              {phraseDeleteTarget && (
                <>
                  Delete phrase{' '}
                  <code className="font-mono">{`{{${phraseDeleteTarget.key}}}`}</code>? This cannot be undone.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={phraseDeletePending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={executePhraseDelete}
              disabled={phraseDeletePending}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
