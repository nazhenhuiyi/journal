import { useEffect, useState } from 'react'
import { motion } from 'motion/react'
import type { LucideIcon } from 'lucide-react'
import { BookOpen, CalendarDays, PenLine, Settings2 } from 'lucide-react'
import { NavLink, Outlet } from 'react-router'
import { brand } from '../brand'
import { panelTransition } from '../pages/markdown-preview/constants'

const menuItems: Array<{
  label: string
  description: string
  icon: LucideIcon
  to?: string
  disabled?: boolean
}> = [
  { label: '今日', description: '', icon: PenLine, to: '/preview' },
  { label: '日历', description: '翻看旧日', icon: CalendarDays, to: '/calendar' },
  { label: '设置', description: '同步', icon: Settings2, to: '/settings' },
]

function formatMenuDate(date = new Date()) {
  return `${date.getMonth() + 1}月${date.getDate()}日`
}

function millisecondsUntilNextDay(date = new Date()) {
  const nextDay = new Date(date)

  nextDay.setHours(24, 0, 1, 0)

  return nextDay.getTime() - date.getTime()
}

function useTodayMenuDate() {
  const [todayMenuDate, setTodayMenuDate] = useState(() => formatMenuDate())

  useEffect(() => {
    let timeoutId: number

    function scheduleNextUpdate() {
      timeoutId = window.setTimeout(() => {
        setTodayMenuDate(formatMenuDate())
        scheduleNextUpdate()
      }, millisecondsUntilNextDay())
    }

    scheduleNextUpdate()

    return () => window.clearTimeout(timeoutId)
  }, [])

  return todayMenuDate
}

function AppLayout() {
  const todayMenuDate = useTodayMenuDate()

  return (
    <motion.main
      animate={{ opacity: 1 }}
      className="journal-workspace h-screen overflow-hidden font-sans text-foreground"
      initial={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
    >
      <motion.div
        animate={{ opacity: 1, y: 0 }}
        className="journal-shell grid h-full min-h-0 w-full grid-cols-[232px_minmax(0,1fr)] overflow-hidden"
        initial={{ opacity: 0, y: 12 }}
        transition={panelTransition}
      >
        <nav aria-label="主菜单" className="journal-menu">
          <div className="journal-menu-brand">
            <div aria-hidden="true" className="journal-menu-mark">
              <BookOpen size={25} strokeWidth={2.05} />
            </div>
            <div className="journal-menu-title">
              <span>{brand.name}</span>
              <span>{brand.tagline}</span>
            </div>
          </div>
          <div className="journal-menu-list">
            {menuItems.map((item) => {
              const Icon = item.icon
              const description = item.label === '今日' ? todayMenuDate : item.description
              const content = (
                <>
                  <Icon aria-hidden="true" size={19} strokeWidth={2.18} />
                  <span>
                    <strong>{item.label}</strong>
                    <small>{description}</small>
                  </span>
                </>
              )

              if (item.to) {
                return (
                  <NavLink
                    className={({ isActive }) => (isActive ? 'is-active' : undefined)}
                    key={item.label}
                    to={item.to}
                  >
                    {content}
                  </NavLink>
                )
              }

              return (
                <button
                  aria-disabled={item.disabled}
                  disabled={item.disabled}
                  key={item.label}
                  type="button"
                >
                  {content}
                </button>
              )
            })}
          </div>
        </nav>

        <section className="journal-page flex min-h-0 flex-col">
          <Outlet />
        </section>
      </motion.div>
    </motion.main>
  )
}

export default AppLayout
