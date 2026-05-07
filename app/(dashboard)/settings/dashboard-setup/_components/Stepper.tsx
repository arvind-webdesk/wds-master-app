'use client'

import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface Step {
  key:   string
  label: string
}

interface StepperProps {
  steps:    ReadonlyArray<Step>
  current:  number
  /** Optional click handler — only called for steps the user has already visited. */
  onSelect?: (index: number) => void
  visited:  ReadonlySet<number>
}

export function Stepper({ steps, current, onSelect, visited }: StepperProps) {
  return (
    <ol className="flex w-full items-center gap-1 overflow-x-auto py-2">
      {steps.map((step, idx) => {
        const isDone     = idx < current
        const isCurrent  = idx === current
        const canJump    = !!onSelect && (visited.has(idx) || idx <= current)
        const Tag: 'button' | 'div' = canJump ? 'button' : 'div'
        return (
          <li key={step.key} className="flex flex-1 items-center gap-1 min-w-fit">
            <Tag
              type={canJump ? 'button' : undefined}
              onClick={canJump && onSelect ? () => onSelect(idx) : undefined}
              className={cn(
                'flex items-center gap-2 rounded-md px-2 py-1 text-xs transition-colors',
                canJump && 'hover:bg-muted',
                isCurrent ? 'text-foreground font-medium' : 'text-muted-foreground',
              )}
              aria-current={isCurrent ? 'step' : undefined}
            >
              <span
                className={cn(
                  'flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px] font-semibold',
                  isDone && 'border-primary bg-primary text-primary-foreground',
                  isCurrent && 'border-primary text-primary',
                  !isDone && !isCurrent && 'border-border text-muted-foreground',
                )}
              >
                {isDone ? <Check className="h-3 w-3" /> : idx + 1}
              </span>
              <span className="whitespace-nowrap">{step.label}</span>
            </Tag>
            {idx < steps.length - 1 ? (
              <span
                aria-hidden
                className={cn('h-px flex-1 min-w-3', isDone ? 'bg-primary/60' : 'bg-border')}
              />
            ) : null}
          </li>
        )
      })}
    </ol>
  )
}
