import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'motion/react'
import { ArrowRight, CalendarDays } from 'lucide-react'
import { useSearchParams } from 'react-router'
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
  const year = Number(match[1])
  const monthNumber = Number(match[2])
  const dayNumber = Number(match[3])
  const monthIndex = monthNumber - 1
  const dayCount = new Date(year, monthNumber, 0).getDate()

  if (monthNumber < 1 || monthNumber > 12 || dayNumber < 1 || dayNumber > dayCount) {
    return null
  }

  return {
    monthIndex,
    year,
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
  const [searchParams, setSearchParams] = useSearchParams()
  const dateParam = searchParams.get('date')
  const dateParamParts = useMemo(() => (dateParam ? parseDateKeyParts(dateParam) : null), [dateParam])
  const [year, setYear] = useState(() => dateParamParts?.year ?? today.getFullYear())
  const [activeMonth, setActiveMonth] = useState(() => dateParamParts?.monthIndex ?? today.getMonth())
  const viewYear = dateParamParts?.year ?? year
  const viewMonth = dateParamParts?.monthIndex ?? activeMonth
  const [entries, setEntries] = useState<JournalEntry[]>([])
  const [isSwitchingDate, setIsSwitchingDate] = useState(false)
  const dayViewRef = useRef<JournalDayViewHandle>(null)
  const [, setLoadStatus] = useState<CalendarLoadStatus>(() =>
    getJournalStore()?.listEntries ? 'loading' : 'ready',
  )
  const entryDateKeys = useMemo(() => new Set(entries.map((entry) => entry.date)), [entries])
  const entryDatesByMonth = useMemo(() => {
    const nextDatesByMonth = new Map<number, string[]>()

    for (const entry of entries) {
      const match = /^(\d{4})-(\d{2})-\d{2}$/.exec(entry.date)

      if (!match || Number(match[1]) !== viewYear) {
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
  }, [entries, viewYear])
  const displayMonth = viewMonth
  const activeMonthCells = useMemo(
    () => buildMonthCells(viewYear, displayMonth, todayDateKey, entryDateKeys),
    [displayMonth, entryDateKeys, todayDateKey, viewYear],
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
  const latestActiveMonthEntry = activeMonthEntries[0] ?? null
  const hasActiveMonthEntries = activeMonthDates.length > 0
  const activeMonthDayCount = new Date(viewYear, displayMonth + 1, 0).getDate()
  const requestedOpenDate = dateParamParts ? dateParam : null
  const openDate = requestedOpenDate && entryDateKeys.has(requestedOpenDate) ? requestedOpenDate : null
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

  useEffect(() => {
    if (dateParam && !dateParamParts) {
      setSearchParams({}, { replace: true })
    }
  }, [dateParam, dateParamParts, setSearchParams])

  function handleOpenMonth(monthIndex: number) {
    setActiveMonth(monthIndex)
    setSearchParams({}, { replace: true })
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
    setSearchParams({ date: dateKey })
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

    setSearchParams({}, { replace: true })
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
          <h1 className="m-0 font-display text-[2.45rem] font-semibold leading-tight tracking-[0] text-foreground">
            日历
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
          <strong className="calendar-year-label">{viewYear}</strong>
          <button
            className="calendar-year-button"
            onClick={() => setYear((currentYear) => currentYear + 1)}
            type="button"
          >
            下一年
          </button>
        </div>
      </header>

      <section aria-label={`${viewYear} 年月份`} className="calendar-month-strip mx-auto w-[min(100%,66rem)] px-10">
        <div className="calendar-month-row">
          {monthNames.map((monthName, monthIndex) => {
            const isActive = monthIndex === displayMonth
            const monthDates = entryDatesByMonth.get(monthIndex) ?? []
            const hasEntries = monthDates.length > 0

            return (
              <button
                aria-pressed={isActive}
                className={`calendar-month-button ${isActive ? 'is-active' : ''} ${hasEntries ? '' : 'is-empty'}`}
                key={monthName}
                onClick={() => handleOpenMonth(monthIndex)}
                type="button"
              >
                <span>{monthName}</span>
                <small>{hasEntries ? `${monthDates.length} 篇` : '空'}</small>
              </button>
            )
          })}
        </div>
      </section>

      <section
        aria-labelledby="calendar-open-month"
        className="mx-auto grid w-[min(100%,66rem)] grid-cols-[16rem_minmax(0,1fr)] gap-6 px-10 pb-12 pt-8"
      >
        <aside className="calendar-month-summary">
          <div className="calendar-month-summary-heading">
            <CalendarDays aria-hidden="true" className="calendar-month-summary-icon" size={22} strokeWidth={2.08} />
            <h2 id="calendar-open-month">{monthNames[displayMonth]}</h2>
          </div>
          <dl className="calendar-month-stats">
            <div>
              <dt>本月</dt>
              <dd>{hasActiveMonthEntries ? `${activeMonthDates.length} / ${activeMonthDayCount} 天有记录` : '0 天有记录'}</dd>
            </div>
            <div>
              <dt>最近</dt>
              <dd>{latestActiveMonthEntry?.date.slice(5).replace('-', '.') ?? '等待第一篇'}</dd>
            </div>
          </dl>
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
