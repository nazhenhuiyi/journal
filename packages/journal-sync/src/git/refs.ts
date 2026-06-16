export function getBranchName(branch: string) {
  return branch.startsWith('refs/heads/') ? branch.slice('refs/heads/'.length) : branch
}

export function getLocalBranchRef(branch: string) {
  return `refs/heads/${getBranchName(branch)}`
}

export function getRemoteBranchRef(branch: string) {
  return `refs/heads/${getBranchName(branch)}`
}

export function getRemoteTrackingBranchRef(remote: string, branch: string) {
  return `refs/remotes/${remote}/${getBranchName(branch)}`
}
