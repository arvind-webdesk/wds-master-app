'use client'

import { createContext, useContext, useMemo, type ReactNode } from 'react'
import { createMongoAbility } from '@casl/ability'
import type { AppAbility } from './ability'

// Default empty ability (no permissions)
const AbilityContext = createContext<AppAbility>(createMongoAbility<AppAbility>([]))

interface AbilityProviderProps {
  /**
   * Raw CASL rules — plain serializable objects extracted server-side via
   * `ability.rules`. The ability is reconstructed here on the client so the
   * class instance never crosses the Server → Client boundary.
   */
  rules: AppAbility['rules']
  children: ReactNode
}

export function AbilityProvider({ rules, children }: AbilityProviderProps) {
  const ability = useMemo(() => createMongoAbility<AppAbility>(rules), [rules])

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
