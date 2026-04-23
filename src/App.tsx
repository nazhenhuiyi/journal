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

function App() {
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
          </div>
        </section>
      </div>
    </main>
  )
}

export default App
