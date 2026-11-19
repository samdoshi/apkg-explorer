import { Code, Globe } from 'lucide-react'
import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { useContentPermissions } from './content-permissions'
import type { ContentReport } from './sanitize'

function hostList(hosts: string[]): string {
  const shown = hosts.slice(0, 4).join(', ')
  return hosts.length > 4 ? `${shown} and ${String(hosts.length - 4)} more` : shown
}

/** "This card has scripts (blocked) — Allow scripts", and the same for web content. */
export function ContentNotices({ report, noun }: { report: ContentReport; noun: 'card' | 'note' }) {
  const permissions = useContentPermissions()
  const hosts = hostList(report.webHosts)
  if (!report.scripts && !hosts) return null
  return (
    <div className="flex flex-col gap-2">
      {report.scripts && (
        <Notice
          icon={<Code aria-hidden="true" />}
          text={
            permissions.scripts
              ? `This ${noun} has scripts (allowed for this file).`
              : `This ${noun} has scripts (blocked).`
          }
          action={permissions.scripts ? 'Block scripts' : 'Allow scripts'}
          onAction={() => {
            permissions.setScripts(!permissions.scripts)
          }}
        />
      )}
      {hosts && (
        <Notice
          icon={<Globe aria-hidden="true" />}
          text={
            permissions.web
              ? `This ${noun} loads content from ${hosts} (allowed for this file).`
              : `This ${noun} loads content from ${hosts} (blocked).`
          }
          action={permissions.web ? 'Block web content' : 'Allow web content'}
          onAction={() => {
            permissions.setWeb(!permissions.web)
          }}
        />
      )}
    </div>
  )
}

function Notice({
  icon,
  text,
  action,
  onAction,
}: {
  icon: ReactNode
  text: string
  action: string
  onAction: () => void
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg border bg-muted/50 px-3 py-2 text-sm [&>svg]:size-4 [&>svg]:shrink-0 [&>svg]:text-muted-foreground">
      {icon}
      <p className="min-w-0 flex-1 break-words">{text}</p>
      <Button variant="outline" size="xs" onClick={onAction}>
        {action}
      </Button>
    </div>
  )
}
