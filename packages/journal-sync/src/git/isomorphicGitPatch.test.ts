import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import zlib from 'node:zlib'
import * as git from 'isomorphic-git'
import { afterEach, describe, expect, it } from 'vitest'

const tempDirectories: string[] = []

describe('isomorphic-git dependency patch', () => {
  afterEach(() => {
    for (const directory of tempDirectories.splice(0)) {
      fs.rmSync(directory, { force: true, recursive: true })
    }
  })

  it('stores already-compressed large blobs with fast deflate in loose objects and packs', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'journal-isogit-patch-'))
    tempDirectories.push(directory)
    await git.init({ dir: directory, fs })

    const blob = Buffer.alloc(300 * 1024)

    blob.write('RIFF', 0, 'ascii')
    blob.write('WEBP', 8, 'ascii')

    const oid = await git.writeBlob({
      blob,
      dir: directory,
      fs,
    })
    const looseObject = fs.readFileSync(path.join(
      directory,
      '.git',
      'objects',
      oid.slice(0, 2),
      oid.slice(2),
    ))
    const inflatedLooseObject = zlib.inflateSync(looseObject)
    const packed = await git.packObjects({
      dir: directory,
      fs,
      oids: [oid],
    })

    expect(inflatedLooseObject.subarray(-blob.byteLength)).toEqual(blob)
    expect(looseObject.byteLength).toBeGreaterThan(blob.byteLength * 0.9)
    expect(packed.packfile?.byteLength).toBeGreaterThan(blob.byteLength * 0.9)
  })
})
