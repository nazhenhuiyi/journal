import { AnimatePresence, motion } from 'motion/react'
import { annotationKinds, listTransition, panelTransition } from './constants'
import type { Annotation } from '../../domain/annotations'

export type AiPanelDraft = {
  id: string
  annotation: Annotation
  matchStatus: 'anchored' | 'day'
}

export type AiPanelMessage = {
  id: string
  role: 'user' | 'assistant'
  content: string
}

type FloatingAiPanelProps = {
  activeAnnotation: Annotation | null
  chatInput: string
  chatMessages: AiPanelMessage[]
  chatStatus: 'idle' | 'loading' | 'sending'
  drafts: AiPanelDraft[]
  error: string
  isOpen: boolean
  mode: 'idle' | 'generating' | 'drafts' | 'chat'
  onAcceptDraft: (draftId: string) => void
  onCloseChat: () => void
  onGenerate: () => void
  onIgnoreDraft: (draftId: string) => void
  onOpen: () => void
  onSendChat: () => void
  onUpdateChatInput: (value: string) => void
  onUpdateDraftContent: (draftId: string, content: string) => void
}

function FloatingAiPanel({
  activeAnnotation,
  chatInput,
  chatMessages,
  chatStatus,
  drafts,
  error,
  isOpen,
  mode,
  onAcceptDraft,
  onCloseChat,
  onGenerate,
  onIgnoreDraft,
  onOpen,
  onSendChat,
  onUpdateChatInput,
  onUpdateDraftContent,
}: FloatingAiPanelProps) {
  if (!isOpen) {
    return (
      <motion.button
        animate={{ opacity: 1, y: 0 }}
        className="fixed bottom-6 right-6 z-40 h-12 rounded-full border border-sage/30 bg-ink px-5 text-sm font-semibold text-white shadow-lg shadow-ink/15 transition hover:bg-walnut focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sage"
        initial={{ opacity: 0, y: 12 }}
        onClick={onOpen}
        title="打开 AI 批注"
        transition={panelTransition}
        type="button"
      >
        AI 批注
      </motion.button>
    )
  }

  return (
    <motion.aside
      animate={{ opacity: 1, y: 0 }}
      className="fixed bottom-6 right-6 z-40 flex max-h-[calc(100vh-6rem)] w-[390px] flex-col overflow-hidden border border-walnut/15 bg-[#fffdf7] shadow-2xl shadow-ink/15"
      initial={{ opacity: 0, y: 18 }}
      transition={panelTransition}
    >
      <div className="flex items-center justify-between border-b border-walnut/10 px-4 py-3">
        <div>
          <p className="text-xs font-semibold uppercase text-sage">Codex</p>
          <h2 className="font-display text-lg font-semibold text-ink">
            {mode === 'chat' ? '深入聊批注' : 'AI 批注'}
          </h2>
        </div>
        <button
          className="h-8 w-8 border border-walnut/10 text-sm font-semibold text-ink/60 transition hover:border-walnut/30 hover:text-ink"
          onClick={onOpen}
          title="收起 AI 面板"
          type="button"
        >
          -
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {error ? (
          <p className="mb-3 border border-red-200 bg-red-50 px-3 py-2 text-sm leading-6 text-red-700">{error}</p>
        ) : null}

        {mode === 'chat' && activeAnnotation ? (
          <ChatPanel
            annotation={activeAnnotation}
            chatInput={chatInput}
            chatMessages={chatMessages}
            chatStatus={chatStatus}
            onCloseChat={onCloseChat}
            onSendChat={onSendChat}
            onUpdateChatInput={onUpdateChatInput}
          />
        ) : (
          <DraftPanel
            drafts={drafts}
            mode={mode}
            onAcceptDraft={onAcceptDraft}
            onGenerate={onGenerate}
            onIgnoreDraft={onIgnoreDraft}
            onUpdateDraftContent={onUpdateDraftContent}
          />
        )}
      </div>
    </motion.aside>
  )
}

type DraftPanelProps = {
  drafts: AiPanelDraft[]
  mode: FloatingAiPanelProps['mode']
  onAcceptDraft: (draftId: string) => void
  onGenerate: () => void
  onIgnoreDraft: (draftId: string) => void
  onUpdateDraftContent: (draftId: string, content: string) => void
}

function DraftPanel({
  drafts,
  mode,
  onAcceptDraft,
  onGenerate,
  onIgnoreDraft,
  onUpdateDraftContent,
}: DraftPanelProps) {
  return (
    <div>
      <button
        className="w-full border border-sage/30 bg-sage/10 px-4 py-3 text-sm font-semibold text-ink transition hover:border-sage hover:bg-sage/15 disabled:cursor-wait disabled:opacity-60"
        disabled={mode === 'generating'}
        onClick={onGenerate}
        type="button"
      >
        {mode === 'generating' ? '正在生成批注...' : '生成今日批注'}
      </button>

      {drafts.length > 0 ? (
        <motion.div animate="visible" className="mt-4 space-y-3" initial="hidden">
          <AnimatePresence initial={false}>
            {drafts.map((draft) => (
              <motion.article
                key={draft.id}
                animate={{ opacity: 1, y: 0 }}
                className="border border-walnut/10 bg-white px-3 py-3"
                exit={{ opacity: 0, y: 6 }}
                initial={{ opacity: 0, y: 8 }}
                transition={listTransition}
              >
                <div className="mb-2 flex items-center justify-between gap-3">
                  <span className="text-xs font-semibold text-sage">
                    {annotationKinds[draft.annotation.kind]}
                  </span>
                  <span className="text-xs text-ink/45">
                    {draft.matchStatus === 'anchored' ? '已定位原文' : '整天批注'}
                  </span>
                </div>
                <textarea
                  aria-label="批注草稿"
                  className="min-h-24 w-full resize-none border border-walnut/10 bg-[#fffdf7] px-3 py-2 text-sm leading-6 text-ink outline-none transition focus:border-sage"
                  onChange={(event) => onUpdateDraftContent(draft.id, event.target.value)}
                  value={draft.annotation.body.content}
                />
                <div className="mt-3 flex justify-end gap-2">
                  <button
                    className="border border-walnut/10 px-3 py-1.5 text-xs font-semibold text-ink/60 transition hover:border-walnut/30 hover:text-ink"
                    onClick={() => onIgnoreDraft(draft.id)}
                    type="button"
                  >
                    忽略
                  </button>
                  <button
                    className="border border-sage/30 bg-sage/10 px-3 py-1.5 text-xs font-semibold text-ink transition hover:border-sage hover:bg-sage/15"
                    onClick={() => onAcceptDraft(draft.id)}
                    type="button"
                  >
                    接受
                  </button>
                </div>
              </motion.article>
            ))}
          </AnimatePresence>
        </motion.div>
      ) : (
        <p className="mt-4 text-sm leading-6 text-ink/55">
          会按内置的温和配置读取今天的长日记，生成观察和追问类批注草稿。
        </p>
      )}
    </div>
  )
}

type ChatPanelProps = {
  annotation: Annotation
  chatInput: string
  chatMessages: AiPanelMessage[]
  chatStatus: 'idle' | 'loading' | 'sending'
  onCloseChat: () => void
  onSendChat: () => void
  onUpdateChatInput: (value: string) => void
}

function ChatPanel({
  annotation,
  chatInput,
  chatMessages,
  chatStatus,
  onCloseChat,
  onSendChat,
  onUpdateChatInput,
}: ChatPanelProps) {
  return (
    <div>
      <button
        className="mb-3 text-xs font-semibold text-walnut underline decoration-walnut/30 underline-offset-4 transition hover:text-ink"
        onClick={onCloseChat}
        type="button"
      >
        返回批注生成
      </button>
      <div className="border border-sage/20 bg-sage/10 px-3 py-3">
        <span className="text-xs font-semibold text-sage">{annotationKinds[annotation.kind]}</span>
        <p className="mt-2 text-sm leading-6 text-ink/75">{annotation.body.content}</p>
      </div>

      <div className="mt-4 space-y-3">
        {chatStatus === 'loading' && chatMessages.length === 0 ? (
          <p className="border border-walnut/10 bg-white px-3 py-2 text-sm leading-6 text-ink/55">
            正在找回之前的聊天...
          </p>
        ) : null}

        {chatMessages.map((message) => (
          <div
            key={message.id}
            className={`border px-3 py-2 text-sm leading-6 ${
              message.role === 'user'
                ? 'border-walnut/10 bg-white text-ink'
                : 'border-sage/20 bg-[#f7f5ea] text-ink/75'
            }`}
          >
            {message.content}
          </div>
        ))}
      </div>

      <form
        className="mt-4"
        onSubmit={(event) => {
          event.preventDefault()
          onSendChat()
        }}
      >
        <textarea
          aria-label="继续聊批注"
          className="min-h-24 w-full resize-none border border-walnut/10 bg-white px-3 py-2 text-sm leading-6 text-ink outline-none transition focus:border-sage"
          disabled={chatStatus === 'loading'}
          onChange={(event) => onUpdateChatInput(event.target.value)}
          placeholder="围绕这条批注继续问..."
          value={chatInput}
        />
        <button
          className="mt-2 w-full border border-ink/15 bg-ink px-4 py-2 text-sm font-semibold text-white transition hover:bg-walnut disabled:cursor-wait disabled:opacity-60"
          disabled={chatStatus !== 'idle' || !chatInput.trim()}
          type="submit"
        >
          {chatStatus === 'loading' ? '正在加载...' : chatStatus === 'sending' ? '正在回复...' : '发送'}
        </button>
      </form>
    </div>
  )
}

export default FloatingAiPanel
