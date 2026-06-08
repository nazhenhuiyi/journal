import { useCallback, useEffect, useRef, useState } from 'react'
import { Alert, ScrollView, Text, View } from 'react-native'
import type { MurmurBlock } from '@journal/core'
import {
  createMurmur,
  getLocalDateKey,
  loadDailyJournal,
  saveDailyJournal,
  type MobileJournalRecord,
} from './services/mobileJournalStore'
import { Button } from './ui/Button'
import { Pill } from './ui/Pill'
import { Screen } from './ui/Screen'
import { SectionHeader } from './ui/SectionHeader'
import { TextArea } from './ui/TextArea'

type SaveState = 'dirty' | 'idle' | 'loading' | 'saving' | 'saved' | 'error'

const today = getLocalDateKey()

export default function App() {
  const [record, setRecord] = useState<MobileJournalRecord | null>(null)
  const [longEntryMarkdown, setLongEntryMarkdown] = useState('')
  const [murmurs, setMurmurs] = useState<MurmurBlock[]>([])
  const [murmurDraft, setMurmurDraft] = useState('')
  const [saveState, setSaveState] = useState<SaveState>('loading')
  const journalVersionRef = useRef(0)

  useEffect(() => {
    let isMounted = true

    loadDailyJournal(today)
      .then((loadedRecord) => {
        if (!isMounted) {
          return
        }

        setRecord(loadedRecord)

        if (journalVersionRef.current === 0) {
          setLongEntryMarkdown(loadedRecord.longEntryMarkdown)
          setMurmurs(loadedRecord.murmurs)
          setSaveState('idle')
        } else {
          setSaveState('dirty')
        }
      })
      .catch((error) => {
        console.error(error)

        if (isMounted) {
          setSaveState('error')
        }
      })

    return () => {
      isMounted = false
    }
  }, [])

  const statusLabel = getStatusLabel(saveState, record?.updatedAt ?? null)

  const markJournalDirty = useCallback(() => {
    journalVersionRef.current += 1
    setSaveState((currentSaveState) => {
      if (currentSaveState === 'loading' || currentSaveState === 'saving') {
        return currentSaveState
      }

      return 'dirty'
    })
  }, [])

  const handleLongEntryChange = useCallback((value: string) => {
    markJournalDirty()
    setLongEntryMarkdown(value)
  }, [markJournalDirty])

  const saveCurrentJournal = useCallback(async (
    nextLongEntryMarkdown = longEntryMarkdown,
    nextMurmurs = murmurs,
  ) => {
    const savingVersion = journalVersionRef.current

    setSaveState('saving')

    try {
      const savedRecord = await saveDailyJournal({
        date: today,
        longEntryMarkdown: nextLongEntryMarkdown,
        murmurs: nextMurmurs,
      })

      setRecord(savedRecord)

      if (journalVersionRef.current === savingVersion) {
        setLongEntryMarkdown(savedRecord.longEntryMarkdown)
        setMurmurs(savedRecord.murmurs)
        setSaveState('saved')
      } else {
        setSaveState('dirty')
      }
    } catch (error) {
      console.error(error)
      setSaveState('error')
      Alert.alert('保存失败', '本地日记没有写入成功。')
    }
  }, [longEntryMarkdown, murmurs])

  const handleAddMurmur = useCallback(async () => {
    const body = murmurDraft.trim()

    if (!body) {
      return
    }

    const nextMurmurs = [...murmurs, createMurmur(today, body)]

    journalVersionRef.current += 1
    setMurmurDraft('')
    setMurmurs(nextMurmurs)
    await saveCurrentJournal(longEntryMarkdown, nextMurmurs)
  }, [longEntryMarkdown, murmurDraft, murmurs, saveCurrentJournal])

  const isBusy = saveState === 'saving' || saveState === 'loading'

  return (
    <Screen>
      <ScrollView
        className="flex-1"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View className="gap-6 px-5 pb-10 pt-4">
          <View className="gap-4">
            <View className="flex-row items-start justify-between gap-4">
              <View className="shrink">
                <Text className="text-sm font-medium text-mossMuted">{formatDateLine(today)}</Text>
                <Text className="mt-1 text-[42px] font-bold leading-[48px] text-ink">今日</Text>
              </View>
              <Pill
                icon="server-outline"
                tone={saveState === 'error' ? 'plain' : saveState === 'dirty' ? 'blue' : 'green'}
              >
                {statusLabel}
              </Pill>
            </View>

            <View className="flex-row flex-wrap gap-2">
              <Pill icon="folder-open-outline" tone="blue">本地 Markdown</Pill>
              <Pill icon="chatbubble-ellipses-outline" tone="plain">{murmurs.length} 条碎碎念</Pill>
            </View>
          </View>

          <View className="gap-3">
            <SectionHeader icon="book-outline" title="长日记" />
            <TextArea
              minHeightClassName="min-h-56"
              onChangeText={handleLongEntryChange}
              placeholder="写一点今天真正留下来的东西。"
              scrollEnabled={false}
              value={longEntryMarkdown}
            />
            <Button
              disabled={isBusy}
              icon="save-outline"
              loading={saveState === 'saving'}
              onPress={() => void saveCurrentJournal()}
            >
              保存今日
            </Button>
          </View>

          <View className="gap-3">
            <SectionHeader
              icon="add-circle-outline"
              meta={<Text className="text-sm font-medium text-mossMuted">{murmurs.length} 条</Text>}
              title="碎碎念"
            />
            <TextArea
              minHeightClassName="min-h-24"
              onChangeText={setMurmurDraft}
              placeholder="先记一句，不用整理。"
              value={murmurDraft}
            />
            <Button
              className="self-start px-4"
              disabled={!murmurDraft.trim() || isBusy}
              icon="add"
              onPress={() => void handleAddMurmur()}
              variant="secondary"
            >
              加入今天
            </Button>

            <View className="gap-3 pt-1">
              {murmurs.map((murmur) => (
                <MurmurItem key={murmur.id} murmur={murmur} />
              ))}
              {murmurs.length === 0 ? (
                <View className="rounded-lg border border-dashed border-reed bg-cloud px-4 py-5">
                  <Text className="text-center text-sm leading-5 text-mossMuted">
                    今天还没有碎碎念。
                  </Text>
                </View>
              ) : null}
            </View>
          </View>
        </View>
      </ScrollView>
    </Screen>
  )
}

function MurmurItem({ murmur }: { murmur: MurmurBlock }) {
  return (
    <View className="rounded-lg border border-reed bg-paper px-4 py-3">
      <Text className="mb-2 text-xs font-semibold text-soil">{formatTime(murmur.time)}</Text>
      <Text className="text-base leading-6 text-ink">{murmur.body}</Text>
    </View>
  )
}

function formatDateLine(dateKey: string) {
  const date = new Date(`${dateKey}T00:00:00`)

  if (Number.isNaN(date.getTime())) {
    return dateKey
  }

  const weekday = date.toLocaleDateString('zh-CN', { weekday: 'long' })

  return `${dateKey} · ${weekday}`
}

function formatTime(value: string) {
  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return value
  }

  return date.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  })
}

function getStatusLabel(saveState: SaveState, updatedAt: string | null) {
  if (saveState === 'loading') {
    return '正在打开'
  }

  if (saveState === 'saving') {
    return '正在保存'
  }

  if (saveState === 'saved') {
    return '已保存'
  }

  if (saveState === 'dirty') {
    return '有未保存更改'
  }

  if (saveState === 'error') {
    return '保存失败'
  }

  return updatedAt ? `上次保存 ${formatTime(updatedAt)}` : '还没有保存'
}
