// 버전별 지방(스테이지 묶음) 정의 — fetch-encounters.mjs / build-encounters.mjs 공용
//
// - 스토리가 같은 버전 쌍(적·녹, 금·은 ...)과 피카츄판은 한 지방으로 묶고 출현표를 섞음 (버전별 평균)
// - 스토리가 달라진 마이너 버전(크리스탈·에메랄드·플라티나)과 리메이크는 별도 지방
// - stages: 스토리 진행 순서. [스테이지 이름, PokeAPI location slug(들)]
//   한국어 이름이 없는 장소(한국 미발매 작품 전용 장소)는 영문판 이름 그대로
//   `// 확인필요` = 공식 한국어 표기 확인 안 됨
// - 출현 데이터(PokeAPI)가 있는 1~4세대 작품만 여기서 정의. 나머지 지방은 src/data/stages.ts 에서 이름만 나열

const r = (n) => [`${n}번도로`, n >= 19 && n <= 21 ? `kanto-sea-route-${n}` : `kanto-route-${n}`]
const kr = (...ns) => ns.map(r)
const jr = (...ns) => ns.map((n) => [`${n}번도로`, n === 40 || n === 41 ? `johto-sea-route-${n}` : `johto-route-${n}`])
const hr = (...ns) => ns.map((n) => [`${n}번${WATER_HOENN.has(n) ? '수로' : '도로'}`, `hoenn-route-${n}`])
const sr = (...ns) => ns.map((n) => [`${n}번${[220, 223, 226, 230].includes(n) ? '수로' : '도로'}`, `sinnoh-${[220, 223, 226, 230].includes(n) ? 'sea-' : ''}route-${n}`])
const WATER_HOENN = new Set([105, 106, 107, 108, 109, 122, 124, 125, 126, 127, 128, 129, 130, 131, 132, 133, 134])

// ---------- 관동 ----------
const KANTO_MAIN = [
  ...kr(1, 22, 2),
  ['상록숲', 'viridian-forest'],
  ...kr(3),
  ['달맞이산', 'mt-moon'],
  ...kr(4, 24, 25, 5, 6, 11),
  ['디그다의 굴', 'digletts-cave'],
  ...kr(9, 10),
  ['돌산터널', 'rock-tunnel'],
  ...kr(8, 7),
  ['포켓몬타워', 'pokemon-tower'],
  ...kr(12, 13, 14, 15),
  ['사파리존', 'kanto-safari-zone'],
  ...kr(16, 17, 18, 19, 20),
  ['쌍둥이섬', 'seafoam-islands'],
  ['포켓몬저택', 'pokemon-mansion'],
  ...kr(21),
  ['무인발전소', 'kanto-power-plant'],
  ...kr(23),
  ['챔피언로드', 'kanto-victory-road-2'],
]
const CERULEAN_CAVE = ['블루시티동굴', 'cerulean-cave']

// 파이어레드·리프그린 나나섬 (한국 미발매 → 영문 이름)
const SEVII_STORY = [
  ['Kindle Road', 'kindle-road'],
  ['Treasure Beach', 'treasure-beach'],
  ['Mt. Ember', 'mt-ember'],
  ['Cape Brink', 'cape-brink'],
  ['Bond Bridge', 'bond-bridge'],
  ['Berry Forest', 'berry-forest'],
]
const SEVII_POST = [
  ['Icefall Cave', 'icefall-cave'],
  ['Five Isle Meadow', 'five-isle-meadow'],
  ['Memorial Pillar', 'memorial-pillar'],
  ['Water Labyrinth', 'water-labyrinth'],
  ['Resort Gorgeous', 'resort-gorgeous'],
  ['Lost Cave', 'lost-cave'],
  ['Outcast Island', 'outcast-island'],
  ['Green Path', 'green-path'],
  ['Water Path', 'water-path'],
  ['Ruin Valley', 'ruin-valley'],
  ['Pattern Bush', 'pattern-bush'],
  ['Canyon Entrance', 'canyon-entrance'],
  ['Sevault Canyon', 'sevault-canyon'],
  ['Tanoby Ruins', 'tanoby-ruins'],
]

// ---------- 성도 (+ 엔딩 후 관동) ----------
const johto = ({ hgss = false } = {}) => [
  ...jr(29, 46, 30, 31),
  ['어둠의 동굴', 'dark-cave'],
  ['모다피의탑', 'sprout-tower'], // 확인필요
  ...jr(32),
  ['알프의 유적', 'ruins-of-alph'],
  ['연결동굴', 'union-cave'],
  ...jr(33),
  ['야돈의우물', 'slowpoke-well'], // 확인필요
  ['너도밤나무숲', 'ilex-forest'],
  ...jr(34, 35),
  ['자연공원', 'national-park'],
  ...jr(36, 37),
  ['불탄탑', 'burned-tower'],
  ...jr(38, 39, 40, 41),
  ['소용돌이섬', 'whirl-islands'], // 확인필요
  ...jr(42),
  ['절구산', 'mt-mortar'], // 확인필요
  ...jr(43),
  ['분노의호수', 'lake-of-rage'], // 확인필요
  ...jr(44),
  ['얼음샛길', 'ice-path'],
  ['용의 굴', 'dragons-den'],
  ...jr(45),
  ...(hgss ? [...jr(47, 48), ['사파리존 (성도)', 'johto-safari-zone']] : []),
  ...kr(27, 26),
  ['챔피언로드', 'kanto-victory-road-1'],
  ['방울탑', 'bell-tower'],
  // 엔딩 후 관동
  ...kr(6, 5, 7, 8),
  ['무인발전소', 'kanto-power-plant'],
  ...kr(9, 10),
  ['돌산터널', 'rock-tunnel'],
  ...kr(24, 25, 4),
  ['달맞이산', 'mt-moon'],
  ...kr(3, 2),
  ...(hgss ? [['상록숲', 'viridian-forest']] : []),
  ...kr(22, 1),
  ['디그다의 굴', 'digletts-cave'],
  ...kr(11, 12, 13, 14, 15, 16, 17, 18, 19, 20),
  ...(hgss ? [['쌍둥이섬', 'seafoam-islands']] : []),
  ...kr(21),
  ...(hgss ? [CERULEAN_CAVE] : []),
  ...kr(28),
  ['은빛산', 'mt-silver'],
]

// ---------- 호연 ----------
const hoenn = ({ emerald = false } = {}) => [
  ...hr(101, 103, 102, 104),
  ['등화숲', 'petalburg-woods'],
  ...hr(116),
  ['금잔터널', 'rusturf-tunnel'],
  ...hr(105, 106),
  ['바위 동굴', 'granite-cave'],
  ...hr(107, 108),
  ['버려진배', 'abandoned-ship'],
  ...hr(109, 110, 117, 111),
  ...(emerald ? [['신기루탑', 'mirage-tower']] : []),
  ...hr(112),
  ['불꽃샛길', 'fiery-path'],
  ...hr(113, 114),
  ['유성의 폭포', 'meteor-falls'],
  ['울퉁불퉁 산길', 'jagged-pass'],
  ...hr(115, 118),
  ['뉴보라', 'new-mauville'],
  ...hr(119, 120, 121),
  ['사파리존', 'hoenn-safari-zone'],
  ['송화산', 'mt-pyre'],
  ...hr(122, 123, 124, 125),
  ['여울의 동굴', 'shoal-cave'],
  ...hr(126, 127, 128),
  ['해저동굴', 'seafloor-cavern'],
  ['각성의 사당', 'cave-of-origin'],
  ...hr(129, 130, 131),
  ['하늘기둥', 'sky-pillar'],
  ...hr(132, 133, 134),
  ['챔피언로드', 'hoenn-victory-road'],
  ...(emerald ? [['사막의 지하도', 'desert-underpass'], ['아틀리에의 동굴', 'artisan-cave']] : []),
]

// ---------- 신오 ----------
const sinnoh = ({ platinum = false } = {}) => [
  ...sr(201, 202, 203),
  ['무쇠게이트', 'oreburgh-gate'],
  ['무쇠탄갱', 'oreburgh-mine'],
  ...sr(204),
  ['골짜기 발전소', 'valley-windworks'],
  ...sr(205),
  ['골풀무제철소', 'fuego-ironworks'],
  ['영원의숲', 'eterna-forest'],
  ['꽃향기의 꽃밭', 'floaroma-meadow'],
  ...sr(211, 206),
  ['험한 샛길', 'ravaged-path'],
  ['미혹의 동굴', 'wayward-cave'],
  ...sr(207),
  ['천관산', 'mt-coronet'],
  ...sr(208, 209),
  ['로스트타워', 'lost-tower'],
  ['신수유적', 'solaceon-ruins'],
  ...sr(210, 215, 214),
  ['마니아터널', ['maniac-tunnel', 'ruin-maniac-cave']],
  ...sr(213),
  ...sr(212),
  ['자랑의 뒷마당', 'trophy-garden'],
  ['숲의 양옥집', 'old-chateau'],
  ['대습초원', 'great-marsh'],
  ...sr(218),
  ['강철섬', 'iron-island'],
  ['입지호수', 'lake-valor'],
  ['입지호수근처', 'valor-lakefront'],
  ['진실호수', 'lake-verity'],
  ...sr(216, 217),
  ['예지호수근처', 'acuity-lakefront'],
  ['예지호수', 'lake-acuity'],
  ['선단신전', 'snowpoint-temple'],
  ['창기둥', 'spear-pillar'],
  ...(platinum ? [['깨어진 세계', 'distortion-world']] : []),
  ...sr(219, 220, 221, 222, 223),
  ['챔피언로드', 'sinnoh-victory-road'],
  ...sr(224),
  ['꽃의 낙원', 'flower-paradise'],
  ['신월섬', 'newmoon-island'],
  ['리조트에리어', 'resort-area'],
  ...sr(225, 226, 227),
  ['하드마운틴', 'stark-mountain'],
  ...sr(228, 229, 230),
  ['귀혼동굴', 'turnback-cave'],
  ['송별의 샘', 'sendoff-spring'],
]

/**
 * key: 지방 key (src/data/stages.ts 와 같아야 함)
 * versions: PokeAPI version (출현표를 섞을 버전), vg: 야생 포켓몬 기술 배치 기준 버전 그룹
 */
export const GROUPS = [
  { key: 'kanto-rby', versions: ['red', 'blue', 'yellow'], vg: 'red-blue', stages: [...KANTO_MAIN, CERULEAN_CAVE] },
  { key: 'johto-gs', versions: ['gold', 'silver'], vg: 'gold-silver', stages: johto() },
  { key: 'johto-c', versions: ['crystal'], vg: 'crystal', stages: johto() },
  { key: 'hoenn-rs', versions: ['ruby', 'sapphire'], vg: 'ruby-sapphire', stages: hoenn() },
  { key: 'hoenn-e', versions: ['emerald'], vg: 'emerald', stages: hoenn({ emerald: true }) },
  {
    key: 'kanto-frlg', versions: ['firered', 'leafgreen'], vg: 'firered-leafgreen',
    stages: [...KANTO_MAIN.slice(0, KANTO_MAIN.findIndex(([n]) => n === '무인발전소')), ...SEVII_STORY, ...KANTO_MAIN.slice(KANTO_MAIN.findIndex(([n]) => n === '무인발전소')), CERULEAN_CAVE, ...SEVII_POST],
  },
  { key: 'sinnoh-dp', versions: ['diamond', 'pearl'], vg: 'diamond-pearl', stages: sinnoh() },
  { key: 'sinnoh-pt', versions: ['platinum'], vg: 'platinum', stages: sinnoh({ platinum: true }) },
  { key: 'johto-hgss', versions: ['heartgold', 'soulsilver'], vg: 'heartgold-soulsilver', stages: johto({ hgss: true }) },
]
