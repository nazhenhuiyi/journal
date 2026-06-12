export function getMergeDriverContents(contents: readonly unknown[]) {
  return {
    base: contents.length >= 3 ? getMergeDriverContent(contents, 0) : '',
    ours: contents.length >= 3
      ? getMergeDriverContent(contents, 1)
      : getMergeDriverContent(contents, 0),
    theirs: contents.length >= 3
      ? getMergeDriverContent(contents, 2)
      : getMergeDriverContent(contents, 1),
  }
}

function getMergeDriverContent(contents: readonly unknown[], index: number) {
  const content = contents[index]

  return typeof content === 'string' ? content : ''
}
