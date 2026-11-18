export const FOCUS_ENTER_MS = 5200
export const FOCUS_LEAVE_MS = 4000
export const FOCUS_ATLAS_COLUMNS = 8
export const FOCUS_ATLAS_ROWS = 4
export const FOCUS_POSES = FOCUS_ATLAS_COLUMNS * FOCUS_ATLAS_ROWS
export const clamp01 = value => Math.max(0, Math.min(1, value))
const ease = value => (1 - Math.cos(Math.PI * clamp01(value))) / 2

// Separate camera / pose tracks: UI leaves before the knees start to bend.
export function focusTransitionSample(from, target, elapsed, duration) {
  const progress = clamp01(elapsed / duration)
  const entering = target > from.pose
  const delay = entering ? Math.min(800, duration * .16) : Math.min(200, duration * .05)
  const poseProgress = clamp01((elapsed - delay) / Math.min(2000, duration * .6))
  return { camera: from.camera + (target - from.camera) * ease(progress), pose: from.pose + (target - from.pose) * ease(poseProgress), done: progress === 1 }
}

export function poseBlend(pose) {
  const position = clamp01(pose) * (FOCUS_POSES - 1)
  const first = Math.floor(position), second = Math.min(FOCUS_POSES - 1, first + 1)
  return { first, second, mix: position - first }
}

export function poseAtlasPosition(frame) {
  const index = Math.max(0, Math.min(FOCUS_POSES - 1, Math.floor(frame)))
  return { x: (index % FOCUS_ATLAS_COLUMNS) * 100 / (FOCUS_ATLAS_COLUMNS - 1), y: Math.floor(index / FOCUS_ATLAS_COLUMNS) * 100 / (FOCUS_ATLAS_ROWS - 1) }
}
