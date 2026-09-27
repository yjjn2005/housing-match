// ============================================================
// housing-match: 신혼부부 중심 청약·임대 자격판정 규칙 테이블
// 매년 고시 개정 시 이 파일의 수치만 교체하면 됨 (로직 불변)
// 기준연도: 2026
// ============================================================

const INCOME_TABLE = {
  2026: {
    1: 3502000,
    2: 5868000,
    3: 8175000,
    4: 8798000,
    5: 8900000,
    6: 9000000,
    7: 9100000,
    8: 9200000
  }
};
const PER_PERSON_ADDON = { 2026: 100000 }; // 8인 초과 1인당 가산 (임시값, 고시 확정 후 갱신)

function incomeThreshold(year, householdSize, percent) {
  const table = INCOME_TABLE[year];
  let base = table[Math.min(householdSize, 8)];
  if (householdSize > 8) {
    base += (householdSize - 8) * PER_PERSON_ADDON[year];
  }
  return Math.round(base * (percent / 100));
}

const ASSET_LIMITS = {
  vehicle: 45420000,
  publicRentalDefault: 345000000,   // 행복주택·매입임대·국민임대
  sinhonhuimang: 362000000,          // 신혼희망타운
  newhomeProperty: 215500000,        // 뉴:홈 부동산
  mirinaejip: 662000000              // 미리내집 총자산
};

// 트랙 정의: 각 트랙의 소득기준(percent), 자산기준, 혼인기간 요건, 무주택 요건 성격
const TRACKS = [
  {
    id: "private_sf",
    name: "민영 신혼부부 특별공급",
    category: "분양",
    marriageYears: 7,
    allowEngaged: false,
    allowNewbornOver7y: false,
    incomePriority: 100, incomeSpousePriority: 120,
    incomeGeneral: 140, incomeSpouseGeneral: 160,
    incomeLottery: 200,
    assetLimit: null, // 추첨제 자산기준 적용 시 부동산 3.31억(추첨 신청 시만 체크)
    vehicleLimit: null,
    smallCheapHouseException: true, // 무주택 특례 True 적용
    publicHousing: false
  },
  {
    id: "newhome_sf",
    name: "뉴:홈(공공분양) 신혼부부 특별공급",
    category: "분양",
    marriageYears: 7,
    allowEngaged: true,
    allowNewbornOver7y: true,
    incomePriority: 100, incomeSpousePriority: 120,
    incomeGeneral: 140, incomeSpouseGeneral: 160,
    incomeLottery: 200, // 나눔·선택형 맞벌이 최대
    assetLimit: ASSET_LIMITS.newhomeProperty,
    vehicleLimit: ASSET_LIMITS.vehicle,
    smallCheapHouseException: false,
    publicHousing: true
  },
  {
    id: "sinhonhuimang",
    name: "신혼희망타운",
    category: "분양",
    marriageYears: 7,
    allowEngaged: true,
    allowNewbornOver7y: true,
    incomePriority: null, incomeSpousePriority: null,
    incomeGeneral: 130, incomeSpouseGeneral: 200,
    incomeLottery: null,
    assetLimit: ASSET_LIMITS.sinhonhuimang,
    vehicleLimit: ASSET_LIMITS.vehicle,
    smallCheapHouseException: false,
    publicHousing: true
  },
  {
    id: "haengbok",
    name: "행복주택 (신혼부부 계층)",
    category: "임대",
    marriageYears: 7,
    allowEngaged: true,
    allowNewbornOver7y: true,
    incomePriority: 100, incomeSpousePriority: 120,
    incomeGeneral: null, incomeSpouseGeneral: null,
    incomeLottery: null,
    assetLimit: ASSET_LIMITS.publicRentalDefault,
    vehicleLimit: ASSET_LIMITS.vehicle,
    smallCheapHouseException: false,
    publicHousing: true
  },
  {
    id: "maeip1",
    name: "신혼·신생아 매입임대 Ⅰ형",
    category: "임대",
    marriageYears: 7,
    allowEngaged: true,
    allowNewbornOver7y: true,
    incomePriority: 70, incomeSpousePriority: 90,
    incomeGeneral: null, incomeSpouseGeneral: null,
    incomeLottery: null,
    assetLimit: ASSET_LIMITS.publicRentalDefault,
    vehicleLimit: ASSET_LIMITS.vehicle,
    smallCheapHouseException: false,
    publicHousing: true
  },
  {
    id: "maeip2",
    name: "신혼·신생아 매입임대 Ⅱ형",
    category: "임대",
    marriageYears: 7,
    allowEngaged: true,
    allowNewbornOver7y: true,
    incomePriority: 100, incomeSpousePriority: 120,
    incomeGeneral: 120, incomeSpouseGeneral: 140,
    incomeLottery: 200, // 전세형 완화 시
    assetLimit: ASSET_LIMITS.publicRentalDefault, // 5순위는 신희타 기준(3.62억) 별도 표기
    vehicleLimit: ASSET_LIMITS.vehicle,
    smallCheapHouseException: false,
    publicHousing: true
  },
  {
    id: "jeonse1",
    name: "신혼·신생아 전세임대 Ⅰ형",
    category: "임대",
    marriageYears: 7,
    allowEngaged: true,
    allowNewbornOver7y: true,
    incomePriority: 70, incomeSpousePriority: 90,
    incomeGeneral: null, incomeSpouseGeneral: null,
    incomeLottery: null,
    assetLimit: ASSET_LIMITS.publicRentalDefault,
    vehicleLimit: ASSET_LIMITS.vehicle,
    smallCheapHouseException: false,
    publicHousing: true
  },
  {
    id: "jeonse2",
    name: "신혼·신생아 전세임대 Ⅱ형",
    category: "임대",
    marriageYears: 7,
    allowEngaged: true,
    allowNewbornOver7y: true,
    incomePriority: 130, incomeSpousePriority: 200,
    incomeGeneral: null, incomeSpouseGeneral: null,
    incomeLottery: null,
    assetLimit: ASSET_LIMITS.sinhonhuimang,
    vehicleLimit: ASSET_LIMITS.vehicle,
    smallCheapHouseException: false,
    publicHousing: true
  },
  {
    id: "mirinaejip",
    name: "장기전세Ⅱ (서울시 미리내집)",
    category: "임대",
    marriageYears: 7,
    allowEngaged: true,
    allowNewbornOver7y: true,
    regionOnly: "서울",
    incomePriority: 120, incomeSpousePriority: 180, // 60㎡ 이하
    incomeGeneral: 150, incomeSpouseGeneral: 200,    // 60㎡ 초과
    incomeLottery: null,
    assetLimit: ASSET_LIMITS.mirinaejip,
    vehicleLimit: ASSET_LIMITS.vehicle,
    smallCheapHouseException: false,
    publicHousing: true
  }
];

// 미혼청년 특공 (비교용 별도 트랙 — 신혼부부 전환 시 자동 폐쇄 대상)
const YOUTH_TRACK = {
  id: "youth_sf",
  name: "미혼청년 특별공급",
  category: "분양",
  ageMin: 19, ageMax: 39,
  incomeGeneral: 140 // 본인 소득만 산정
};
