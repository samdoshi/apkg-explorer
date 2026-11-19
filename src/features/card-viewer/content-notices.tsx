import { Code, Globe } from 'lucide-react'
import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { ContentDetails, type DetailsView } from './content-details'
import { useContentPermissions } from './content-permissions'
import { webHosts, type ContentReport } from './sanitize'

function hostList(hosts: string[]): string {
  const shown = hosts.slice(0, 4).join(', ')
  return hosts.length > 4 ? `${shown} and ${String(hosts.length - 4)} more` : shown
}

/**
 * "This card has scripts (blocked)", and the same for web content, each with a button
 * to see exactly what was found and one to allow (or block) it for the whole file.
 */
export function ContentNotices({ report, noun }: { report: ContentReport; noun: 'card' | 'note' }) {
  const permissions = useContentPermissions()
  const hosts = hostList(webHosts(report))
  if (report.scripts.length === 0 && !hosts) return null
  const view = (details: DetailsView, label: string) => (
    <ContentDetails view={details} report={report} noun={noun}>
      <Button variant="ghost" size="xs">
        {label}
      </Button>
    </ContentDetails>
  )
  return (
    <div className="flex flex-col gap-2">
      {report.scripts.length > 0 && (
        <Notice
          icon={<Code aria-hidden="true" />}
          text={
            permissions.scripts
              ? `This ${noun} has scripts (allowed for this file).`
              : `This ${noun} has scripts (blocked).`
          }
          view={view('scripts', 'View scripts')}
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
          view={view('web', 'View remote URLs')}
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
  view,
  action,
  onAction,
}: {
  icon: ReactNode
  text: string
  /** The "View …" button, which opens the list of what was found. */
  view: ReactNode
  action: string
  onAction: () => void
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg border bg-muted/50 px-3 py-2 text-sm [&>svg]:size-4 [&>svg]:shrink-0 [&>svg]:text-muted-foreground">
      {icon}
      {/* Wants 14rem before sharing a line, so on phones the buttons wrap below it. */}
      <p className="min-w-0 flex-1 basis-56 break-words">{text}</p>
      <div className="flex gap-2">
        {view}
        <Button variant="outline" size="xs" onClick={onAction}>
          {action}
        </Button>
      </div>
    </div>
  )
}
