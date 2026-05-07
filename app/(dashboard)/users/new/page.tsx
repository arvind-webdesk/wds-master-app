import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { getSessionUser } from '@/lib/auth/session'
import { defineAbilityFor } from '@/lib/acl/ability'
import { UsersForm } from '@/components/users/users-form'

export const metadata = { title: 'New user' }

export default async function NewUserPage() {
  const user = await getSessionUser()
  if (!user) redirect('/login')

  const ability = defineAbilityFor(user)
  if (!ability.can('create', 'User')) redirect('/users')

  return (
    <div className="flex flex-col gap-4 p-6">
      <Link
        href="/users"
        className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors w-fit"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to users
      </Link>
      <div>
        <h1 className="text-xl font-semibold text-foreground">New user</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Fill in the details below to create a new user.
        </p>
      </div>
      <UsersForm mode="create" />
    </div>
  )
}
