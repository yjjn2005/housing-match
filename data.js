// ============================================================
// housing-match: 신혼부부 중심 청약·임대 자격판정 규칙 테이블
// 매년 고시 개정 시 이 파일의 수치만 교체하면 됨 (로직 불변)
// 기준연도: 2026
// ============================================================

const APP_UPDATED = "2026-09-27";

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

// 소형·저가주택 무주택 인정 특례 정밀 기준 (민영주택 한정)
// 주택유형(아파트/비아파트)에 따라 면적·공시가 상한이 다름
const SMALL_CHEAP_HOUSE_LIMITS = {
  apartment:    { area: 60, priceMetro: 160000000, priceNonMetro: 100000000 },
  nonApartment: { area: 85, priceMetro: 500000000, priceNonMetro: 300000000 }
};

// 청년 주택드림 대출 연계 기준
const YOUTH_DREAM_LOAN = {
  maxAge: 39,
  minAccountMonths: 12,
  minBalance: 10000000,
  maxAnnualIncomeSingle: 70000000,
  maxAnnualIncomeMarried: 100000000,
  maxSupplyPrice: 600000000,
  maxExclusiveArea: 85,
  maxLtv: 0.8,
  minRate: 2.2
};

// 트랙 정의: 각 트랙의 소득기준(percent), 자산기준, 혼인기간 요건, 무주택 요건 성격
// 청년 트랙 자산·자동차 기준 (2026)
const YOUTH_ASSET = { total: 289000000, vehicle: 37080000 };

// ============================================================
// 트랙 정의
//  target: 신혼 | 청년 | 생애최초 | 다자녀 | 노부모 | 신생아 | 일반
//  supplyKind: private(민영) | public(공공분양) | rental(임대)
//  게이트 플래그: requireNewlywed, requireSingle, ageMin/ageMax, requireChildren(n),
//                requireOldParent, requireLifeFirst, requireNewborn
// ============================================================
const T = (o) => Object.assign({
  marriageYears: 7, allowEngaged: false, allowNewbornOver7y: false,
  incomePriority: null, incomeSpousePriority: null, incomeGeneral: null, incomeSpouseGeneral: null, incomeLottery: null,
  assetLimit: null, vehicleLimit: null, smallCheapHouseException: false, regionOnly: null,
  requireNewlywed: false, requireSingle: false, ageMin: null, ageMax: null, requireChildren: 0,
  requireOldParent: false, requireLifeFirst: false, requireNewborn: false, incomeSelfOnly: false, note: ""
}, o);

const TRACKS = [
  // ---------- 신혼부부 ----------
  T({ id: "private_sf", name: "민영 신혼부부 특별공급", category: "분양", supplyKind: "private", target: "신혼",
      requireNewlywed: true, incomePriority: 100, incomeSpousePriority: 120, incomeGeneral: 140, incomeSpouseGeneral: 160, incomeLottery: 200,
      smallCheapHouseException: true }),
  T({ id: "newhome_sf", name: "뉴:홈(공공분양) 신혼부부 특별공급", category: "분양", supplyKind: "public", target: "신혼",
      requireNewlywed: true, allowEngaged: true, allowNewbornOver7y: true,
      incomePriority: 100, incomeSpousePriority: 120, incomeGeneral: 140, incomeSpouseGeneral: 160, incomeLottery: 200,
      assetLimit: ASSET_LIMITS.newhomeProperty, vehicleLimit: ASSET_LIMITS.vehicle }),
  T({ id: "sinhonhuimang", name: "신혼희망타운", category: "분양", supplyKind: "sinhon", target: "신혼",
      requireNewlywed: true, allowEngaged: true, allowNewbornOver7y: true,
      incomeGeneral: 130, incomeSpouseGeneral: 200, assetLimit: ASSET_LIMITS.sinhonhuimang, vehicleLimit: ASSET_LIMITS.vehicle }),
  T({ id: "haengbok", name: "행복주택 (신혼부부 계층)", category: "임대", supplyKind: "rental", target: "신혼",
      requireNewlywed: true, allowEngaged: true, allowNewbornOver7y: true,
      incomePriority: 100, incomeSpousePriority: 120, assetLimit: ASSET_LIMITS.publicRentalDefault, vehicleLimit: ASSET_LIMITS.vehicle }),
  T({ id: "maeip1", name: "신혼·신생아 매입임대 Ⅰ형", category: "임대", supplyKind: "rental", target: "신혼",
      requireNewlywed: true, allowEngaged: true, allowNewbornOver7y: true,
      incomePriority: 70, incomeSpousePriority: 90, assetLimit: ASSET_LIMITS.publicRentalDefault, vehicleLimit: ASSET_LIMITS.vehicle }),
  T({ id: "maeip2", name: "신혼·신생아 매입임대 Ⅱ형", category: "임대", supplyKind: "rental", target: "신혼",
      requireNewlywed: true, allowEngaged: true, allowNewbornOver7y: true,
      incomePriority: 100, incomeSpousePriority: 120, incomeGeneral: 120, incomeSpouseGeneral: 140, incomeLottery: 200,
      assetLimit: ASSET_LIMITS.publicRentalDefault, vehicleLimit: ASSET_LIMITS.vehicle }),
  T({ id: "jeonse1", name: "신혼·신생아 전세임대 Ⅰ형", category: "임대", supplyKind: "rental", target: "신혼",
      requireNewlywed: true, allowEngaged: true, allowNewbornOver7y: true,
      incomePriority: 70, incomeSpousePriority: 90, assetLimit: ASSET_LIMITS.publicRentalDefault, vehicleLimit: ASSET_LIMITS.vehicle }),
  T({ id: "jeonse2", name: "신혼·신생아 전세임대 Ⅱ형", category: "임대", supplyKind: "rental", target: "신혼",
      requireNewlywed: true, allowEngaged: true, allowNewbornOver7y: true,
      incomePriority: 130, incomeSpousePriority: 200, assetLimit: ASSET_LIMITS.sinhonhuimang, vehicleLimit: ASSET_LIMITS.vehicle }),
  T({ id: "mirinaejip", name: "장기전세Ⅱ 미리내집 (서울)", category: "임대", supplyKind: "rental", target: "신혼",
      requireNewlywed: true, allowEngaged: true, allowNewbornOver7y: true, regionOnly: "서울",
      incomePriority: 120, incomeSpousePriority: 180, incomeGeneral: 150, incomeSpouseGeneral: 200,
      assetLimit: ASSET_LIMITS.mirinaejip, vehicleLimit: ASSET_LIMITS.vehicle }),

  // ---------- 청년 ----------
  T({ id: "youth_sf", name: "뉴:홈 미혼청년 특별공급", category: "분양", supplyKind: "public", target: "청년",
      requireSingle: true, ageMin: 19, ageMax: 39, incomeSelfOnly: true,
      incomeGeneral: 140, assetLimit: YOUTH_ASSET.total, vehicleLimit: ASSET_LIMITS.vehicle,
      note: "본인 소득·자산 기준(부모 자산 상위 10% 제외)" }),
  T({ id: "youth_ansim_pub", name: "청년안심주택 공공임대 (서울)", category: "임대", supplyKind: "rental", target: "청년",
      requireSingle: true, ageMin: 19, ageMax: 39, regionOnly: "서울", incomeSelfOnly: true,
      incomePriority: 100, incomeGeneral: 120, assetLimit: YOUTH_ASSET.total, vehicleLimit: YOUTH_ASSET.vehicle }),
  T({ id: "youth_ansim_priv", name: "청년안심주택 민간임대 특별공급 (서울)", category: "임대", supplyKind: "rental", target: "청년",
      requireSingle: true, ageMin: 19, ageMax: 39, regionOnly: "서울", incomeSelfOnly: true,
      incomeGeneral: 120, assetLimit: YOUTH_ASSET.total, vehicleLimit: YOUTH_ASSET.vehicle }),
  T({ id: "haengbok_youth", name: "행복주택 (청년 계층)", category: "임대", supplyKind: "rental", target: "청년",
      requireSingle: true, ageMin: 19, ageMax: 39, incomeSelfOnly: true,
      incomePriority: 100, incomeGeneral: 120, assetLimit: YOUTH_ASSET.total, vehicleLimit: YOUTH_ASSET.vehicle,
      note: "1인 가구 120% 완화 적용" }),
  T({ id: "youth_maeip", name: "청년 매입임대", category: "임대", supplyKind: "rental", target: "청년",
      requireSingle: true, ageMin: 19, ageMax: 39, incomeSelfOnly: true,
      incomeGeneral: 100, assetLimit: YOUTH_ASSET.total, vehicleLimit: YOUTH_ASSET.vehicle }),
  T({ id: "youth_jeonse", name: "청년 전세임대", category: "임대", supplyKind: "rental", target: "청년",
      requireSingle: true, ageMin: 19, ageMax: 39, incomeSelfOnly: true,
      incomeGeneral: 100, assetLimit: YOUTH_ASSET.total, vehicleLimit: YOUTH_ASSET.vehicle }),

  // ---------- 생애최초 ----------
  T({ id: "lifefirst_priv", name: "민영 생애최초 특별공급", category: "분양", supplyKind: "private", target: "생애최초",
      requireLifeFirst: true, incomePriority: 130, incomeSpousePriority: 160, incomeLottery: 200, smallCheapHouseException: true,
      note: "주택 소유 이력 없음 · 5년 이상 소득세 납부 · 추첨제 자산 3.31억" }),
  T({ id: "lifefirst_pub", name: "뉴:홈 생애최초 특별공급", category: "분양", supplyKind: "public", target: "생애최초",
      requireLifeFirst: true, incomePriority: 100, incomeSpousePriority: 120, incomeGeneral: 130, incomeSpouseGeneral: 160,
      assetLimit: ASSET_LIMITS.newhomeProperty, vehicleLimit: ASSET_LIMITS.vehicle }),

  // ---------- 다자녀 / 노부모 / 신생아 ----------
  T({ id: "multichild_pub", name: "뉴:홈 다자녀 특별공급", category: "분양", supplyKind: "public", target: "다자녀",
      requireChildren: 2, incomePriority: 120, incomeSpousePriority: 140,
      assetLimit: ASSET_LIMITS.newhomeProperty, vehicleLimit: ASSET_LIMITS.vehicle, note: "미성년 자녀 2명 이상(2024 개정)" }),
  T({ id: "oldparent_pub", name: "뉴:홈 노부모부양 특별공급", category: "분양", supplyKind: "public", target: "노부모",
      requireOldParent: true, incomePriority: 120, incomeSpousePriority: 200,
      assetLimit: ASSET_LIMITS.newhomeProperty, vehicleLimit: ASSET_LIMITS.vehicle, note: "65세 이상 직계존속 3년 이상 계속 부양·세대주" }),
  T({ id: "newborn_pub", name: "뉴:홈 신생아 특별공급", category: "분양", supplyKind: "public", target: "신생아",
      requireNewborn: true, incomePriority: 140, incomeSpousePriority: 200,
      assetLimit: ASSET_LIMITS.newhomeProperty, vehicleLimit: ASSET_LIMITS.vehicle, note: "공고일 기준 2년 이내 출생 자녀" }),

  // ---------- 일반공급 ----------
  T({ id: "general_pub", name: "공공분양 일반공급 (60㎡ 이하)", category: "분양", supplyKind: "public", target: "일반",
      incomePriority: 100, incomeSpousePriority: 200, assetLimit: ASSET_LIMITS.newhomeProperty, vehicleLimit: ASSET_LIMITS.vehicle,
      note: "청약저축 납입 인정회차·저축총액 순" }),
  T({ id: "general_priv", name: "민영주택 일반공급 (가점·추첨)", category: "분양", supplyKind: "private", target: "일반",
      smallCheapHouseException: true, note: "소득·자산 제한 없음 · 청약통장 예치금·가점(84점) 적용" })
];


// ============================================================
// 분양 예정 (청약홈 모집공고 게시 전) — 언론 보도 기반 수동 등록
// keywords: 청약홈 공고 단지명에 포함되면 자동 매칭
// ============================================================
const UPCOMING = [
  { id: "sinbanpo22", name: "신반포22차 재건축", keywords: ["신반포22", "신반포 22"], region: "서울", gu: "서초구",
    total: 160, sale: 28, supplyKind: "private", month: "2026-10",
    note: "재건축 일반분양 28세대 · 민영", source: "신문 2026-09-28 「추석후 청약 큰장」" },
  { id: "godeok3", name: "고덕강일3단지", keywords: ["고덕강일3", "고덕강일 3", "고덕강일 3단지"], region: "서울", gu: "강동구",
    total: 1305, sale: 1305, supplyKind: "public", month: "2026-10",
    note: "SH 공공분양(뉴:홈) 1,305세대 전량 분양", source: "신문 2026-09-28 「추석후 청약 큰장」" }
];
