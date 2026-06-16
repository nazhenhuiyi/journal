declare module 'diff3' {
  export type Diff3OkBlock = {
    ok: string[]
  }

  export type Diff3ConflictBlock = {
    conflict: {
      a: string[]
      aIndex: number
      b: string[]
      bIndex: number
      o: string[]
      oIndex: number
    }
  }

  export type Diff3Block = Diff3OkBlock | Diff3ConflictBlock

  export default function diff3Merge(
    ours: string[],
    base: string[],
    theirs: string[],
  ): Diff3Block[]
}
