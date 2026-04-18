import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Users, Shield, Mail, Activity } from 'lucide-react'

export default function DashboardPage() {
  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Page header */}
      <div>
        <h1 className="text-xl font-semibold text-foreground">Dashboard</h1>
        <p className="text-sm text-muted-foreground">Welcome back — here's what's happening.</p>
      </div>

      {/* KPI cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { title: 'Total Users',      icon: Users,    value: '—', change: 'Set up your DB to see data' },
          { title: 'Roles',            icon: Shield,   value: '—', change: 'Manage via Roles page' },
          { title: 'Email Templates',  icon: Mail,     value: '—', change: 'Create your first template' },
          { title: 'API Log Entries',  icon: Activity, value: '—', change: 'Logs stream here in real time' },
        ].map(({ title, icon: Icon, value, change }) => (
          <Card key={title} className="rounded-[0.625rem] border border-border shadow-none">
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
              <Icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{value}</p>
              <p className="text-xs text-muted-foreground mt-1">{change}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Placeholder charts area */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="rounded-[0.625rem] border border-border shadow-none">
          <CardHeader>
            <CardTitle className="text-sm font-medium">User Activity</CardTitle>
          </CardHeader>
          <CardContent className="h-48 flex items-center justify-center text-muted-foreground text-sm">
            Chart renders here after connecting DB
          </CardContent>
        </Card>
        <Card className="rounded-[0.625rem] border border-border shadow-none">
          <CardHeader>
            <CardTitle className="text-sm font-medium">Recent API Logs</CardTitle>
          </CardHeader>
          <CardContent className="h-48 flex items-center justify-center text-muted-foreground text-sm">
            Live log stream appears here
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
