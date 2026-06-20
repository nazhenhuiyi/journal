const unavailable = () => {
  throw new Error('Node file and network loading is unavailable in React Native.')
}

module.exports = {
  close: unavailable,
  get: unavailable,
  open: unavailable,
  read: unavailable,
  stat: unavailable,
}
