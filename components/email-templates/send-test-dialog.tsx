'use client'

import { useState, useTransition } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { Loader2, X } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

// ─── Types ────────────────────────────────────────────────────────────────────

export type EmailPhrase = {
  id: number
  templateId: number
  key: string
  value: string
  createdAt: string
  updatedAt: string
}

interface SendTestDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  templateId: number
  phrases: EmailPhrase[]
}

// ─── Zod ─────────────────────────────────────────────────────────────────────

const schema = z.object({
  emailInput: z.string().optional(),
})
type FormValues = z.infer<typeof schema>

// ─── Component ────────────────────────────────────────────────────────────────

export function SendTestDialog({ open, onOpenChange, templateId, phrases }: SendTestDialogProps) {
  const [pending, startTransition] = useTransition()
  const [recipients, setRecipients] = useState<string[]>([])
  const [recipientError, setRecipientError] = useState('')
  const [overrides, setOverrides] = useState<Record<string, string>>({})

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { emailInput: '' },
  })

  function addRecipient(raw: string) {
    const email = raw.trim().toLowerCase()
    const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRe.test(email)) {
      setRecipientError('Enter a valid email address')
      return
    }
    if (recipients.includes(email)) {
      setRecipientError('Already added')
      return
    }
    if (recipients.length >= 10) {
      setRecipientError('Maximum 10 recipients')
      return
    }
    setRecipientError('')
    setRecipients((prev) => [...prev, email])
    form.setValue('emailInput', '')
  }

  function removeRecipient(email: string) {
    setRecipients((prev) => prev.filter((r) => r !== email))
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      const val = (e.target as HTMLInputElement).value
      if (val) addRecipient(val)
    }
  }

  function handleSend() {
    if (recipients.length === 0) {
      setRecipientError('Add at least one recipient')
      return
    }
    startTransition(async () => {
      const res = await fetch(`/api/email-templates/${templateId}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: recipients,
          overrides: Object.keys(overrides).length > 0 ? overrides : undefined,
        }),
      })
      const payload = await res.json()
      if (!res.ok) {
        if (res.status === 403) {
          setRecipientError(payload.error?.message ?? 'Recipient not allowed by template allow_to')
        } else {
          toast.error(payload.error?.message ?? 'Failed to send test email')
        }
        return
      }
      const sent = payload.data?.sent ?? recipients.length
      toast.success(`Test email sent to ${sent} recipient${sent !== 1 ? 's' : ''}`)
      onOpenChange(false)
      setRecipients([])
      setOverrides({})
    })
  }

  function handleClose() {
    onOpenChange(false)
    setRecipients([])
    setOverrides({})
    setRecipientError('')
    form.reset()
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose() }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Send test email</DialogTitle>
          <DialogDescription>
            Enter up to 10 recipient addresses, then optionally override phrase values.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          {/* Recipient chips */}
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">Recipients</span>
            <div className="min-h-9 flex flex-wrap gap-1.5 rounded-md border border-input bg-background px-2 py-1.5 focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-1">
              {recipients.map((r) => (
                <Badge key={r} variant="secondary" className="gap-1 pr-1">
                  {r}
                  <button
                    type="button"
                    onClick={() => removeRecipient(r)}
                    className="hover:text-destructive transition-colors"
                    aria-label={`Remove ${r}`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
              <Form {...form}>
                <FormField
                  control={form.control}
                  name="emailInput"
                  render={({ field }) => (
                    <input
                      {...field}
                      type="email"
                      placeholder={recipients.length === 0 ? 'user@example.com' : ''}
                      className="flex-1 min-w-32 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                      onKeyDown={handleKeyDown}
                      onBlur={(e) => {
                        if (e.target.value) addRecipient(e.target.value)
                      }}
                    />
                  )}
                />
              </Form>
            </div>
            {recipientError && (
              <p className="text-destructive text-sm">{recipientError}</p>
            )}
            <p className="text-xs text-muted-foreground">
              Press Enter or comma to add each address.
            </p>
          </div>

          {/* Override values */}
          {phrases.length > 0 && (
            <div className="flex flex-col gap-2">
              <span className="text-sm font-medium">Override phrase values <span className="text-muted-foreground font-normal">(optional)</span></span>
              <div className="flex flex-col gap-2 max-h-48 overflow-y-auto pr-1">
                {phrases.map((phrase) => (
                  <div key={phrase.id} className="grid gap-1">
                    <label className="text-xs font-medium text-muted-foreground font-mono">
                      {`{{${phrase.key}}}`}
                    </label>
                    <Input
                      placeholder={phrase.value || 'Leave empty to use stored value'}
                      value={overrides[phrase.key] ?? ''}
                      onChange={(e) =>
                        setOverrides((prev) => ({
                          ...prev,
                          [phrase.key]: e.target.value,
                        }))
                      }
                      className="h-8 text-xs"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={handleClose} disabled={pending}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSend} disabled={pending}>
            {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Send test
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
