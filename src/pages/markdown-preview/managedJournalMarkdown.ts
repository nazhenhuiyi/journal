import {
  createJournalMarkdownWithFrontMatter,
  stripManagedFrontMatter as stripJournalManagedFrontMatter,
  type DayFrontMatter,
} from '../../domain/markdown'

export function stripManagedFrontMatter(markdown: string) {
  return stripJournalManagedFrontMatter(markdown)
}

export function createManagedJournalMarkdown(
  markdown: string,
  date: string,
  frontMatter: DayFrontMatter = {},
) {
  return createJournalMarkdownWithFrontMatter(markdown, { ...frontMatter, date })
}
