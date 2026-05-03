import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { motion } from 'motion/react'
import { ArrowRight, BookOpen, CalendarDays } from '../components/HandDrawnIcons'
import { JournalDayView } from './MarkdownPreviewPage'
import type { JournalDayViewHandle } from './MarkdownPreviewPage'
import { panelTransition } from './markdown-preview/constants'

const monthNames = [
  '一月',
  '二月',
  '三月',
  '四月',
  '五月',
  '六月',
  '七月',
  '八月',
  '九月',
  '十月',
  '十一月',
  '十二月',
]
const weekdayLabels = ['日', '一', '二', '三', '四', '五', '六']
const bookColors = [
  '#2459bc',
  '#14724f',
  '#df6246',
  '#e96b98',
  '#7a4f32',
  '#6f7e63',
  '#b9802e',
  '#4e6f9f',
  '#9a4e60',
  '#8b6f36',
  '#3f746d',
  '#574885',
]

type CalendarCell =
  | {
      type: 'blank'
      id: string
    }
  | {
      type: 'day'
      dateKey: string
      day: number
      hasEntry: boolean
      isToday: boolean
      weekday: number
    }

type JournalEntry = {
  date: string
  fileName: string
  filePath: string
  updatedAt: string | null
}

type CalendarLoadStatus = 'loading' | 'ready' | 'failed'

function getJournalStore() {
  return typeof window === 'undefined' ? undefined : window.journalStore
}

function getLocalDateKey(date = new Date()) {
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')

  return `${year}-${month}-${day}`
}

function parseDateKeyParts(dateKey: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey)

  if (!match) {
    return null
  }

  return {
    monthIndex: Number(match[2]) - 1,
    year: Number(match[1]),
  }
}

function buildMonthCells(
  year: number,
  monthIndex: number,
  todayDateKey: string,
  entryDateKeys: Set<string>,
): CalendarCell[] {
  const firstDay = new Date(year, monthIndex, 1).getDay()
  const dayCount = new Date(year, monthIndex + 1, 0).getDate()
  const cells: CalendarCell[] = Array.from({ length: firstDay }, (_, index) => ({
    id: `blank-${monthIndex}-${index}`,
    type: 'blank',
  }))

  for (let day = 1; day <= dayCount; day += 1) {
    const dateKey = `${year}-${`${monthIndex + 1}`.padStart(2, '0')}-${`${day}`.padStart(2, '0')}`

    cells.push({
      dateKey,
      day,
      hasEntry: entryDateKeys.has(dateKey),
      isToday: dateKey === todayDateKey,
      type: 'day',
      weekday: new Date(year, monthIndex, day).getDay(),
    })
  }

  return cells
}

function CalendarPage() {
  const todayDateKey = getLocalDateKey()
  const today = new Date()
  const [year, setYear] = useState(() => today.getFullYear())
  const [activeMonth, setActiveMonth] = useState(() => today.getMonth())
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [entries, setEntries] = useState<JournalEntry[]>([])
  const [isSwitchingDate, setIsSwitchingDate] = useState(false)
  const dayViewRef = useRef<JournalDayViewHandle>(null)
  const [loadStatus, setLoadStatus] = useState<CalendarLoadStatus>(() =>
    getJournalStore()?.listEntries ? 'loading' : 'ready',
  )
  const entryDateKeys = useMemo(() => new Set(entries.map((entry) => entry.date)), [entries])
  const entryDatesByMonth = useMemo(() => {
    const nextDatesByMonth = new Map<number, string[]>()

    for (const entry of entries) {
      const match = /^(\d{4})-(\d{2})-\d{2}$/.exec(entry.date)

      if (!match || Number(match[1]) !== year) {
        continue
      }

      const monthIndex = Number(match[2]) - 1
      const monthDates = nextDatesByMonth.get(monthIndex) ?? []

      monthDates.push(entry.date)
      nextDatesByMonth.set(monthIndex, monthDates)
    }

    for (const monthDates of nextDatesByMonth.values()) {
      monthDates.sort()
    }

    return nextDatesByMonth
  }, [entries, year])
  const firstEntryMonth = useMemo(
    () => Array.from(entryDatesByMonth.keys()).sort((left, right) => left - right)[0],
    [entryDatesByMonth],
  )
  const displayMonth =
    loadStatus === 'ready' && !entryDatesByMonth.has(activeMonth) && firstEntryMonth !== undefined
      ? firstEntryMonth
      : activeMonth
  const activeMonthCells = useMemo(
    () => buildMonthCells(year, displayMonth, todayDateKey, entryDateKeys),
    [displayMonth, entryDateKeys, todayDateKey, year],
  )
  const activeMonthDates = useMemo(
    () => entryDatesByMonth.get(displayMonth) ?? [],
    [displayMonth, entryDatesByMonth],
  )
  const activeMonthDateKeys = useMemo(() => new Set(activeMonthDates), [activeMonthDates])
  const activeMonthEntries = useMemo(
    () =>
      entries
        .filter((entry) => activeMonthDateKeys.has(entry.date))
        .sort((left, right) => right.date.localeCompare(left.date)),
    [activeMonthDateKeys, entries],
  )
  const activeMonthWeekendEntries = useMemo(
    () =>
      activeMonthDates.filter((dateKey) => {
        const [, month, day] = dateKey.split('-').map(Number)
        const weekday = new Date(year, month - 1, day).getDay()

        return weekday === 0 || weekday === 6
      }).length,
    [activeMonthDates, year],
  )
  const latestActiveMonthEntry = activeMonthEntries[0] ?? null
  const hasActiveMonthEntries = activeMonthDates.length > 0
  const openDate = selectedDate?.startsWith(`${year}-`) && entryDateKeys.has(selectedDate) ? selectedDate : null
  const entryDates = useMemo(() => entries.map((entry) => entry.date).sort(), [entries])
  const openDateIndex = openDate ? entryDates.indexOf(openDate) : -1
  const previousDate = openDateIndex > 0 ? entryDates[openDateIndex - 1] : null
  const nextDate = openDateIndex >= 0 && openDateIndex < entryDates.length - 1 ? entryDates[openDateIndex + 1] : null
  const loadEntries = useCallback(async (shouldApply: () => boolean = () => true) => {
    const journalStore = getJournalStore()

    if (!journalStore?.listEntries) {
      return
    }

    try {
      const journalEntries = await journalStore.listEntries()

      if (shouldApply()) {
        setEntries(journalEntries)
        setLoadStatus('ready')
      }
    } catch {
      if (shouldApply()) {
        setEntries([])
        setLoadStatus('failed')
      }
    }
  }, [])

  useEffect(() => {
    const journalStore = getJournalStore()

    if (!journalStore?.listEntries) {
      return
    }

    let isCancelled = false

    journalStore.listEntries()
      .then((journalEntries) => {
        if (!isCancelled) {
          setEntries(journalEntries)
          setLoadStatus('ready')
        }
      })
      .catch(() => {
        if (!isCancelled) {
          setEntries([])
          setLoadStatus('failed')
        }
      })

    return () => {
      isCancelled = true
    }
  }, [loadEntries])

  function handleOpenMonth(monthIndex: number) {
    const monthDates = entryDatesByMonth.get(monthIndex) ?? []

    if (monthDates.length === 0) {
      return
    }

    setActiveMonth(monthIndex)
    setSelectedDate(null)
  }

  async function flushOpenDayBeforeLeaving() {
    if (!openDate) {
      return true
    }

    setIsSwitchingDate(true)

    try {
      return await (dayViewRef.current?.flushPendingSave() ?? Promise.resolve(true))
    } finally {
      setIsSwitchingDate(false)
    }
  }

  async function handleSelectDate(dateKey: string) {
    const dateParts = parseDateKeyParts(dateKey)

    if (!dateParts) {
      return
    }

    if (dateKey !== openDate && !(await flushOpenDayBeforeLeaving())) {
      return
    }

    setYear(dateParts.year)
    setActiveMonth(dateParts.monthIndex)
    setSelectedDate(dateKey)
  }

  async function handleReturnToCalendar() {
    if (!(await flushOpenDayBeforeLeaving())) {
      return
    }

    if (openDate) {
      const dateParts = parseDateKeyParts(openDate)

      if (dateParts) {
        setYear(dateParts.year)
        setActiveMonth(dateParts.monthIndex)
      }
    }

    setSelectedDate(null)
    setLoadStatus('loading')
    void loadEntries()
  }

  if (openDate) {
    return (
      <motion.div
        animate={{ opacity: 1, y: 0 }}
        className="calendar-library calendar-day-screen min-h-0 flex-1 overflow-hidden"
        initial={{ opacity: 0, y: 10 }}
        transition={panelTransition}
      >
        <header className="calendar-day-toolbar">
          <button
            className="calendar-day-back"
            disabled={isSwitchingDate}
            onClick={() => void handleReturnToCalendar()}
            type="button"
          >
            <CalendarDays aria-hidden="true" size={17} strokeWidth={2.15} />
            <span>返回日历</span>
          </button>
          <time className="calendar-day-current" dateTime={openDate}>
            {openDate}
          </time>
          <div className="calendar-day-jump">
            <button
              className="calendar-day-nav"
              disabled={!previousDate || isSwitchingDate}
              onClick={() => previousDate && void handleSelectDate(previousDate)}
              type="button"
            >
              <ArrowRight aria-hidden="true" className="is-previous" size={17} strokeWidth={2.25} />
              <span>上一天</span>
            </button>
            <button
              className="calendar-day-nav"
              disabled={!nextDate || isSwitchingDate}
              onClick={() => nextDate && void handleSelectDate(nextDate)}
              type="button"
            >
              <span>下一天</span>
              <ArrowRight aria-hidden="true" size={17} strokeWidth={2.25} />
            </button>
          </div>
        </header>
        <section aria-label={`${openDate} 的日记`} className="calendar-day-content min-h-0 flex-1">
          <JournalDayView date={openDate} ref={dayViewRef} showDaySwitchNudge={false} />
        </section>
      </motion.div>
    )
  }

  return (
    <motion.div
      animate={{ opacity: 1, y: 0 }}
      className="calendar-library min-h-0 flex-1 overflow-y-auto"
      initial={{ opacity: 0, y: 10 }}
      transition={panelTransition}
    >
      <header className="mx-auto grid w-[min(100%,66rem)] grid-cols-[minmax(0,1fr)_auto] items-end gap-6 px-10 pb-7 pt-9">
        <div className="min-w-0">
          <h1 className="m-0 font-display text-[2.45rem] font-semibold leading-tight tracking-[0] text-ink">
            日历书架
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            className="calendar-year-button"
            onClick={() => setYear((currentYear) => currentYear - 1)}
            type="button"
          >
            上一年
          </button>
          <strong className="calendar-year-label">{year}</strong>
          <button
            className="calendar-year-button"
            onClick={() => setYear((currentYear) => currentYear + 1)}
            type="button"
          >
            下一年
          </button>
        </div>
      </header>

      <section aria-label={`${year} 年月份书架`} className="calendar-shelf mx-auto w-[min(100%,66rem)] px-10">
        <div className="calendar-book-row">
          {monthNames.map((monthName, monthIndex) => {
            const isActive = monthIndex === displayMonth
            const monthDateKey = `${year}-${`${monthIndex + 1}`.padStart(2, '0')}`
            const monthDates = entryDatesByMonth.get(monthIndex) ?? []
            const hasEntries = monthDates.length > 0

            return (
              <button
                aria-expanded={isActive}
                className={`calendar-book ${isActive ? 'is-active' : ''} ${hasEntries ? '' : 'is-empty'}`}
                disabled={!hasEntries}
                key={monthName}
                onClick={() => handleOpenMonth(monthIndex)}
                style={{ '--book-accent': bookColors[monthIndex] } as CSSProperties}
                type="button"
              >
                <span aria-hidden="true" className="calendar-book-cap" />
                <span className="calendar-book-title">{monthName}</span>
                <time className="calendar-book-date" dateTime={monthDateKey}>
                  {hasEntries ? `${monthDates.length}篇` : '空'}
                </time>
              </button>
            )
          })}
        </div>
      </section>

      <section
        aria-labelledby="calendar-open-month"
        className="mx-auto grid w-[min(100%,66rem)] grid-cols-[16rem_minmax(0,1fr)] gap-6 px-10 pb-12 pt-8"
      >
        <aside className="calendar-open-book">
          <div className="calendar-open-book-icon">
            <BookOpen aria-hidden="true" size={32} strokeWidth={2.08} />
          </div>
          <p>{year}</p>
          <h2 id="calendar-open-month">{monthNames[displayMonth]}</h2>
          <time dateTime={`${year}-${`${displayMonth + 1}`.padStart(2, '0')}`}>
            {hasActiveMonthEntries ? `${activeMonthDates.length} 篇日记` : '还没有日记'}
          </time>
          <dl className="calendar-month-stats">
            <div>
              <dt>最近一篇</dt>
              <dd>{latestActiveMonthEntry?.date.slice(5).replace('-', '.') ?? '等待第一篇'}</dd>
            </div>
            <div>
              <dt>记录日</dt>
              <dd>{activeMonthDates.length} 天</dd>
            </div>
            <div>
              <dt>周末</dt>
              <dd>{activeMonthWeekendEntries} 篇</dd>
            </div>
          </dl>
          <div className="calendar-open-book-note">
            {hasActiveMonthEntries
              ? `这个月还有 ${new Date(year, displayMonth + 1, 0).getDate() - activeMonthDates.length} 天空白。`
              : '书架上还空着，等一篇日记落进来。'}
          </div>
        </aside>

        <div className="calendar-grid-panel">
          <div className="calendar-week-row" aria-hidden="true">
            {weekdayLabels.map((weekday) => (
              <span key={weekday}>{weekday}</span>
            ))}
          </div>
          <div className="calendar-day-grid">
            {activeMonthCells.map((cell) => {
              if (cell.type === 'blank') {
                return <span aria-hidden="true" className="calendar-day-cell is-blank" key={cell.id} />
              }

              return (
                <button
                  aria-label={`打开 ${cell.dateKey} 的日记`}
                  className={`calendar-day-cell ${cell.isToday ? 'is-today' : ''} ${cell.hasEntry ? '' : 'is-empty'} ${
                    cell.weekday === 0 || cell.weekday === 6 ? 'is-weekend' : ''
                  }`}
                  disabled={!cell.hasEntry}
                  key={cell.dateKey}
                  onClick={() => void handleSelectDate(cell.dateKey)}
                  type="button"
                >
                  <span>{cell.day}</span>
                  <small className={cell.isToday ? 'is-today-label' : undefined}>{cell.isToday ? '今日' : ''}</small>
                </button>
              )
            })}
          </div>
        </div>
      </section>
    </motion.div>
  )
}

export default CalendarPage
