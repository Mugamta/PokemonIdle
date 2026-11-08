// 아이템 설명 덮어쓰기: 원작 설명의 "조금 회복한다", "크게 올린다" 같은 애매한 표현을
// 이 게임에서 실제로 적용되는 수치로 바꿈 (loadDex 에서 items.json 의 text 를 교체)
//
// 수치는 core/battle.ts · core/items.ts · data/items.ts · data/shop.ts · stores/game.ts 의 구현과 맞춰야 함

const STATS = ['HP', '공격', '방어', '특수공격', '특수방어', '스피드'] as const

const out: Record<string, string> = {}
const set = (ids: string[], text: (id: string, i: number) => string) => ids.forEach((id, i) => (out[id] = text(id, i)))

// ---------- 회복 열매 ----------
out['oran-berry'] = '지니게 하면 HP가 1/2 이하가 됐을 때 HP를 10 회복한다. 사용하면 HP를 10 회복한다.'
out['berry-juice'] = '나무열매 100% 쥬스. HP를 20 회복한다. 지니게 하면 HP가 1/2 이하가 됐을 때 HP를 20 회복한다.'
out['sitrus-berry'] = '지니게 하면 HP가 1/2 이하가 됐을 때 최대 HP의 1/4을 회복한다. 사용하면 최대 HP의 1/4을 회복한다.'
set(['figy-berry', 'wiki-berry', 'mago-berry', 'aguav-berry', 'iapapa-berry'], () =>
  '지니게 하면 HP가 1/4 이하(먹보: 1/2 이하)가 됐을 때 최대 HP의 1/3을 회복한다. 사용하면 최대 HP의 1/3을 회복한다.',
)
out['leppa-berry'] = '지니게 하면 기술의 PP가 0이 됐을 때 그 기술의 PP를 10 회복한다. 사용하면 PP가 가장 적은 기술 1개의 PP를 10 회복한다.'
out['enigma-berry'] = '지니게 하면 효과가 굉장한 공격을 받았을 때 최대 HP의 1/4을 회복한다. 한 번 쓰면 사라진다.'

// ---------- 몬스터볼 ----------
out['great-ball'] = '몬스터볼보다 성능이 좋은 볼. 포획률 1.5배.'
out['ultra-ball'] = '슈퍼볼보다 성능이 좋은 볼. 포획률 2배.'
out['net-ball'] = '물타입·벌레타입 포켓몬의 포획률 3.5배. 그 외는 1배.'
out['dive-ball'] = '수상 스테이지에서 포획률 3.5배. 그 외는 1배.'
out['lure-ball'] = '수상 스테이지에서 포획률 4배. 그 외는 1배.'
out['nest-ball'] = '야생 포켓몬의 레벨이 낮을수록 포획률이 오른다. 포획률 (41 - 레벨) ÷ 10배 (최소 1배, 레벨 1이면 4배).'
out['repeat-ball'] = '잡은 적이 있는 포켓몬의 포획률 3.5배. 그 외는 1배.'
out['timer-ball'] = '턴이 지날수록 포획률이 오른다. 1턴마다 +0.3배 (최대 4배, 10턴째부터).'
out['dusk-ball'] = '밤에 포획률 3배. 낮에는 1배.'
out['quick-ball'] = '배틀 첫 턴에 던지면 포획률 5배. 그 이후는 1배.'
out['heal-ball'] = '잡은 포켓몬의 HP와 상태 이상을 모두 회복시키는 볼. 포획률 1배.'
out['luxury-ball'] = '잡은 포켓몬은 친밀도가 오를 때마다 1 더 오른다. 포획률 1배.'
out['level-ball'] =
  '내 포켓몬보다 상대 레벨이 낮을수록 포획률이 오른다. 내 레벨이 상대보다 높으면 2배, 2배 이상이면 4배, 4배 이상이면 8배.'
out['moon-ball'] = '달의돌로 진화하는 포켓몬의 포획률 4배. 그 외는 1배.'
out['friend-ball'] = '잡은 포켓몬의 친밀도가 150이 된다. 포획률 1배.'
out['love-ball'] = '이 게임에는 성별이 없어 포획률 보정이 없다 (1배).'
out['heavy-ball'] =
  '체중에 따라 포획률이 바뀐다. 100kg 미만: 포획률 수치 -20, 100kg 이상: ±0, 200kg 이상: +20, 300kg 이상: +30.'
out['fast-ball'] = '스피드 종족값이 100 이상인 포켓몬의 포획률 4배. 그 외는 1배.'
out['sport-ball'] = '성도지방의 곤충채집 대회에서 사용되었던 특별한 볼. 포획률 1.5배.'
out['safari-ball'] = '사파리존과 대습초원에서 사용되었던 특별한 볼. 포획률 1.5배.'
out['dream-ball'] = '잠듦 상태인 포켓몬의 포획률 4배. 그 외는 1배.'
out['beast-ball'] = '울트라비스트의 포획률 5배. 그 외의 포켓몬은 0.1배.'
out['park-ball'] = '반드시 잡을 수 있는 특별한 볼.'

// ---------- 배틀용 도구 ----------
set(['x-attack', 'x-defense', 'x-sp-atk', 'x-sp-def', 'x-speed'], (_, i) => {
  const stat = STATS[i + 1]
  return `배틀 중인 포켓몬의 ${stat} 랭크를 2단계 올린다 (+2랭크 = ${stat} 2배). 배틀이 끝나면 원래대로 돌아간다.`
})
out['x-accuracy'] = '배틀 중인 포켓몬의 명중 랭크를 2단계 올린다 (+2랭크 = 명중률 약 1.67배). 배틀이 끝나면 원래대로 돌아간다.'
out['dire-hit'] = '급소 랭크를 2단계 올린다 (급소율 1/24 → 1/2). 겹쳐 쓸 수 없다. 배틀이 끝나면 원래대로 돌아간다.'

// ---------- 육성 ----------
set(['hp-up', 'protein', 'iron', 'calcium', 'zinc', 'carbos'], (_, i) => `포켓몬의 영양 드링크. 포켓몬 1마리의 ${STATS[i]} 노력치를 10 올린다.`)
set(['health-wing', 'muscle-wing', 'resist-wing', 'genius-wing', 'clever-wing', 'swift-wing'], (_, i) =>
  `포켓몬 1마리의 ${STATS[i]} 노력치를 1 올린다.`,
)
set(['pomeg-berry', 'kelpsy-berry', 'qualot-berry', 'hondew-berry', 'grepa-berry', 'tamato-berry'], (_, i) =>
  `${STATS[i]} 노력치를 10 내린다. 친밀도가 오른다 (친밀도 0~99: +10, 100~199: +5, 200~: +2).`,
)
out['exp-candy-xs'] = '에너지가 가득한 사탕. 먹이면 포켓몬 1마리의 경험치가 100 올라간다.'
out['exp-candy-s'] = '에너지가 가득한 사탕. 먹이면 포켓몬 1마리의 경험치가 800 올라간다.'
out['exp-candy-m'] = '에너지가 가득한 사탕. 먹이면 포켓몬 1마리의 경험치가 3,000 올라간다.'
out['exp-candy-l'] = '에너지가 가득한 사탕. 먹이면 포켓몬 1마리의 경험치가 10,000 올라간다.'
out['exp-candy-xl'] = '에너지가 가득한 사탕. 먹이면 포켓몬 1마리의 경험치가 30,000 올라간다.'
out['pp-up'] = '기술 1개의 PP 최대치를 기본 PP의 20%만큼 올린다 (1단계, 최대 3단계 = +60%).'
out['pp-max'] = '기술 1개의 PP 최대치를 최고 단계까지 올린다 (기본 PP의 +60%).'

// 민트: 성격 보정 (오르는 능력 1.1배, 내려가는 능력 0.9배)
const MINTS: [string, number, number][] = [
  ['lonely', 1, 2], ['adamant', 1, 3], ['naughty', 1, 4], ['brave', 1, 5],
  ['bold', 2, 1], ['impish', 2, 3], ['lax', 2, 4], ['relaxed', 2, 5],
  ['modest', 3, 1], ['mild', 3, 2], ['rash', 3, 4], ['quiet', 3, 5],
  ['calm', 4, 1], ['gentle', 4, 2], ['careful', 4, 3], ['sassy', 4, 5],
  ['timid', 5, 1], ['hasty', 5, 2], ['jolly', 5, 3], ['naive', 5, 4],
]
for (const [n, up, down] of MINTS)
  out[`${n}-mint`] = `향기를 맡게 하면 성격 보정이 바뀌는 민트. ${STATS[up]} 1.1배, ${STATS[down]} 0.9배.`
out['serious-mint'] = '향기를 맡게 하면 성격 보정이 없어지는 민트. 모든 능력치 1배.'

// ---------- 지닌 도구: 공격 ----------
out['choice-band'] = '지니게 하면 공격이 1.5배가 되지만 처음 고른 기술밖에 쓸 수 없다.'
out['choice-specs'] = '지니게 하면 특수공격이 1.5배가 되지만 처음 고른 기술밖에 쓸 수 없다.'
out['choice-scarf'] = '지니게 하면 스피드가 1.5배가 되지만 처음 고른 기술밖에 쓸 수 없다.'
out['life-orb'] = '지니게 하면 기술의 데미지가 1.3배가 되지만, 공격할 때마다 최대 HP의 1/10이 줄어든다.'
out['expert-belt'] = '지니게 하면 효과가 굉장한 기술의 데미지가 1.2배가 된다.'
out['muscle-band'] = '지니게 하면 물리 기술의 위력이 1.1배가 된다.'
out['wise-glasses'] = '지니게 하면 특수 기술의 위력이 1.1배가 된다.'
out['punching-glove'] = '지니게 하면 펀치 기술의 위력이 1.1배가 된다.'
out['metronome'] = '같은 기술을 연속으로 쓸 때마다 데미지가 0.2배씩 올라간다 (최대 2배). 다른 기술을 쓰면 원래대로 돌아간다.'
out['scope-lens'] = '지니게 하면 급소 랭크가 1단계 올라간다 (급소율 1/24 → 1/8).'
out['razor-claw'] = '날카롭고 뾰족한 손톱. 지니게 하면 급소 랭크가 1단계 올라간다 (급소율 1/24 → 1/8).'
out['wide-lens'] = '지니게 하면 기술의 명중률이 1.1배가 된다.'
out['zoom-lens'] = '지니게 하면 상대보다 늦게 행동할 때 기술의 명중률이 1.2배가 된다.'
out['quick-claw'] = '지니게 하면 20% 확률로 같은 우선도 안에서 먼저 행동한다.'
out['kings-rock'] = '지니게 하면 데미지를 줄 때 10% 확률로 상대를 풀죽게 한다 (먼저 행동했을 때).'
out['razor-fang'] = '날카롭고 뾰족한 이빨. 지니게 하면 데미지를 줄 때 10% 확률로 상대를 풀죽게 한다 (먼저 행동했을 때).'
out['throat-spray'] = '소리 기술을 쓰면 특수공격 랭크가 1단계 올라간다. 한 번 쓰면 사라진다.'
out['blunder-policy'] = '기술이 명중률 때문에 빗나가면 스피드 랭크가 2단계 올라간다. 한 번 쓰면 사라진다.'
out['loaded-dice'] = '2~5회 연속으로 공격하는 기술이 반드시 4회 또는 5회 맞는다.'

// ---------- 지닌 도구: 방어·회복·능력 변화 ----------
out['leftovers'] = '지니게 하면 매 턴이 끝날 때 최대 HP의 1/16을 회복한다.'
out['black-sludge'] = '독타입 포켓몬은 매 턴이 끝날 때 최대 HP의 1/16을 회복한다. 그 외의 타입은 최대 HP의 1/8을 잃는다.'
out['shell-bell'] = '지니게 하면 상대에게 준 데미지의 1/8만큼 HP를 회복한다.'
out['big-root'] = '지니게 하면 HP 흡수 기술로 회복하는 HP가 1.3배가 된다.'
out['focus-sash'] = '지니게 하면 HP가 가득 찼을 때 기절할 만한 공격을 받아도 HP 1로 버틴다. 한 번 쓰면 사라진다.'
out['focus-band'] = '지니게 하면 기절할 만한 공격을 받아도 10% 확률로 HP 1로 버틴다.'
out['eviolite'] = '지니게 하면 진화할 수 있는 포켓몬의 방어와 특수방어가 1.5배가 된다.'
out['assault-vest'] = '지니게 하면 특수방어가 1.5배가 되지만 변화 기술을 쓸 수 없게 된다.'
out['rocky-helmet'] = '접촉 기술을 받으면 공격한 상대에게 그 상대의 최대 HP의 1/6만큼 데미지를 준다.'
out['bright-powder'] = '반짝반짝 빛나는 가루. 지니게 하면 상대 기술의 명중률이 0.9배가 된다.'
out['lax-incense'] = '이상한 향기의 향로. 지니게 하면 상대 기술의 명중률이 0.9배가 된다.'
out['white-herb'] = '능력 랭크가 떨어지면 떨어진 랭크를 모두 0으로 되돌린다. 한 번 쓰면 사라진다.'
out['weakness-policy'] = '효과가 굉장한 공격을 받으면 공격과 특수공격 랭크가 각각 2단계 올라간다. 한 번 쓰면 사라진다.'
out['adrenaline-orb'] = '상대의 위협 특성을 받으면 스피드 랭크가 1단계 올라간다. 한 번 쓰면 사라진다.'
out['absorb-bulb'] = '물타입 기술을 받으면 특수공격 랭크가 1단계 올라간다. 한 번 쓰면 사라진다.'
out['cell-battery'] = '전기타입 기술을 받으면 공격 랭크가 1단계 올라간다. 한 번 쓰면 사라진다.'
out['snowball'] = '얼음타입 기술을 받으면 공격 랭크가 1단계 올라간다. 한 번 쓰면 사라진다.'
out['luminous-moss'] = '물타입 기술을 받으면 특수방어 랭크가 1단계 올라간다. 한 번 쓰면 사라진다.'
out['covert-cloak'] = '상대 기술의 부가 효과(상태 이상·풀죽음·능력 하락 등)를 받지 않는다.'
out['ability-shield'] = '특성이 다른 특성에 의해 무시되거나 바뀌지 않는다.'
out['clear-amulet'] = '상대에 의해 능력 랭크가 떨어지지 않는다.'

// ---------- 타입 강화 (1.2배) · 주얼 (1.3배) ----------
const TYPE_KO: Record<string, string> = {
  normal: '노말', fighting: '격투', flying: '비행', poison: '독', ground: '땅', rock: '바위', bug: '벌레', ghost: '고스트',
  steel: '강철', fire: '불꽃', water: '물', grass: '풀', electric: '전기', psychic: '에스퍼', ice: '얼음', dragon: '드래곤',
  dark: '악', fairy: '페어리',
}
const TYPE_ITEMS: Record<string, string[]> = {
  normal: ['silk-scarf'],
  fighting: ['black-belt', 'fist-plate'],
  flying: ['sharp-beak', 'sky-plate'],
  poison: ['poison-barb', 'toxic-plate'],
  ground: ['soft-sand', 'earth-plate'],
  rock: ['hard-stone', 'rock-incense', 'stone-plate'],
  bug: ['silver-powder', 'insect-plate'],
  ghost: ['spell-tag', 'spooky-plate'],
  steel: ['metal-coat', 'iron-plate'],
  fire: ['charcoal', 'flame-plate'],
  water: ['mystic-water', 'sea-incense', 'wave-incense', 'splash-plate'],
  grass: ['miracle-seed', 'rose-incense', 'meadow-plate'],
  electric: ['magnet', 'zap-plate'],
  psychic: ['twisted-spoon', 'odd-incense', 'mind-plate'],
  ice: ['never-melt-ice', 'icicle-plate'],
  dragon: ['dragon-fang', 'draco-plate'],
  dark: ['black-glasses', 'dread-plate'],
  fairy: ['fairy-feather', 'pixie-plate'],
}
for (const [type, ids] of Object.entries(TYPE_ITEMS))
  for (const id of ids) out[id] = `지니게 하면 ${TYPE_KO[type]}타입 기술의 위력이 1.2배가 된다.`
for (const type of Object.keys(TYPE_KO))
  out[`${type}-gem`] = `${TYPE_KO[type]}타입의 주얼. 지니게 하면 ${TYPE_KO[type]}타입 기술의 위력이 한 번만 1.3배가 된다.`

// ---------- 나무열매 (반감·핀치) ----------
const RESIST: Record<string, string> = {
  'occa-berry': 'fire', 'passho-berry': 'water', 'wacan-berry': 'electric', 'rindo-berry': 'grass', 'yache-berry': 'ice',
  'chople-berry': 'fighting', 'kebia-berry': 'poison', 'shuca-berry': 'ground', 'coba-berry': 'flying',
  'payapa-berry': 'psychic', 'tanga-berry': 'bug', 'charti-berry': 'rock', 'kasib-berry': 'ghost', 'haban-berry': 'dragon',
  'colbur-berry': 'dark', 'babiri-berry': 'steel', 'roseli-berry': 'fairy',
}
for (const [id, type] of Object.entries(RESIST))
  out[id] = `지니게 하면 효과가 굉장한 ${TYPE_KO[type]}타입 기술의 데미지가 한 번만 절반이 된다.`
out['chilan-berry'] = '지니게 하면 노말타입 기술의 데미지가 한 번만 절반이 된다.'
const PINCH = '지니게 하면 HP가 1/4 이하(먹보: 1/2 이하)가 됐을 때'
set(['liechi-berry', 'ganlon-berry', 'petaya-berry', 'apicot-berry', 'salac-berry'], (_, i) =>
  `${PINCH} ${STATS[i + 1]} 랭크가 1단계 올라간다.`,
)
out['lansat-berry'] = `${PINCH} 급소 랭크가 2단계 올라간다.`
out['starf-berry'] = `${PINCH} 공격·방어·특수공격·특수방어·스피드 중 하나의 랭크가 2단계 올라간다.`
out['micle-berry'] = `${PINCH} 다음 기술 1번의 명중률이 1.2배가 된다.`
out['custap-berry'] = '지니게 하면 HP가 1/4 이하(먹보: 1/2 이하)인 상태로 턴이 시작될 때 한 번, 같은 우선도 안에서 먼저 행동한다.'
out['kee-berry'] = '지니게 하면 물리 기술을 받았을 때 방어 랭크가 1단계 올라간다.'
out['maranga-berry'] = '지니게 하면 특수 기술을 받았을 때 특수방어 랭크가 1단계 올라간다.'
out['jaboca-berry'] = '지니게 하면 물리 기술을 받았을 때 공격한 상대에게 그 상대의 최대 HP의 1/8만큼 데미지를 준다.'
out['rowap-berry'] = '지니게 하면 특수 기술을 받았을 때 공격한 상대에게 그 상대의 최대 HP의 1/8만큼 데미지를 준다.'

// ---------- 전용 도구 ----------
out['light-ball'] = '피카츄에게 지니게 하면 공격과 특수공격이 2배가 되는 이상한 구슬.'
out['thick-club'] = '탕구리 혹은 텅구리에게 지니게 하면 공격이 2배가 된다.'
out['stick'] = '파오리·창파나이트에게 지니게 하면 급소 랭크가 2단계 올라간다 (급소율 1/24 → 1/2).'
out['lucky-punch'] = '럭키에게 지니게 하면 급소 랭크가 2단계 올라간다 (급소율 1/24 → 1/2).'
out['metal-powder'] = '메타몽에게 지니게 하면 방어가 2배가 되는 이상한 가루.'
out['quick-powder'] = '메타몽에게 지니게 하면 스피드가 2배가 되는 이상한 가루.'
out['deep-sea-tooth'] = '진주몽에게 지니게 하면 특수공격이 2배가 되는 이빨.'
out['deep-sea-scale'] = '진주몽에게 지니게 하면 특수방어가 2배가 되는 비늘.'
out['adamant-orb'] = '디아루가에게 지니게 하면 드래곤·강철타입 기술의 위력이 1.2배가 되는 구슬.'
out['lustrous-orb'] = '펄기아에게 지니게 하면 드래곤·물타입 기술의 위력이 1.2배가 되는 구슬.'
out['griseous-orb'] = '기라티나에게 지니게 하면 드래곤·고스트타입 기술의 위력이 1.2배가 되는 구슬.'
out['soul-dew'] = '라티오스나 라티아스에게 지니게 하면 에스퍼·드래곤타입 기술의 위력이 1.2배가 되는 구슬.'

// ---------- 불리한 효과 ----------
out['iron-ball'] = '지니게 하면 스피드가 절반이 된다. 비행타입이나 부유 특성 포켓몬도 땅타입 기술에 맞는다.'
out['lagging-tail'] = '매우 무거운 꼬리. 지니게 하면 같은 우선도 안에서 항상 나중에 행동한다.'
out['full-incense'] = '이상한 향기의 향로. 지니게 하면 같은 우선도 안에서 항상 나중에 행동한다.'
out['sticky-barb'] = '지니게 하면 매 턴이 끝날 때 최대 HP의 1/8을 잃는다.'

// ---------- 경험치·돈·친밀도·노력치 ----------
out['macho-brace'] = '지니게 하면 스피드가 절반이 되지만, 전투로 얻는 노력치가 2배가 된다.'
set(['power-weight', 'power-bracer', 'power-belt', 'power-lens', 'power-band', 'power-anklet'], (_, i) =>
  `지니게 하면 스피드가 절반이 되지만, 전투로 얻는 ${STATS[i]} 노력치가 8 더 오른다.`,
)
out['soothe-bell'] = '기분 좋은 소리의 방울. 지니게 하면 친밀도가 오를 때 오르는 양이 1.5배가 된다.'
out['lucky-egg'] = '행복이 가득한 알. 지니게 하면 받는 경험치가 1.5배가 된다.'
out['exp-share'] = '켜 두면 배틀에 나가지 않은 파티 포켓몬도 경험치의 50%를 받는다.'

export const ITEM_TEXT: Readonly<Record<string, string>> = out
