import { describe, expect, it } from 'vitest'
import {
  createJournalMergeStats,
  mergeJournalFileContents,
  mergeTextDiff3,
} from './smartMerge'

describe('journal smart merge', () => {
  it('keeps both sides when desktop and mobile edit different journal paragraphs', () => {
    const base = [
      '---',
      'date: "2026-06-09"',
      'updatedAt: "2026-06-09T03:40:00.000Z"',
      '---',
      '',
      '1231',
      '',
      '是否大嫂十分大你好呢',
      '',
      'Codex PC sync check 2026-06-09 0210 CST.',
      '',
    ].join('\n')
    const mobile = base.replace(
      'Codex PC sync check 2026-06-09 0210 CST.',
      'Codex PC sync check 2026-06-09 0210 CST. sdf',
    )
    const desktop = base.replace(
      '是否大嫂十分大你好呢',
      '是否大嫂十分大你好呢 时代峰峻大嫂逻辑',
    )

    const result = mergeTextDiff3({
      base,
      ours: mobile,
      theirs: desktop,
    })

    expect(result.cleanMerge).toBe(true)
    expect(result.mergedText).toContain('是否大嫂十分大你好呢 时代峰峻大嫂逻辑')
    expect(result.mergedText).toContain('Codex PC sync check 2026-06-09 0210 CST. sdf')
  })

  it('leaves conflict markers when both sides edit the same line differently', () => {
    const result = mergeTextDiff3({
      base: 'hello\n',
      ours: 'hello mobile\n',
      oursName: 'mobile',
      theirs: 'hello desktop\n',
      theirsName: 'desktop',
    })

    expect(result.cleanMerge).toBe(false)
    expect(result.mergedText).toContain('<<<<<<< mobile')
    expect(result.mergedText).toContain('hello mobile')
    expect(result.mergedText).toContain('=======')
    expect(result.mergedText).toContain('hello desktop')
    expect(result.mergedText).toContain('>>>>>>> desktop')
  })

  it('keeps both murmur blocks when both sides append different murmurs at the same location', async () => {
    const stats = createJournalMergeStats()
    const base = createJournalContent(
      '第一段。\n\n第二段。',
      [
        createMurmurBlock('m_base', '2026-06-09T03:38:16.587Z', '呵呵呵'),
      ],
    )
    const ours = createJournalContent(
      '第一段，我爱你。\n\n第二段。',
      [
        createMurmurBlock('m_base', '2026-06-09T03:38:16.587Z', '呵呵呵'),
        createMurmurBlock('m_desktop', '2026-06-09T04:15:31.692Z', '很好'),
      ],
    )
    const theirs = createJournalContent(
      '第一段。\n\n第二段 hello world。',
      [
        createMurmurBlock('m_base', '2026-06-09T03:38:16.587Z', '呵呵呵'),
        createMurmurBlock('m_mobile', '2026-06-09T04:15:29.190Z', 'Zhesh'),
      ],
    )

    const result = mergeJournalFileContents({
      base,
      ours,
      oursName: 'main',
      path: '2026-06-09.md',
      stats,
      theirs,
      theirsName: 'origin/main',
    })

    expect(result.cleanMerge).toBe(true)
    expect(result.mergedText).toContain('第一段，我爱你。')
    expect(result.mergedText).toContain('第二段 hello world。')
    expect(result.mergedText).toContain('id: m_mobile')
    expect(result.mergedText).toContain('Zhesh')
    expect(result.mergedText).toContain('id: m_desktop')
    expect(result.mergedText).toContain('很好')
    expect(result.mergedText).not.toContain('<<<<<<<')
    expect(stats).toEqual({
      conflictPaths: 0,
      journalStructurePaths: 1,
      missingContentPaths: 0,
      markdownPaths: 1,
      sideChoicePaths: 0,
    })
  })

  it('keeps a murmur deleted when the other side leaves it unchanged', async () => {
    const baseMurmur = createMurmurBlock('m_base', '2026-06-09T03:38:16.587Z', '旧碎碎念')
    const base = createJournalContent('', [
      baseMurmur,
    ])
    const result = mergeJournalFileContents({
      base,
      ours: createJournalContent('', [
        createMurmurBlock('m_desktop', '2026-06-09T04:15:31.692Z', '桌面新增'),
      ]),
      oursName: 'main',
      path: '2026-06-09.md',
      theirs: createJournalContent('', [
        baseMurmur,
        createMurmurBlock('m_mobile', '2026-06-09T04:15:29.190Z', '移动新增'),
      ]),
      theirsName: 'origin/main',
    })

    expect(result.cleanMerge).toBe(true)
    expect(result.mergedText).not.toContain('id: m_base')
    expect(result.mergedText).not.toContain('旧碎碎念')
    expect(result.mergedText).toContain('id: m_desktop')
    expect(result.mergedText).toContain('桌面新增')
    expect(result.mergedText).toContain('id: m_mobile')
    expect(result.mergedText).toContain('移动新增')
  })

  it('keeps conflict markers when one side deletes a murmur changed by the other side', async () => {
    const base = createJournalContent('', [
      createMurmurBlock('m_same', '2026-06-09T03:38:16.587Z', '原文'),
    ])
    const result = mergeJournalFileContents({
      base,
      ours: createJournalContent('', [
        createMurmurBlock('m_desktop', '2026-06-09T04:15:31.692Z', '桌面新增'),
      ]),
      oursName: 'main',
      path: '2026-06-09.md',
      theirs: createJournalContent('', [
        createMurmurBlock('m_same', '2026-06-09T03:38:16.587Z', '移动改动'),
        createMurmurBlock('m_mobile', '2026-06-09T04:15:29.190Z', '移动新增'),
      ]),
      theirsName: 'origin/main',
    })

    expect(result.cleanMerge).toBe(false)
    expect(result.mergedText).toContain('<<<<<<< main')
    expect(result.mergedText).toContain('移动改动')
    expect(result.mergedText).toContain('>>>>>>> origin/main')
  })

  it('keeps conflict markers when both sides change the same murmur id differently', async () => {
    const base = createJournalContent('', [
      createMurmurBlock('m_same', '2026-06-09T03:38:16.587Z', '原文'),
    ])
    const result = mergeJournalFileContents({
      base,
      ours: createJournalContent('', [
        createMurmurBlock('m_same', '2026-06-09T03:38:16.587Z', '桌面改动'),
      ]),
      oursName: 'main',
      path: '2026-06-09.md',
      theirs: createJournalContent('', [
        createMurmurBlock('m_same', '2026-06-09T03:38:16.587Z', '移动改动'),
      ]),
      theirsName: 'origin/main',
    })

    expect(result.cleanMerge).toBe(false)
    expect(result.mergedText).toContain('<<<<<<< main')
    expect(result.mergedText).toContain('桌面改动')
    expect(result.mergedText).toContain('移动改动')
  })

  it('uses updatedAt selection for annotation JSON files', () => {
    const stats = createJournalMergeStats()
    const result = mergeJournalFileContents({
      base: '{"updatedAt":"2026-06-09T02:00:00.000Z"}',
      defaultSide: 'ours',
      ours: '{"updatedAt":"2026-06-09T02:10:00.000Z","side":"ours"}',
      path: '2026-06-09.json',
      stats,
      theirs: '{"updatedAt":"2026-06-09T02:30:00.000Z","side":"theirs"}',
    })

    expect(result).toEqual({
      cleanMerge: true,
      mergedText: '{"updatedAt":"2026-06-09T02:30:00.000Z","side":"theirs"}',
    })
    expect(stats).toEqual({
      conflictPaths: 0,
      journalStructurePaths: 0,
      missingContentPaths: 0,
      markdownPaths: 0,
      sideChoicePaths: 1,
    })
  })

  it('uses the configured default side for non-text files', () => {
    const stats = createJournalMergeStats()
    const result = mergeJournalFileContents({
      base: 'base-bytes',
      defaultSide: 'ours',
      ours: 'ours-bytes',
      path: 'photo.jpg',
      stats,
      theirs: 'theirs-bytes',
    })

    expect(result).toEqual({
      cleanMerge: true,
      mergedText: 'ours-bytes',
    })
    expect(stats.sideChoicePaths).toBe(1)
  })
})

function createJournalContent(longEntryMarkdown: string, murmurBlocks: string[]) {
  const frontMatter = [
    '---',
    'date: 2026-06-09',
    'updatedAt: 2026-06-09T04:15:29.212Z',
    '---',
    '',
  ].join('\n')
  const body = [
    longEntryMarkdown.trimEnd(),
    ...murmurBlocks,
  ].filter((part) => part.trim()).join('\n\n')

  return `${frontMatter}${body}`
}

function createMurmurBlock(id: string, time: string, body: string) {
  return [
    ':::murmur',
    `id: ${id}`,
    `time: ${time}`,
    '---',
    body,
    ':::',
  ].join('\n')
}
