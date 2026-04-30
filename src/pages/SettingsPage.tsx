import { useEffect, useState } from 'react'
import SegmentedControl from '../components/SegmentedControl'
import { brand } from '../brand'

type CodexReasoningEffort = 'minimal' | 'low' | 'medium' | 'high' | 'xhigh'

type CodexSettingsForm = {
  model: string
  modelReasoningEffort: CodexReasoningEffort
  systemPrompt: string
  weatherLocation: string
}

type CodexSettingsFile = CodexSettingsForm & {
  workingDirectory: string
  directory: string
  settingsPath: string
  systemPromptPath: string
  journalSettingsPath: string
}

const modelOptions = ['gpt-5.5', 'gpt-5.4', 'gpt-5.4-mini', 'gpt-5.3-codex'] as const
const reasoningOptions: Array<{ value: CodexReasoningEffort; label: string }> = [
  { value: 'minimal', label: '轻' },
  { value: 'low', label: '低' },
  { value: 'medium', label: '中' },
  { value: 'high', label: '高' },
  { value: 'xhigh', label: '极高' },
]

const emptySettings: CodexSettingsFile = {
  model: 'gpt-5.5',
  modelReasoningEffort: 'high',
  systemPrompt: '',
  weatherLocation: '',
  workingDirectory: '~/.journal',
  directory: '~/.journal/codex',
  settingsPath: '~/.journal/codex/settings.json',
  systemPromptPath: '~/.journal/codex/system-prompt.md',
  journalSettingsPath: '~/.journal/settings.json',
}

function getCodexSettingsStore() {
  return typeof window === 'undefined' ? undefined : window.codexSettings
}

function getJournalSettingsStore() {
  return typeof window === 'undefined' ? undefined : window.journalSettings
}

function SettingsPage() {
  const [settings, setSettings] = useState<CodexSettingsFile>(emptySettings)
  const [status, setStatus] = useState<'loading' | 'ready' | 'saving' | 'saved' | 'error'>('loading')
  const [message, setMessage] = useState('正在取出页边设置')
  const selectedModel = modelOptions.includes(settings.model as (typeof modelOptions)[number])
    ? settings.model
    : 'custom'

  useEffect(() => {
    let isMounted = true
    const store = getCodexSettingsStore()

    if (!store) {
      Promise.resolve().then(() => {
        if (!isMounted) {
          return
        }

        setStatus('error')
        setMessage('当前环境还读不到页边设置。')
      })
      return
    }

    Promise.all([
      store.load(),
      getJournalSettingsStore()?.load().catch(() => null) ?? Promise.resolve(null),
    ])
      .then(([loadedSettings, loadedJournalSettings]) => {
        if (!isMounted) {
          return
        }

        setSettings({
          ...loadedSettings,
          weatherLocation: loadedJournalSettings?.weatherLocation ?? '',
          journalSettingsPath: loadedJournalSettings?.settingsPath ?? emptySettings.journalSettingsPath,
        })
        setStatus('ready')
        setMessage('已翻到设置')
      })
      .catch((error: unknown) => {
        if (!isMounted) {
          return
        }

        setStatus('error')
        setMessage(formatSettingsError(error, '设置暂时没有读到，请重试。'))
      })

    return () => {
      isMounted = false
    }
  }, [])

  async function handleSave() {
    const store = getCodexSettingsStore()
    const journalSettingsStore = getJournalSettingsStore()
    const model = settings.model.trim()
    const systemPrompt = settings.systemPrompt.trim()
    const weatherLocation = settings.weatherLocation.trim()

    if (!store) {
      setStatus('error')
      setMessage('当前环境还不能收好设置。')
      return
    }

    if (!model || /[\r\n]/.test(model)) {
      setStatus('error')
      setMessage('模型名称不能为空，也不能包含换行。')
      return
    }

    if (!systemPrompt) {
      setStatus('error')
      setMessage('页边分寸不能为空。')
      return
    }

    if (/[\r\n]/.test(weatherLocation)) {
      setStatus('error')
      setMessage('天气位置不能包含换行。')
      return
    }

    setStatus('saving')
    setMessage('正在收好')

    try {
      const [savedSettings, savedJournalSettings] = await Promise.all([
        store.save({
          model,
          modelReasoningEffort: settings.modelReasoningEffort,
          systemPrompt,
        }),
        journalSettingsStore?.save({ weatherLocation }) ?? Promise.resolve(null),
      ])

      setSettings({
        ...savedSettings,
        weatherLocation: savedJournalSettings?.weatherLocation ?? weatherLocation,
        journalSettingsPath: savedJournalSettings?.settingsPath ?? settings.journalSettingsPath,
      })
      setStatus('saved')
      setMessage(`已收好，下一次${brand.assistantName}回应会照这份分寸来`)
    } catch (error) {
      setStatus('error')
      setMessage(formatSettingsError(error, '设置暂时没有收好，请重试。'))
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-[rgba(255,250,240,0.42)]">
      <header className="journal-topbar flex min-h-14 items-center justify-between gap-4 px-8 py-3">
        <div>
          <h1 className="m-0 font-display text-[1.4rem] font-semibold text-ink">
            {brand.assistantName}设置
          </h1>
          <p className="m-0 mt-1 text-[0.82rem] text-[rgba(47,38,31,0.54)]">
            调整页边批注的分寸
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div
            className="text-[0.82rem] text-[rgba(47,38,31,0.56)]"
            role="status"
          >
            {message}
          </div>
          <button
            className="h-10 rounded-[8px] border border-[rgba(20,114,79,0.24)] bg-[#14724f] px-5 text-[0.92rem] font-semibold text-[#fffdf4] shadow-[0_10px_24px_rgba(20,114,79,0.14)] transition-[background-color,transform] duration-200 hover:bg-[#105d41] disabled:cursor-not-allowed disabled:opacity-60"
            disabled={status === 'loading' || status === 'saving'}
            onClick={handleSave}
            type="button"
          >
            {status === 'saving' ? '收好中' : '收好'}
          </button>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-auto px-8 py-7">
        <section className="mx-auto flex w-full max-w-[980px] flex-col gap-6">
          <div className="grid grid-cols-[8rem_minmax(0,1fr)] items-center gap-3 rounded-[8px] border border-[rgba(122,79,50,0.12)] bg-[rgba(255,253,244,0.52)] px-4 py-3 text-[0.88rem]">
            <span className="font-semibold text-[rgba(47,38,31,0.68)]">数据位置</span>
            <span
              className="truncate text-[rgba(47,38,31,0.58)]"
              title={settings.workingDirectory}
            >
              {settings.workingDirectory}
            </span>
          </div>

          <label className="grid grid-cols-[8rem_minmax(0,1fr)] items-center gap-3 rounded-[8px] border border-[rgba(122,79,50,0.12)] bg-[rgba(255,253,244,0.52)] px-4 py-3 text-[0.88rem]">
            <span className="font-semibold text-[rgba(47,38,31,0.68)]">天气位置</span>
            <input
              aria-label="天气位置"
              className="h-10 min-w-0 rounded-[8px] border border-[rgba(122,79,50,0.18)] bg-[rgba(255,253,244,0.78)] px-3 text-[0.92rem] text-ink outline-none focus:border-[rgba(20,114,79,0.45)]"
              onChange={(event) =>
                setSettings((currentSettings) => ({
                  ...currentSettings,
                  weatherLocation: event.target.value,
                }))
              }
              placeholder="上海 / Shanghai / 31.2304,121.4737"
              value={settings.weatherLocation}
            />
          </label>

          <div className="grid grid-cols-[minmax(0,1fr)_24rem] gap-6">
            <label className="flex flex-col gap-2">
              <span className="text-[0.86rem] font-semibold text-[rgba(47,38,31,0.7)]">
                回应模型
              </span>
              <div className="grid grid-cols-[13rem_minmax(0,1fr)] gap-3">
                <select
                  className="h-10 rounded-[8px] border border-[rgba(122,79,50,0.18)] bg-[rgba(255,253,244,0.78)] px-3 text-[0.92rem] text-ink outline-none focus:border-[rgba(20,114,79,0.45)]"
                  onChange={(event) => {
                    const value = event.target.value

                    if (value !== 'custom') {
                      setSettings((currentSettings) => ({ ...currentSettings, model: value }))
                    }
                  }}
                  value={selectedModel}
                >
                  {modelOptions.map((model) => (
                    <option key={model} value={model}>
                      {model}
                    </option>
                  ))}
                  <option value="custom">自定义</option>
                </select>
                <input
                  className="h-10 rounded-[8px] border border-[rgba(122,79,50,0.18)] bg-[rgba(255,253,244,0.78)] px-3 text-[0.92rem] text-ink outline-none focus:border-[rgba(20,114,79,0.45)]"
                  onChange={(event) =>
                    setSettings((currentSettings) => ({
                      ...currentSettings,
                      model: event.target.value,
                    }))
                  }
                  placeholder="模型名"
                  value={settings.model}
                />
              </div>
            </label>

            <div className="flex flex-col gap-2">
              <span className="text-[0.86rem] font-semibold text-[rgba(47,38,31,0.7)]">
                思考深度
              </span>
              <div className="inline-flex w-fit rounded-[10px] border border-[rgba(122,79,50,0.12)] bg-[rgba(255,253,244,0.68)] p-1">
                <SegmentedControl
                  ariaLabel="思考深度"
                  onChange={(modelReasoningEffort) =>
                    setSettings((currentSettings) => ({
                      ...currentSettings,
                      modelReasoningEffort,
                    }))
                  }
                  options={reasoningOptions}
                  value={settings.modelReasoningEffort}
                />
              </div>
            </div>
          </div>

          <label className="flex min-h-0 flex-1 flex-col gap-2">
            <span className="text-[0.86rem] font-semibold text-[rgba(47,38,31,0.7)]">
              页边分寸
            </span>
            <textarea
              className="min-h-[25rem] resize-none rounded-[8px] border border-[rgba(122,79,50,0.14)] bg-[rgba(255,253,244,0.72)] p-4 font-sans text-[0.96rem] leading-7 text-ink outline-none shadow-[0_14px_38px_rgba(122,79,50,0.06)] focus:border-[rgba(20,114,79,0.38)]"
              onChange={(event) =>
                setSettings((currentSettings) => ({
                  ...currentSettings,
                  systemPrompt: event.target.value,
                }))
              }
              value={settings.systemPrompt}
            />
          </label>

          <details className="w-fit text-[0.8rem] text-[rgba(47,38,31,0.52)]">
            <summary className="cursor-pointer select-none rounded-[7px] px-1 py-1 text-[rgba(47,38,31,0.58)] outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[rgba(111,126,99,0.28)]">
              本地位置
            </summary>
            <dl className="m-0 mt-2 grid min-w-[42rem] gap-1 rounded-[8px] border border-[rgba(122,79,50,0.1)] bg-[rgba(255,253,244,0.52)] px-3 py-2">
              <div className="grid grid-cols-[7rem_minmax(0,1fr)] gap-2">
                <dt>数据位置</dt>
                <dd className="m-0 truncate" title={settings.workingDirectory}>
                  {settings.workingDirectory}
                </dd>
              </div>
              <div className="grid grid-cols-[7rem_minmax(0,1fr)] gap-2">
                <dt>目录</dt>
                <dd className="m-0 truncate" title={settings.directory}>
                  {settings.directory}
                </dd>
              </div>
              <div className="grid grid-cols-[7rem_minmax(0,1fr)] gap-2">
                <dt>设置文件</dt>
                <dd className="m-0 truncate" title={settings.settingsPath}>
                  {settings.settingsPath}
                </dd>
              </div>
              <div className="grid grid-cols-[7rem_minmax(0,1fr)] gap-2">
                <dt>偏好文件</dt>
                <dd className="m-0 truncate" title={settings.journalSettingsPath}>
                  {settings.journalSettingsPath}
                </dd>
              </div>
              <div className="grid grid-cols-[7rem_minmax(0,1fr)] gap-2">
                <dt>Prompt 文件</dt>
                <dd className="m-0 truncate" title={settings.systemPromptPath}>
                  {settings.systemPromptPath}
                </dd>
              </div>
            </dl>
          </details>
        </section>
      </div>
    </div>
  )
}

export default SettingsPage

function formatSettingsError(error: unknown, fallback: string) {
  if (!(error instanceof Error)) {
    return fallback
  }

  if (
    error.message.includes('模型名称不能为空') ||
    error.message.includes('推理强度不正确') ||
    error.message.includes('天气位置不能包含换行') ||
    error.message.includes('提示词不能为空') ||
    error.message.includes('System prompt 不能为空')
  ) {
    return error.message.replace('System prompt', '页边分寸').replace('提示词', '页边分寸')
  }

  return fallback
}
