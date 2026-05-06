import { AnimatePresence, motion } from 'motion/react'
import { Undo } from '../../components/HandDrawnIcons'
import { annotationKinds, listTransition, panelTransition } from './constants'
import type { Annotation, LinePosition } from '../../domain/annotations'
import { brand } from '../../brand'

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
  isGenerationAvailable: boolean
  isLauncherVisible: boolean
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
  isGenerationAvailable,
  isLauncherVisible,
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
  if (!isGenerationAvailable && !isOpen) {
    return null
  }

  if (!isOpen && !isLauncherVisible) {
    return null
  }

  if (!isOpen) {
    return (
      <motion.button
        animate={{ opacity: 1, y: 0 }}
        className="fixed bottom-6 right-6 z-40 h-12 rounded-full border border-sage/30 bg-ink px-5 text-sm font-semibold text-white shadow-lg shadow-ink/15 transition hover:bg-walnut focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sage"
        initial={{ opacity: 0, y: 12 }}
        onClick={onGenerate}
        title={`让${brand.assistantName}读一遍`}
        transition={panelTransition}
        type="button"
      >
        {brand.assistantLabel}
      </motion.button>
    )
  }

  return (
    <motion.aside
      animate={{ opacity: 1, y: 0 }}
      className={`fixed bottom-6 right-6 z-40 flex max-h-[calc(100vh-6rem)] flex-col overflow-hidden border border-walnut/15 bg-[#fcfaf4] shadow-2xl shadow-ink/15 ${
        mode === 'chat' ? 'w-[560px]' : 'w-[430px]'
      }`}
      initial={{ opacity: 0, y: 18 }}
      transition={panelTransition}
    >
      <div
        className={`items-center border-b border-walnut/10 px-4 py-2.5 ${
          mode === 'chat' ? 'grid grid-cols-[2rem_1fr_2rem] gap-3' : 'flex justify-between gap-3'
        }`}
      >
        {mode === 'chat' ? (
          <>
            <button
              aria-label={`返回${brand.assistantLabel}`}
              className="flex h-8 w-8 items-center justify-center text-ink/45 transition hover:text-ink/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sage"
              onClick={onCloseChat}
              title={`返回${brand.assistantLabel}`}
              type="button"
            >
              <Undo aria-hidden="true" size={18} strokeWidth={2.1} />
            </button>
            <h2 className="justify-self-center font-display text-base font-semibold text-ink">
              沿着这句聊
            </h2>
            <span aria-hidden="true" />
          </>
        ) : (
          <>
            <h2 className="font-display text-base font-semibold text-ink/88">{brand.assistantLabel}</h2>
            <button
              aria-label={`收起${brand.assistantName}`}
              className="flex h-8 w-8 items-center justify-center text-ink/40 transition hover:text-ink/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sage"
              onClick={onOpen}
              title={`收起${brand.assistantName}`}
              type="button"
            >
              <Undo aria-hidden="true" size={15} strokeWidth={2.1} />
            </button>
          </>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
        {error ? (
          <p className="mb-3 border border-red-200 bg-red-50 px-3 py-2 text-sm leading-6 text-red-700">{error}</p>
        ) : null}

        {mode === 'chat' && activeAnnotation ? (
          <ChatPanel
            annotation={activeAnnotation}
            chatInput={chatInput}
            chatMessages={chatMessages}
            chatStatus={chatStatus}
            onSendChat={onSendChat}
            onUpdateChatInput={onUpdateChatInput}
          />
        ) : (
          <DraftPanel
            drafts={drafts}
            isGenerating={mode === 'generating'}
            onAcceptDraft={onAcceptDraft}
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
  isGenerating: boolean
  onAcceptDraft: (draftId: string) => void
  onIgnoreDraft: (draftId: string) => void
  onUpdateDraftContent: (draftId: string, content: string) => void
}

function DraftPanel({
  drafts,
  isGenerating,
  onAcceptDraft,
  onIgnoreDraft,
  onUpdateDraftContent,
}: DraftPanelProps) {
  return (
    <div>
      {drafts.length > 0 ? (
        <motion.div animate="visible" className="space-y-4" initial="hidden">
          <AnimatePresence initial={false}>
            {drafts.map((draft) => (
              <motion.article
                key={draft.id}
                animate={{ opacity: 1, y: 0 }}
                className="group relative rounded-[6px] border border-walnut/10 bg-white px-4 py-3.5 shadow-sm shadow-walnut/5 transition hover:border-walnut/20"
                exit={{ opacity: 0, y: 6 }}
                initial={{ opacity: 0, y: 8 }}
                transition={listTransition}
              >
                <div className="mb-2 flex min-h-8 items-center justify-between gap-3">
                  <span className="text-[0.72rem] font-semibold tracking-wide text-sage">
                    {annotationKinds[draft.annotation.kind]}
                  </span>
                  <div className="pointer-events-none flex gap-1.5 opacity-0 transition group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100">
                    <button
                      className="rounded-[4px] border border-walnut/10 bg-white/90 px-2.5 py-1.5 text-xs font-semibold text-ink/55 shadow-sm shadow-walnut/5 transition hover:border-walnut/30 hover:bg-walnut/5 hover:text-ink"
                      onClick={() => onIgnoreDraft(draft.id)}
                      type="button"
                    >
                      忽略
                    </button>
                    <button
                      className="rounded-[4px] border border-sage/30 bg-[#f4f7ef] px-2.5 py-1.5 text-xs font-semibold text-ink shadow-sm shadow-sage/5 transition hover:border-sage hover:bg-sage/15"
                      onClick={() => onAcceptDraft(draft.id)}
                      type="button"
                    >
                      接受
                    </button>
                  </div>
                </div>
                <div className="space-y-2">
                  {draft.matchStatus === 'anchored' ? (
                    <AnnotationSource annotation={draft.annotation} className="mt-0" variant="compact" />
                  ) : null}
                  <textarea
                    aria-label="批注草稿"
                    className="min-h-20 w-full resize-none rounded-[4px] border border-transparent bg-[#fffdf8] px-3 py-2.5 text-[0.9rem] leading-7 text-ink outline-none transition focus:border-sage/50 focus:bg-white"
                    onChange={(event) => onUpdateDraftContent(draft.id, event.target.value)}
                    value={draft.annotation.body.content}
                  />
                </div>
              </motion.article>
            ))}
          </AnimatePresence>
        </motion.div>
      ) : isGenerating ? (
        <AiPanelLoadingState />
      ) : null}
    </div>
  )
}

function AiPanelLoadingState() {
  return (
    <div
      aria-live="polite"
      className="flex items-center gap-2 px-1 py-2 text-sm leading-6 text-ink/48"
      role="status"
    >
      <motion.span
        animate={{ opacity: [0.28, 0.9, 0.28] }}
        className="h-1.5 w-1.5 rounded-full bg-sage/65"
        transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
      />
      <span>页边在读，稍等一下。</span>
    </div>
  )
}

type ChatPanelProps = {
  annotation: Annotation
  chatInput: string
  chatMessages: AiPanelMessage[]
  chatStatus: 'idle' | 'loading' | 'sending'
  onSendChat: () => void
  onUpdateChatInput: (value: string) => void
}

function ChatPanel({
  annotation,
  chatInput,
  chatMessages,
  chatStatus,
  onSendChat,
  onUpdateChatInput,
}: ChatPanelProps) {
  return (
    <div>
      <div className="border border-sage/15 bg-[#f7f6ee] px-4 py-4 shadow-sm shadow-walnut/5">
        <span className="text-[0.68rem] font-semibold text-sage">{annotationKinds[annotation.kind]}</span>
        <p className="mt-2 text-sm leading-6 text-ink/70">{annotation.body.content}</p>
        <AnnotationSource annotation={annotation} />
      </div>

      <div className="mt-5 space-y-3">
        {chatStatus === 'loading' && chatMessages.length === 0 ? (
          <p className="border border-walnut/10 bg-white px-3 py-2 text-sm leading-6 text-ink/55">
            正在翻回之前的对话...
          </p>
        ) : null}

        {chatMessages.map((message) => {
          const isUser = message.role === 'user'

          return (
            <div key={message.id} className={`flex ${isUser ? 'justify-end pl-14' : 'justify-start pr-14'}`}>
              <div
                className={`max-w-[82%] rounded-md border px-3 py-2 text-sm leading-6 shadow-sm ${
                  isUser
                    ? 'border-walnut/15 bg-white text-ink shadow-walnut/5'
                    : 'border-sage/25 bg-[#f7f5ea] text-ink/75 shadow-sage/5'
                }`}
              >
                <p className={`mb-1 text-[0.68rem] font-semibold ${isUser ? 'text-walnut/70' : 'text-sage'}`}>
                  {isUser ? '你' : brand.assistantName}
                </p>
                <p>{message.content}</p>
              </div>
            </div>
          )
        })}
      </div>

      <form
        className="mt-4"
        onSubmit={(event) => {
          event.preventDefault()
          onSendChat()
        }}
      >
        <textarea
          aria-label={`继续聊${brand.assistantLabel}`}
          className="min-h-24 w-full resize-none border border-walnut/10 bg-white px-3 py-2 text-sm leading-6 text-ink outline-none transition focus:border-sage"
          disabled={chatStatus === 'loading'}
          onChange={(event) => onUpdateChatInput(event.target.value)}
          placeholder="沿着这句页边话继续问..."
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

function AnnotationSource({
  annotation,
  className = 'mt-4',
  variant = 'default',
}: {
  annotation: Annotation
  className?: string
  variant?: 'default' | 'compact'
}) {
  const source = getAnnotationSource(annotation)
  const quoteClassName =
    variant === 'compact'
      ? 'relative max-h-20 overflow-y-auto whitespace-pre-wrap rounded-[4px] bg-[#f8f5ec] px-3 py-2 text-[0.78rem] leading-5 text-ink/58'
      : 'relative max-h-28 overflow-y-auto whitespace-pre-wrap border border-walnut/5 bg-[#f9f7ef] px-4 py-3 text-sm leading-6 text-ink/60'
  const quoteMarkClassName =
    variant === 'compact'
      ? 'pointer-events-none absolute left-2.5 top-2 font-display text-2xl leading-none text-walnut/10'
      : 'pointer-events-none absolute left-3 top-2 font-display text-3xl leading-none text-walnut/10'

  return (
    <div className={className}>
      <blockquote
        aria-label="批注原文"
        className={quoteClassName}
      >
        <span className={quoteMarkClassName}>
          “
        </span>
        <span className="mb-1 flex items-center justify-between gap-3 pl-5 text-[0.66rem] leading-none">
          <span className="font-semibold text-walnut/45">{variant === 'compact' ? '原文' : '摘自原文'}</span>
          <span className="shrink-0 text-ink/40">{source.location}</span>
        </span>
        <span className="block pl-5">{source.quote}</span>
      </blockquote>
    </div>
  )
}

function getAnnotationSource(annotation: Annotation) {
  if (annotation.target.type !== 'longEntryRange') {
    return {
      location: '整篇日记',
      quote: '这句话是在看完整篇日记之后留在页边的。',
    }
  }

  const { selector } = annotation.target

  return {
    location: formatLinePosition(selector.linePosition),
    quote: selector.sourceQuote.exact || selector.plainQuote.exact,
  }
}

function formatLinePosition(linePosition: LinePosition) {
  const { startLine, endLine } = linePosition

  return startLine === endLine ? `第 ${startLine} 行` : `第 ${startLine}-${endLine} 行`
}

export default FloatingAiPanel
