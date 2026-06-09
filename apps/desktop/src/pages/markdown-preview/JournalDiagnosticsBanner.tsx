import { AlertCircle } from 'lucide-react'
import type { MarkdownDiagnostic } from '@journal/core'

type JournalDiagnosticsBannerProps = {
  diagnostics: MarkdownDiagnostic[]
}

function JournalDiagnosticsBanner({ diagnostics }: JournalDiagnosticsBannerProps) {
  if (diagnostics.length === 0) {
    return null
  }

  const errorCount = diagnostics.filter((diagnostic) => diagnostic.severity === 'error').length
  const title = errorCount > 0 ? 'Markdown 格式需要处理' : 'Markdown 格式提醒'

  return (
    <aside className="journal-diagnostics-banner" role={errorCount > 0 ? 'alert' : 'status'}>
      <AlertCircle aria-hidden="true" size={16} strokeWidth={2.2} />
      <div>
        <strong>{title}</strong>
        <ul>
          {diagnostics.map((diagnostic, index) => (
            <li key={`${diagnostic.line ?? 'line'}-${diagnostic.column ?? 'column'}-${index}`}>
              {formatDiagnosticLocation(diagnostic)}
              {diagnostic.message}
            </li>
          ))}
        </ul>
      </div>
    </aside>
  )
}

function formatDiagnosticLocation(diagnostic: MarkdownDiagnostic) {
  if (!diagnostic.line) {
    return ''
  }

  return `第 ${diagnostic.line} 行：`
}

export default JournalDiagnosticsBanner
