// 트레이너 영문 클래스 정규화 + 공식 한국어 이름
// - 한국어는 확실한 것만 넣고, 없는 것은 null (표시할 때 영문 이름으로 대체)
// - 일반 트레이너의 개인 이름은 공식 한국어가 없는 경우가 많아 영문 그대로 둠 (주요 인물만 번역)

/** 상수에서 만들어진 표기(Ace Trainer M, Pkmn Trainer Barry ...)를 원작 영문 표기로 */
export function canonClass(cls) {
  if (!cls) return cls
  let c = cls
    .replace(/^Pkmn Trainer \w+$/, 'Pokémon Trainer')
    .replace(/^Pkmn /, 'Pokémon ')
    .replace(/^#fan$/i, 'Pokéfan').replace(/^#maniac$/i, 'Pokémaniac')
    .replace(/^Pokefan\b/, 'Pokéfan').replace(/^Poké Maniac$/, 'Pokémaniac')
    .replace(/^Elite Four \w+$/, 'Elite Four')
    .replace(/^Ace Trainer( Snow)?/, 'Ace Trainer')
    .replace(/^Blackbelt$/, 'Black Belt')
    .replace(/^Sis And Bro$/, 'Sis and Bro')
    .replace(/^Belle Pa$/, 'Belle & Pa')
    .replace(/^Galactic F$/, 'Galactic')
  // 성별 접미사: 'Swimmer M' → 'Swimmer♂'
  c = c.replace(/ M$/, '♂').replace(/ F$/, '♀')
  // 4세대 원작은 Ace Trainer·Pokéfan 등에 성별 기호를 붙이지 않음
  if (/^(Ace Trainer|Pokéfan|Pokémon Breeder|Pokémon Ranger|School Kid|Psychic|Cyclist|Skier|Tuber)[♂♀]$/.test(c)) c = c.slice(0, -1)
  return c
}

const CLASS_KO = {
  'Youngster': '반바지 꼬마', 'Lass': '짧은 치마', 'Bug Catcher': '곤충채집 소년', 'Bug Maniac': '곤충 마니아',
  'Camper': '캠프 보이', 'Picnicker': '피크닉 걸', 'Hiker': '등산가', 'Sailor': '뱃사나이',
  'Fisherman': '낚시꾼', 'Fisher': '낚시꾼',
  'Swimmer': '수영팬티 소년', 'Swimmer♂': '수영팬티 소년', 'Swimmer♀': '비키니 아가씨',
  'Beauty': '아가씨', 'Psychic': '초능력자', 'Psychic♂': '초능력자', 'Psychic♀': '초능력자',
  'Gentleman': '신사', 'Super Nerd': '이과계 남자', 'Burglar': '도둑', 'Biker': '폭주족', 'Cue Ball': '빡빡이',
  'Juggler': '저글러', 'Tamer': '조련사', 'Bird Keeper': '새 조련사', 'Black Belt': '태권왕',
  'Scientist': '연구원', 'Channeler': '기도사', 'Kimono Girl': '기모노 아가씨',
  'Officer': '경찰관', 'Policeman': '경찰관', 'Schoolboy': '학원끝난아이', 'School Kid': '학원끝난아이',
  'Twins': '쌍둥이', 'Pokéfan': '애호가클럽', 'Pokéfan♂': '애호가클럽', 'Pokéfan♀': '애호가클럽',
  'Cooltrainer': '엘리트 트레이너', 'Cooltrainer♂': '엘리트 트레이너', 'Cooltrainer♀': '엘리트 트레이너',
  'Ace Trainer': '엘리트 트레이너',
  'Pokémon Trainer': '포켓몬 트레이너', 'Gym Leader': '체육관 관장', 'Leader': '체육관 관장',
  'Elite Four': '사천왕', 'Champion': '챔피언', 'Rival': '라이벌',
  'Team Rocket': '로켓단', 'Rocket': '로켓단', 'Executive': '로켓단 간부', 'Rocket Boss': '로켓단 보스', 'Boss': '로켓단 보스',
  'Team Aqua': '아쿠아단', 'Team Magma': '마그마단', 'Aqua Admin': '아쿠아단 간부', 'Magma Admin': '마그마단 간부',
  'Aqua Leader': '아쿠아단 리더', 'Magma Leader': '마그마단 리더',
  'Galactic': '갤럭시단', 'Commander': '갤럭시단 간부', 'Galactic Boss': '갤럭시단 보스',
  'Battle Girl': '배틀걸', 'Ninja Boy': '닌자 소년', 'Parasol Lady': '파라솔 아가씨', 'Aroma Lady': '아로마 아가씨',
  'Ruin Maniac': '유적 마니아', 'Hex Maniac': '오컬트 마니아', 'Dragon Tamer': '드래곤 조련사',
  'Pokémon Breeder': '포켓몬 브리더', 'Pokémon Ranger': '포켓몬 레인저', 'Rich Boy': '도련님',
  'Guitarist': '기타리스트', 'Veteran': '베테랑', 'Worker': '작업원', 'Skier': '스키어', 'Idol': '아이돌',
  'Reporter': '리포터', 'Cameraman': '카메라맨', 'Clown': '피에로', 'Waitress': '웨이트리스', 'Teacher': '선생님',
  'Painter': '화가', 'Maid': '메이드', 'Elder': '장로',
}

/** 클래스 한국어 이름 (없으면 null) */
export const classKo = (cls) => CLASS_KO[cls] ?? null

// 주요 인물의 공식 한국어 이름. 클래스가 주요 역할일 때만 적용 (같은 영문 이름의 일반 트레이너 오역 방지)
const NAME_KO = {
  // 관동
  Brock: '웅', Misty: '이슬', 'Lt. Surge': '마티스', Erika: '민화', Koga: '독수', Sabrina: '초련', Blaine: '강연',
  Giovanni: '비주기', Lorelei: '칸나', Bruno: '시바', Agatha: '국화', Lance: '목호', Blue: '그린', Red: '레드',
  Oak: '오박사', Leaf: '리프',
  // 성도
  Falkner: '비상', Bugsy: '호일', Whitney: '꼭두', Morty: '유빈', Chuck: '사도', Jasmine: '규리', Pryce: '류옹',
  Clair: '이향', Will: '일목', Karen: '카렌', Janine: '도희', Silver: '실버', Ethan: '골드',
  Archer: '아폴로', Ariana: '아테나', Proton: '랜스', Petrel: '람다',
  // 호연
  Roxanne: '원규', Brawly: '철구', Wattson: '암페어', Flannery: '민지', Norman: '종길', Winona: '은송',
  'Tate&Liza': '풍&란', Wallace: '윤진', Juan: '아단', Sidney: '혁진', Phoebe: '회연', Glacia: '미혜', Drake: '권수',
  Steven: '성호', May: '봄이', Brendan: '휘웅', Wally: '민진', Archie: '아강', Maxie: '마적',
  Matt: '해조', Shelly: '이연', Tabitha: '호걸', Courtney: '구열',
  // 신오
  Roark: '강석', Gardenia: '유채', Maylene: '자두', Fantina: '멜리사', Byron: '동관', Candice: '무청', Volkner: '전진',
  Aaron: '충호', Bertha: '들국화', Flint: '대엽', Lucian: '오엽', Cynthia: '난천', Cyrus: '태홍',
  Mars: '마스', Jupiter: '주피터', Saturn: '새턴', Barry: '용식', Lucas: '광휘', Dawn: '빛나', Riley: '현이', Cheryl: '모미',
}
const NOTABLE = /^(Gym Leader|Leader|Elite Four|Champion|Rival|Pokémon Trainer|Boss|Rocket Boss|Executive|Aqua Admin|Magma Admin|Aqua Leader|Magma Leader|Commander|Galactic Boss|Pokémon Prof)$/

/** 영문 이름 표기 정리 ('Lt.Surge' → 'Lt. Surge') */
export const canonName = (name) => name?.replace(/^Lt\.(?=\S)/, 'Lt. ') ?? name

/** 주요 인물의 한국어 이름 (없거나 일반 트레이너면 null) */
export function nameKo(name, cls, classId) {
  if (!name) return null
  if (!NOTABLE.test(cls) && !/^(RIVAL|PROF_OAK|CHAMPION)/.test(classId ?? '')) return null
  return NAME_KO[name] ?? null
}
