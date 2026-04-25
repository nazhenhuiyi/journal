import type { LucideIcon } from 'lucide-react'
import { BookOpen, CalendarDays, Image, PenLine, Settings, Sparkles } from 'lucide-react'
import { motion } from 'motion/react'
import { Outlet } from 'react-router'
import { panelTransition } from '../pages/markdown-preview/constants'

const menuItems: Array<{
  label: string
  description: string
  icon: LucideIcon
  isActive?: boolean
}> = [
  { label: '今日', description: '4月25日', icon: PenLine, isActive: true },
  { label: '日记', description: '全部纸页', icon: BookOpen },
  { label: '回声', description: '旧日重现', icon: Sparkles },
  { label: '相册', description: '照片记录', icon: Image },
  { label: '日历', description: '时间索引', icon: CalendarDays },
  { label: '设置', description: '外观与边界', icon: Settings },
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
        className="journal-shell grid h-full min-h-0 w-full grid-rows-[auto_minmax(0,1fr)] overflow-hidden lg:grid-cols-[248px_minmax(0,1fr)] lg:grid-rows-none"
        initial={{ opacity: 0, y: 12 }}
        transition={panelTransition}
      >
        <nav aria-label="主菜单" className="journal-menu">
          <div className="journal-menu-title">
            <span>Journal</span>
            <span>私人记录</span>
          </div>
          <div className="journal-menu-list">
            {menuItems.map((item) => {
              const Icon = item.icon

              return (
                <button
                  key={item.label}
                  aria-current={item.isActive ? 'page' : undefined}
                  className={item.isActive ? 'is-active' : ''}
                  type="button"
                >
                  <Icon aria-hidden="true" size={18} strokeWidth={1.8} />
                  <span>
                    <strong>{item.label}</strong>
                    <small>{item.description}</small>
                  </span>
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
