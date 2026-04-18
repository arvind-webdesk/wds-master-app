'use client'

import { createContext, useContext, type ReactNode } from 'react'
import { createMongoAbility } from '@casl/ability'
import type { AppAbility } from './ability'

// Default empty ability (no permissions)
const defaultAbility: AppAbility = createMongoAbility<AppAbility>([])

const AbilityContext = createContext<AppAbility>(defaultAbility)

interface AbilityProviderProps {
  ability: AppAbility
  children: ReactNode
}

/**
 * Wrap the dashboard layout with this provider.
 * Pass the ability built server-side (serialised and re-built client-side).
 */
export function AbilityProvider({ ability, children }: AbilityProviderProps) {
  return (
    <AbilityContext.Provider value={ability}>
      {children}
    </AbilityContext.Provider>
  )
}

/** Use inside any client component to check permissions. */
export function useAbility(): AppAbility {
  return useContext(AbilityContext)
}
