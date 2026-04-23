import { useState } from 'react'

const entries = [
  {
    date: 'Apr 23',
    title: '新的日记本',
    excerpt: '给每天留一块安静的空间，先记下天气、心情和一个值得保存的瞬间。',
    mood: '平静',
  },
  {
    date: 'Apr 22',
    title: '窗边的晚风',
    excerpt: '今天的灵感来自一杯热茶。下一步可以加本地存储、搜索和日历视图。',
    mood: '温暖',
  },
]

const starterPrompt = '请用新手能听懂的方式，解释这个日记应用当前的代码结构。'

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Codex 暂时没有返回结果，请稍后再试。'
}

function App() {
  const [prompt, setPrompt] = useState(starterPrompt)
  const [answer, setAnswer] = useState('')
  const [activities, setActivities] = useState<
    {
      id: string
      type: string
      summary: string
      status?: string
      exitCode?: number
    }[]
  >([])
  const [isAsking, setIsAsking] = useState(false)
  const [error, setError] = useState('')

  async function askCodex() {
    const trimmedPrompt = prompt.trim()

    if (!trimmedPrompt) {
      setError('先写一句想问 Codex 的问题。')
      return
    }

    if (!window.codex) {
      setError('Codex 只在 Electron 桌面窗口中可用，请用 npm run dev 启动应用。')
      return
    }

    setIsAsking(true)
    setError('')
    setAnswer('')
    setActivities([])

    try {
      const result = await window.codex.ask(trimmedPrompt)

      setAnswer(result.finalResponse || 'Codex 已完成，但没有返回文本回答。')
      setActivities(result.items)
    } catch (caughtError) {
      setError(getErrorMessage(caughtError))
    } finally {
      setIsAsking(false)
    }
  }

  return (
    <main className="paper-grain min-h-screen px-5 py-6 font-sans text-ink sm:px-8 lg:px-12">
      <div className="mx-auto flex min-h-[calc(100vh-3rem)] max-w-6xl flex-col overflow-hidden rounded-[2rem] border border-white/70 bg-paper/80 shadow-2xl shadow-walnut/15 backdrop-blur">
        <header className="flex flex-col gap-6 border-b border-walnut/10 px-6 py-6 sm:flex-row sm:items-center sm:justify-between sm:px-10">
          <div className="animate-float-in">
            <p className="text-sm uppercase tracking-[0.35em] text-sage">Desktop Journal</p>
            <h1 className="mt-3 font-display text-4xl font-semibold tracking-tight text-ink sm:text-5xl">
              今天也值得被记录12321
            </h1>
          </div>
          <button className="animate-float-in rounded-full bg-ink px-5 py-3 text-sm font-semibold text-paper shadow-lg shadow-ink/20 transition hover:-translate-y-0.5 hover:bg-walnut">
            写一篇新日记
          </button>
        </header>

        <section className="grid flex-1 gap-6 p-6 sm:p-10 lg:grid-cols-[0.95fr_1.4fr]">
          <aside className="animate-float-in rounded-[1.5rem] bg-ink p-6 text-paper shadow-xl shadow-ink/15">
            <p className="text-sm text-paper/60">今日提示</p>
            <h2 className="mt-5 font-display text-3xl leading-tight">把模糊的一天，写成清楚的一页。</h2>
            <div className="mt-10 grid grid-cols-3 gap-3 text-center">
              {['心情', '天气', '灵感'].map((item) => (
                <div key={item} className="rounded-2xl border border-paper/10 bg-paper/10 px-3 py-4">
                  <span className="text-xs text-paper/60">{item}</span>
                  <p className="mt-2 text-sm font-semibold">待记录</p>
                </div>
              ))}
            </div>
          </aside>

          <div className="space-y-4">
            {entries.map((entry, index) => (
              <article
                key={entry.title}
                className="animate-float-in rounded-[1.5rem] border border-walnut/10 bg-white/65 p-5 shadow-sm transition hover:-translate-y-1 hover:bg-white/85"
                style={{ animationDelay: `${120 + index * 120}ms` }}
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <span className="rounded-full bg-brass/20 px-3 py-1 text-xs font-semibold text-walnut">
                    {entry.date}
                  </span>
                  <span className="text-sm text-sage">{entry.mood}</span>
                </div>
                <h3 className="mt-5 font-display text-2xl font-semibold text-ink">{entry.title}</h3>
                <p className="mt-3 max-w-2xl text-sm leading-7 text-ink/70">{entry.excerpt}</p>
              </article>
            ))}

            <section className="animate-float-in rounded-[1.5rem] border border-ink/10 bg-white/75 p-5 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold uppercase tracking-[0.25em] text-sage">Codex SDK</p>
                  <h3 className="mt-3 font-display text-2xl font-semibold text-ink">问问本地代码助手</h3>
                  <p className="mt-2 max-w-2xl text-sm leading-7 text-ink/65">
                    这个入口会通过 Electron 主进程调用 Codex，当前使用只读沙箱，适合先验证接入是否通畅。
                  </p>
                </div>
                <span className="rounded-full bg-sage/15 px-3 py-1 text-xs font-semibold text-sage">
                  read-only
                </span>
              </div>

              <textarea
                className="mt-5 min-h-28 w-full resize-y rounded-3xl border border-walnut/10 bg-paper/70 px-4 py-3 text-sm leading-7 text-ink outline-none transition focus:border-sage focus:bg-white"
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                placeholder="输入你想让 Codex 帮忙看的问题..."
              />

              <div className="mt-4 flex flex-wrap items-center gap-3">
                <button
                  className="rounded-full bg-sage px-5 py-3 text-sm font-semibold text-paper shadow-lg shadow-sage/20 transition hover:-translate-y-0.5 hover:bg-ink disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={isAsking}
                  onClick={askCodex}
                  type="button"
                >
                  {isAsking ? 'Codex 思考中...' : '发送给 Codex'}
                </button>
                <p className="text-xs text-ink/50">首次运行可能需要等待 CLI 完成登录或初始化。</p>
              </div>

              {error ? (
                <p className="mt-4 rounded-2xl bg-red-50 px-4 py-3 text-sm leading-6 text-red-700">{error}</p>
              ) : null}

              {answer ? (
                <div className="mt-5 rounded-3xl bg-ink p-5 text-paper">
                  <p className="text-xs uppercase tracking-[0.25em] text-paper/50">Final Response</p>
                  <p className="mt-3 whitespace-pre-wrap text-sm leading-7">{answer}</p>
                </div>
              ) : null}

              {activities.length > 0 ? (
                <div className="mt-4 rounded-3xl border border-walnut/10 bg-paper/65 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.25em] text-walnut">Items</p>
                  <div className="mt-3 space-y-3">
                    {activities.map((activity) => (
                      <div key={activity.id} className="rounded-2xl bg-white/70 px-4 py-3">
                        <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-sage">
                          <span>{activity.type}</span>
                          {activity.status ? <span>status: {activity.status}</span> : null}
                          {typeof activity.exitCode === 'number' ? <span>exit: {activity.exitCode}</span> : null}
                        </div>
                        <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-ink/70">{activity.summary}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </section>
          </div>
        </section>
      </div>
    </main>
  )
}

export default App
