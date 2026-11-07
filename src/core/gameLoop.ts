// 경과 시간(delta) 기반 게임 루프. 백그라운드 탭에서 interval이 느려져도 계산이 어긋나지 않음.
export type TickFn = (deltaMs: number) => void

export function startGameLoop(tick: TickFn, intervalMs = 100): () => void {
  let last = Date.now()
  const id = setInterval(() => {
    const now = Date.now()
    tick(now - last)
    last = now
  }, intervalMs)
  return () => clearInterval(id)
}
