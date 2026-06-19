import type { ReviewSourceDay } from '@journal/core'
import {
  refreshJournalWidgetSnapshot,
} from './journalWidgetSnapshotStore'
import {
  type LoadDailyReviewResult,
  type SaveDailyJournalResult,
} from './mobileJournalStore'
import { mobileSyncManager } from './sync/mobileSyncManager'

export type JournalSavedReason =
  | 'add-murmur'
  | 'auto-save'
  | 'background-flush'
  | 'date-rollover'
  | 'front-matter'
  | 'import-image'
  | 'sync'

type RefreshInput = {
  currentDay?: ReviewSourceDay
  date: string
}

type RefreshOptions = {
  shouldMarkReviewForSync?: boolean
  updateNativeWidgets?: boolean
}

class JournalEffectsCoordinator {
  private queue: Promise<void> = Promise.resolve()

  afterDateRollover(input: {
    date: string
    previousDate: string
  }) {
    void input.previousDate

    return this.enqueueRefresh({
      date: input.date,
    })
  }

  afterJournalSaved(input: {
    reason: JournalSavedReason
    record: SaveDailyJournalResult
    scheduleSync: boolean
  }) {
    void input.reason

    if (input.scheduleSync) {
      markSavedRecordForSync(input.record)
    }

    return this.enqueueRefresh({
      currentDay: savedRecordToSourceDay(input.record),
      date: input.record.date,
    })
  }

  afterJournalSavedForSync(input: {
    reason: JournalSavedReason
    record: SaveDailyJournalResult
  }) {
    void input.reason

    return this.enqueueRefresh({
      currentDay: savedRecordToSourceDay(input.record),
      date: input.record.date,
    }, {
      shouldMarkReviewForSync: false,
    })
  }

  afterRemoteUpdatesApplied(input: {
    date: string
  }) {
    return this.enqueueRefresh({
      date: input.date,
    })
  }

  afterReviewLoaded(input: {
    currentDay: ReviewSourceDay
    date: string
    result: LoadDailyReviewResult
  }) {
    markReviewResultForSync(input.result)

    return this.enqueueRefresh({
      currentDay: input.currentDay,
      date: input.date,
    })
  }

  refreshForAppActive(input: RefreshInput) {
    return this.enqueueRefresh(input)
  }

  refreshForWidgetUpdate(input: {
    date: string
  }) {
    return this.enqueueRefresh({
      date: input.date,
    }, {
      shouldMarkReviewForSync: false,
      updateNativeWidgets: false,
    })
  }

  private enqueueRefresh(
    input: RefreshInput,
    options: RefreshOptions = {},
  ) {
    return this.enqueue(async () => {
      const result = await refreshJournalWidgetSnapshot(input, {
        updateNativeWidgets: options.updateNativeWidgets,
      })
      const shouldMarkReviewForSync = options.shouldMarkReviewForSync ?? true

      if (shouldMarkReviewForSync) {
        markReviewResultForSync(result.reviewResult)
      }

      return result
    })
  }

  private enqueue<T>(task: () => Promise<T>) {
    const queuedTask = this.queue.then(task)

    this.queue = queuedTask
      .then(() => undefined)
      .catch((error) => {
        console.error(error)
      })

    return queuedTask
  }
}

export const journalEffects = new JournalEffectsCoordinator()

function savedRecordToSourceDay(record: SaveDailyJournalResult): ReviewSourceDay {
  return {
    date: record.date,
    frontMatter: record.frontMatter,
    longEntryMarkdown: record.longEntryMarkdown,
    murmurs: record.murmurs,
  }
}

function markSavedRecordForSync(result: {
  changedPaths: string[]
  didWrite: boolean
}) {
  if (result.didWrite) {
    mobileSyncManager.markLocalSave(result.changedPaths)
  }
}

function markReviewResultForSync(result: LoadDailyReviewResult) {
  if (result.didWrite) {
    mobileSyncManager.markLocalSave(result.changedPaths)
  }
}
