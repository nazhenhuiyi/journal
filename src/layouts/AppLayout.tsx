import { motion } from 'motion/react'
import { NavLink, Outlet } from 'react-router'
import {
  BookOpen,
  CalendarDays,
  Image,
  PenLine,
  Settings,
  Sparkles,
  type HandDrawnIcon,
} from '../components/HandDrawnIcons'
import { panelTransition } from '../pages/markdown-preview/constants'

const menuItems: Array<{
  label: string
  description: string
  icon: HandDrawnIcon
  to?: string
  disabled?: boolean
}> = [
  { label: '今日', description: '4月25日', icon: PenLine, to: '/preview' },
  { label: '日记', description: '全部纸页', icon: BookOpen, to: '/pages' },
  { label: '回声', description: '旧日重现', icon: Sparkles, disabled: true },
  { label: '相册', description: '照片记录', icon: Image, disabled: true },
  { label: '日历', description: '时间索引', icon: CalendarDays, disabled: true },
  { label: '设置', description: '外观与边界', icon: Settings, disabled: true },
]

function AppLayout() {
  return (
    <motion.main
      animate={{ opacity: 1 }}
      className="journal-workspace h-screen overflow-hidden font-sans text-ink"
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
          <div aria-hidden="true" className="journal-menu-mark">
            <BookOpen size={25} strokeWidth={2.05} />
          </div>
          <div className="journal-menu-list">
            {menuItems.map((item) => {
              const Icon = item.icon
              const content = (
                <>
                  <Icon aria-hidden="true" size={19} strokeWidth={2.18} />
                  <span>
                    <strong>{item.label}</strong>
                    <small>{item.description}</small>
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
