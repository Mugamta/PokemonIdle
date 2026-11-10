// 기술 부가효과 설명
// 기술 설명 데이터가 따로 없으므로: 직접 쓴 설명(MOVE_DESC) → 없으면 전투 데이터(MoveExtra)로 자동 생성
import { battleData, STATUS_LABELS, type StageKey } from './battle'

/** 직접 작성한 설명 (전투 데이터에 없거나 자동 문구로 부족한 기술) */
const MOVE_DESC: Record<string, string> = {
  'spirit-shackle': '공격과 함께 상대의 그림자를 꿰매 도망치거나 교체할 수 없게 한다. (고스트 타입 제외)',
  'drum-beating': '100% 확률로 상대의 스피드를 1랭크 떨어뜨린다.',
  'pyro-ball': '10% 확률로 상대를 화상 상태로 만든다. 자신이 얼어 있으면 녹이고 공격한다.',
  // 이 게임에는 벽·순풍·압정 같은 필드 효과가 없어 실제 전투에서는 아무 일도 일어나지 않음
  'court-change': '자신과 상대 필드의 효과(벽·순풍·압정 등)를 서로 맞바꾼다. (이 게임에는 필드 효과가 없어 효과 없음)',
  'snipe-shot': '급소에 맞기 쉽다. 공격을 끌어당기는 기술·특성의 영향을 받지 않는다.',
  'flower-trick': '반드시 맞고, 반드시 급소에 맞는다.',
  'torch-song': '100% 확률로 자신의 특수공격을 1랭크 올린다.',
  'aqua-step': '100% 확률로 자신의 스피드를 1랭크 올린다.',
}

const STAGE_KO: Record<StageKey | 'hp', string> = {
  hp: 'HP',
  atk: '공격',
  def: '방어',
  spa: '특수공격',
  spd: '특수방어',
  spe: '스피드',
  acc: '명중률',
  eva: '회피율',
}

/** 부가효과 설명. 없으면 빈 문자열 */
export function moveEffectText(moveId: string, moveNum: number | string): string {
  if (MOVE_DESC[moveId]) return MOVE_DESC[moveId]
  const x = battleData.value?.moves[moveNum]
  if (!x) return ''
  const parts: string[] = []
  const pct = (c?: number) => (c && c < 100 ? `${c}% 확률로 ` : '')
  if (x.pri) parts.push(`우선도 ${x.pri > 0 ? '+' : ''}${x.pri}.`)
  if (x.crit) parts.push('급소에 맞기 쉽다.')
  if (x.hits) parts.push(x.hits[0] === x.hits[1] ? `${x.hits[0]}번 연속 공격한다.` : `${x.hits[0]}~${x.hits[1]}번 연속 공격한다.`)
  if (x.ail) parts.push(`${pct(x.ailChance)}상대를 ${STATUS_LABELS[x.ail]} 상태로 만든다.`)
  if (x.stats?.length) {
    const who = x.self ? '자신의' : '상대의'
    const list = x.stats.map(([k, n]) => `${STAGE_KO[k]} ${n > 0 ? '+' : ''}${n}`).join(', ')
    parts.push(`${pct(x.chance)}${who} ${list}랭크.`)
  }
  if (x.drain && x.drain > 0) parts.push(`준 데미지의 ${x.drain}%만큼 회복한다.`)
  if (x.drain && x.drain < 0) parts.push(`준 데미지의 ${-x.drain}%만큼 반동을 받는다.`)
  if (x.heal) parts.push(`최대 HP의 ${x.heal}%를 회복한다.`)
  if (x.fixed) parts.push(x.fixed === 'level' ? '레벨만큼 고정 데미지.' : x.fixed === 'half' ? '상대 HP를 절반으로 만든다.' : `${x.fixed} 고정 데미지.`)
  return parts.join(' ')
}
