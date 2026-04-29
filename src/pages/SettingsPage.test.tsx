import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import SettingsPage from './SettingsPage'

const loadedSettings = {
  version: 1 as const,
  model: 'gpt-5.5',
  modelReasoningEffort: 'high' as const,
  systemPrompt: '默认日记助手 prompt',
  directory: '/Users/zilin/.journal/codex',
  settingsPath: '/Users/zilin/.journal/codex/settings.json',
  systemPromptPath: '/Users/zilin/.journal/codex/system-prompt.md',
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('SettingsPage', () => {
  it('loads and displays the current Codex settings', async () => {
    vi.stubGlobal('codexSettings', {
      load: vi.fn().mockResolvedValue(loadedSettings),
      save: vi.fn(),
    })

    render(<SettingsPage />)

    await screen.findByText('已载入')

    expect(screen.getByRole('combobox')).toHaveValue('gpt-5.5')
    expect(screen.getByPlaceholderText('输入模型名')).toHaveValue('gpt-5.5')
    expect(screen.getByLabelText('提示词')).toHaveValue('默认日记助手 prompt')
    expect(screen.getByText('/Users/zilin/.journal/codex/settings.json')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '高' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('saves preset model, custom model, reasoning effort, and prompt edits', async () => {
    const save = vi.fn().mockImplementation((payload: Parameters<NonNullable<Window['codexSettings']>['save']>[0]) =>
      Promise.resolve({
        ...loadedSettings,
        ...payload,
      }),
    )

    vi.stubGlobal('codexSettings', {
      load: vi.fn().mockResolvedValue(loadedSettings),
      save,
    })

    render(<SettingsPage />)

    await screen.findByText('已载入')

    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'gpt-5.4-mini' } })
    fireEvent.change(screen.getByPlaceholderText('输入模型名'), {
      target: { value: 'future-model' },
    })
    fireEvent.click(screen.getByRole('button', { name: '中' }))
    fireEvent.change(screen.getByLabelText('提示词'), {
      target: { value: '新的 prompt' },
    })
    fireEvent.click(screen.getByRole('button', { name: '保存' }))

    await waitFor(() => {
      expect(save).toHaveBeenCalledWith({
        model: 'future-model',
        modelReasoningEffort: 'medium',
        systemPrompt: '新的 prompt',
      })
    })
    expect(await screen.findByText('已保存，下一次回应会使用这份设置')).toBeInTheDocument()
  })

  it('shows validation errors and does not save empty fields', async () => {
    const save = vi.fn()

    vi.stubGlobal('codexSettings', {
      load: vi.fn().mockResolvedValue(loadedSettings),
      save,
    })

    render(<SettingsPage />)

    await screen.findByText('已载入')

    fireEvent.change(screen.getByPlaceholderText('输入模型名'), { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: '保存' }))

    expect(await screen.findByText('模型名称不能为空，也不能包含换行。')).toBeInTheDocument()
    expect(save).not.toHaveBeenCalled()

    fireEvent.change(screen.getByPlaceholderText('输入模型名'), { target: { value: 'gpt-5.5' } })
    fireEvent.change(screen.getByLabelText('提示词'), { target: { value: '   ' } })
    fireEvent.click(screen.getByRole('button', { name: '保存' }))

    expect(await screen.findByText('提示词不能为空。')).toBeInTheDocument()
    expect(save).not.toHaveBeenCalled()
  })
})
