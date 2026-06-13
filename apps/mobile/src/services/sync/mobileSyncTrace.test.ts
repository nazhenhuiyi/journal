import { describe, expect, it, vi } from 'vitest'
import {
  createMobileGitHttpTraceDetails,
  createMobileSyncTrace,
} from './mobileSyncTrace'

describe('mobile sync trace adapter', () => {
  it('keeps mobile sync trace disabled in tests', () => {
    expect(createMobileSyncTrace([vi.fn()])).toBeUndefined()
  })

  it('summarizes git HTTP requests without carrying headers or body data', () => {
    expect(createMobileGitHttpTraceDetails({
      method: 'POST',
      url: 'https://github.com/example/journal.git/git-receive-pack?token=secret',
    }, 200)).toEqual({
      host: 'github.com',
      method: 'POST',
      service: 'git-receive-pack',
      statusCode: 200,
    })
  })

  it('uses the git service query parameter when present', () => {
    expect(createMobileGitHttpTraceDetails({
      url: 'https://github.com/example/journal.git/info/refs?service=git-upload-pack',
    })).toEqual({
      host: 'github.com',
      method: 'GET',
      service: 'git-upload-pack',
      statusCode: null,
    })
  })
})
