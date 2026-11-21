export function isLiveAnalysisEnabled() {
  return process.env.INSIGHTPILOT_ENABLE_LIVE === 'true'
}

export function isFragmentsPlaygroundEnabled() {
  return isLiveAnalysisEnabled() && process.env.ENABLE_FRAGMENTS_PLAYGROUND === 'true'
}
