// ============================================================
// housing-match: 자격판정 엔진 + UI 렌더링 (v2 — 세그먼트/토글/아코디언 UI)
// ============================================================

const YEAR = 2026;
const API_BASE = "https://housing-match-api.yjjn2005.workers.dev";
const STATUS_META = {
  OK:    { label: "신청가능", chip: "ok" },
  COND:  { label: "조건부가능", chip: "cond" },
  CHECK: { label: "확인필요", chip: "check" },
  NO:    { label: "신청곤란", chip: "no" }
};
const ICONS = {
  OK:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M5 13l4 4L19 7"/></svg>',
  COND:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M12 8v5"/><circle cx="12" cy="16.5" r="0.9" fill="currentColor" stroke="none"/></svg>',
  CHECK: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-1 .5-1.3 1-1.3 2.2"/><circle cx="12" cy="17" r="0.9" fill="currentColor" stroke="none"/></svg>',
  NO:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M6 6l12 12M18 6L6 18"/></svg>'
};
const CHEVRON = '<svg class="chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M6 9l6 6 6-6"/></svg>';

// --- 공고 공급유형 → 자격판정 트랙 매핑 ---------------------------

function mapNoticeToTrackId(houseSecdNm) {
  if (!houseSecdNm) return null;
  if (houseSecdNm.includes("신혼희망타운")) return "sinhonhuimang";
  if (houseSecdNm.includes("국민")) return "newhome_sf";
  if (houseSecdNm.includes("민영")) return "private_sf";
  return null;
}

function evaluateNotice(notice, profile) {
  const trackId = mapNoticeToTrackId(notice.공급유형);
  const track = trackId ? TRACKS.find(t => t.id === trackId) : null;
  if (!track) {
    return {
      status: "CHECK",
      reasons: [`공급유형 "${notice.공급유형}"은 자동판정 트랙과 매치되지 않습니다 — 공고문에서 신혼부부 특공 물량·조건을 직접 확인하세요.`]
    };
  }
  return evaluateTrack(track, profile);
}

// --- 금액 입력 콤마 포맷팅 ---------------------------------------

function parseAmount(str) {
  const digits = String(str || "").replace(/[^\d]/g, "");
  return digits ? Number(digits) : 0;
}
function formatAmount(num) {
  return Number(num || 0).toLocaleString("ko-KR");
}
function setupAmountField(id) {
  const el = document.getElementById(id);
  el.addEventListener("input", () => {
    const raw = parseAmount(el.value);
    el.value = raw ? formatAmount(raw) : "";
  });
  el.addEventListener("blur", () => {
    if (el.value === "") el.value = "0";
  });
}

// --- 판정 함수 ---------------------------------------------

function evaluateTrack(track, p) {
  const reasons = [];

  if (p.maritalStatus === "single") {
    return { status: "NO", reasons: ["미혼 상태 — 미혼청년 특공만 해당, 이 트랙은 결혼 후 대상"] };
  }
  if (p.maritalStatus === "engaged") {
    if (!track.allowEngaged) {
      return { status: "NO", reasons: ["예비신혼부부는 이 트랙(민영 특공) 신청 불가"] };
    }
    reasons.push("예비신혼부부 — 혼인신고 완료 시 자격 확정(현재는 조건부)");
  }
  if (p.maritalStatus === "married") {
    if (p.marriageYears > track.marriageYears) {
      if (track.allowNewbornOver7y && p.hasChildUnder6) {
        reasons.push("혼인 7년 초과이나 만 6세 이하 자녀 보유로 신혼 계층 자격 유지");
      } else {
        return { status: "NO", reasons: [`혼인기간 ${p.marriageYears}년 — 7년 초과로 신혼부부 자격 상실`] };
      }
    }
  }

  if (track.regionOnly && p.region !== track.regionOnly) {
    return { status: "NO", reasons: [`${track.regionOnly} 거주자 한정 트랙`] };
  }

  if (track.category === "분양" && p.spUsedCount >= 1) {
    if (p.propertyDisposed && p.newbornWithin2y) {
      reasons.push("EX-6: 기당첨 이력 있으나 무주택 전환+2년내 출산으로 1회 재신청 허용");
    } else {
      return { status: "NO", reasons: ["EX-1: 특별공급 생애 1회 원칙 — 기당첨 이력으로 신청 불가"] };
    }
  }

  if (!p.isHomeless) {
    if (p.hasSmallCheapHouse) {
      const exempt = isSmallCheapHouseEligible(p.smallHouseType, p.smallHouseArea, p.smallHousePrice, p.smallHouseMetro);
      if (exempt && track.smallCheapHouseException) {
        reasons.push(`EX-8: 소형·저가주택 특례 충족(${p.smallHouseType === "nonApartment" ? "비아파트" : "아파트"}·${p.smallHouseArea}㎡·${fmt(p.smallHousePrice)}) — 민영주택 한정 무주택 인정`);
      } else if (exempt && !track.smallCheapHouseException) {
        return { status: "NO", reasons: ["공공 트랙은 소형·저가주택 보유자도 유주택자로 분류 — 신청 불가"] };
      } else {
        return { status: "NO", reasons: ["보유주택이 소형·저가주택 특례 기준(면적·공시가)을 초과해 유주택자로 분류됨"] };
      }
    } else {
      return { status: "NO", reasons: ["무주택 세대구성원 요건 미충족"] };
    }
  }

  if (track.vehicleLimit && p.vehicleAsset > track.vehicleLimit) {
    return { status: "NO", reasons: [`자동차가액 초과 (기준 ${fmt(track.vehicleLimit)} 이하)`] };
  }
  let assetLimit = track.assetLimit;
  if (assetLimit && p.totalAsset > assetLimit) {
    return { status: "NO", reasons: [`총자산/부동산 기준 초과 (기준 ${fmt(assetLimit)} 이하)`] };
  }

  const percentOptions = [
    track.incomePriority, track.incomeSpousePriority,
    track.incomeGeneral, track.incomeSpouseGeneral,
    track.incomeLottery
  ].filter(v => v != null);

  if (percentOptions.length > 0) {
    const applicablePercent = p.isDualIncome
      ? Math.max(track.incomeSpousePriority || 0, track.incomeSpouseGeneral || 0, track.incomeLottery || 0)
      : Math.max(track.incomePriority || 0, track.incomeGeneral || 0);
    const threshold = incomeThreshold(YEAR, p.householdSize, applicablePercent);
    if (p.monthlyIncome > threshold) {
      return { status: "NO", reasons: [`세대 월소득 ${fmt(p.monthlyIncome)} > 기준 ${fmt(threshold)} (${applicablePercent}%, ${p.isDualIncome ? "맞벌이" : "외벌이"})`] };
    }
    const priorityPercent = p.isDualIncome ? track.incomeSpousePriority : track.incomePriority;
    if (priorityPercent) {
      const pThreshold = incomeThreshold(YEAR, p.householdSize, priorityPercent);
      if (p.monthlyIncome <= pThreshold) {
        reasons.push(`우선공급 소득기준(${priorityPercent}%) 충족`);
      } else {
        reasons.push(`일반/추첨 구간 소득 — 우선공급 대상 아님`);
      }
    }
  }

  if (track.category === "분양" && p.maritalStatus === "married") {
    reasons.push("EX-7: 부부 중복청약 시 선접수 1건만 유효 처리됨(참고)");
  }

  if (p.maritalStatus === "engaged") {
    return { status: "COND", reasons };
  }
  return { status: "OK", reasons };
}

function fmt(n) { return "₩" + Number(n).toLocaleString("ko-KR"); }

// --- 소형·저가주택 무주택 특례 정밀 판정 (아파트/비아파트 구분) -------

function isSmallCheapHouseEligible(houseType, exclusiveArea, publicPrice, isMetro) {
  const limits = houseType === "nonApartment" ? SMALL_CHEAP_HOUSE_LIMITS.nonApartment : SMALL_CHEAP_HOUSE_LIMITS.apartment;
  const priceCap = isMetro ? limits.priceMetro : limits.priceNonMetro;
  return exclusiveArea <= limits.area && publicPrice <= priceCap;
}

// --- 청약통장 배우자 합산 가점 (민영 일반공급 참고용) -------------------

function calculateBankScore(applicantMonths, spouseMonths) {
  const getRawScore = (months) => {
    if (months < 6) return months > 0 ? 1 : 0;
    if (months < 12) return 2;
    const years = Math.floor(months / 12);
    return Math.min(17, years + 2);
  };
  const applicantScore = getRawScore(applicantMonths);
  const spouseRaw = spouseMonths > 0 ? getRawScore(spouseMonths) : 0;
  const spouseBonus = Math.min(3, Math.floor(spouseRaw * 0.5));
  const totalBankScore = Math.min(17, applicantScore + spouseBonus);
  return { totalBankScore, applicantScore, spouseBonus };
}

// --- 청년 주택드림 대출 연계 판정 ------------------------------------

function evaluateYouthDreamLoan(profile) {
  const isAgeValid = profile.age > 0 && profile.age <= YOUTH_DREAM_LOAN.maxAge;
  const isAccountValid = profile.bankMonths >= YOUTH_DREAM_LOAN.minAccountMonths;
  const annualIncome = profile.monthlyIncome * 12;
  const incomeCap = profile.maritalStatus === "married" ? YOUTH_DREAM_LOAN.maxAnnualIncomeMarried : YOUTH_DREAM_LOAN.maxAnnualIncomeSingle;
  const isIncomeValid = annualIncome <= incomeCap;
  const isHousingValid = profile.interestedPrice > 0
    ? (profile.interestedPrice <= YOUTH_DREAM_LOAN.maxSupplyPrice && profile.interestedArea <= YOUTH_DREAM_LOAN.maxExclusiveArea)
    : null; // 관심 분양가 미입력 시 판정 보류

  let reason = "적격 대상";
  if (!isAgeValid) reason = "만 39세 초과로 연계 불가";
  else if (!isAccountValid) reason = "청약통장 가입 12개월 미만";
  else if (!isIncomeValid) reason = `연소득 ${fmt(annualIncome)} 초과 (기준 ${fmt(incomeCap)})`;
  else if (isHousingValid === false) reason = "분양가 6억원 초과 또는 전용 85㎡ 초과로 연계 불가";
  else if (isHousingValid === null) reason = "관심 분양가를 입력하면 정확히 판정됩니다";

  return {
    eligible: isAgeValid && isAccountValid && isIncomeValid && isHousingValid === true,
    pending: isHousingValid === null && isAgeValid && isAccountValid && isIncomeValid,
    maxLtv: YOUTH_DREAM_LOAN.maxLtv,
    estimatedMinInterestRate: YOUTH_DREAM_LOAN.minRate,
    reason
  };
}

// --- 시나리오 프리셋 -----------------------------------------

function applyScenario(profile, scenario) {
  const p = { ...profile };
  if (scenario === "before") {
    p.maritalStatus = "single";
  } else if (scenario === "after") {
    p.maritalStatus = "married"; p.marriageYears = 0;
    p.hasChildUnder6 = false; p.newbornWithin2y = false;
  } else if (scenario === "newborn") {
    p.maritalStatus = "married"; p.marriageYears = 0;
    p.hasChildUnder6 = true; p.newbornWithin2y = true;
  }
  return p;
}

// ============================================================
// UI 레이어 (v3 — 대시보드 / 유형별 판정 / 전체 자격조건)
// ============================================================

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];

let currentRegion = "서울";
let currentCat = "all";
let lastNotices = [];

// --- 세그먼트 컨트롤 ------------------------------------------

function setupSegmented(id) {
  const group = document.getElementById(id);
  group.querySelectorAll("button").forEach(btn => {
    btn.addEventListener("click", () => {
      group.querySelectorAll("button").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      if (id === "regionSeg") {
        currentRegion = btn.dataset.val === "기타" ? "서울" : btn.dataset.val;
        $$(".ntab").forEach(b => b.classList.toggle("active", b.dataset.region === currentRegion));
      }
    });
  });
}
function getSegmentedValue(id) { return document.querySelector(`#${id} button.active`).dataset.val; }
function setSegmentedValue(id, val) {
  document.getElementById(id).querySelectorAll("button").forEach(b => b.classList.toggle("active", b.dataset.val === val));
}

// --- 프로필 수집 ------------------------------------------------

function collectProfile() {
  return {
    maritalStatus: getSegmentedValue("maritalSeg"),
    marriageYears: Number($("#marriageYears").value || 0),
    hasChildUnder6: $("#hasChildUnder6").checked,
    region: getSegmentedValue("regionSeg"),
    householdSize: Number($("#householdSize").value || 1),
    age: Number($("#applicantAge").value || 0),
    isDualIncome: $("#isDualIncome").checked,
    monthlyIncome: parseAmount($("#monthlyIncome").value),
    totalAsset: parseAmount($("#totalAsset").value),
    vehicleAsset: parseAmount($("#vehicleAsset").value),
    isHomeless: $("#isHomeless").checked,
    hasSmallCheapHouse: $("#hasSmallCheapHouse").checked,
    smallHouseType: getSegmentedValue("smallHouseTypeSeg"),
    smallHouseArea: Number($("#smallHouseArea").value || 0),
    smallHousePrice: parseAmount($("#smallHousePrice").value),
    smallHouseMetro: $("#smallHouseMetro").checked,
    spUsedCount: Number($("#spUsedCount").value || 0),
    propertyDisposed: $("#propertyDisposed").checked,
    newbornWithin2y: $("#newbornWithin2y").checked,
    bankMonths: Number($("#bankMonths").value || 0),
    spouseBankMonths: Number($("#spouseBankMonths").value || 0),
    interestedPrice: parseAmount($("#interestedPrice").value),
    interestedArea: Number($("#interestedArea").value || 0)
  };
}

// --- 카드 렌더링 공통 ------------------------------------------

function cardHTML({ status, title, tags, meta, reasons, link }) {
  const m = STATUS_META[status];
  return `
  <div class="card status-${status}">
    <div class="card-head">
      <div class="info">
        <div class="card-title">${title}</div>
        <div class="card-meta">${tags.map(t => `<span class="tag">${t}</span>`).join("")}${meta.map(x => `<span>${x}</span>`).join("")}</div>
      </div>
      <span class="status ${status}">${m.label}</span>
      ${CHEVRON}
    </div>
    <div class="card-detail">
      <ul class="reason-list">${reasons.map(r => `<li class="${status === "NO" ? "fail" : ""}">${r}</li>`).join("")}</ul>
      ${link ? `<div class="link-row"><a href="${link}" target="_blank" rel="noopener">공고 원문 보기 →</a></div>` : ""}
    </div>
  </div>`;
}
function bindCardToggles(root) {
  root.querySelectorAll(".card-head").forEach(h => h.addEventListener("click", () => h.closest(".card").classList.toggle("open")));
}

// --- 대시보드: 공고 판정 ------------------------------------------

async function loadNotices(profile, region) {
  const list = $("#noticesList");
  list.innerHTML = '<div class="loading">청약홈에서 공고를 가져오는 중…</div>';
  try {
    const res = await fetch(`${API_BASE}/notices?region=${encodeURIComponent(region)}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    lastNotices = data.notices || [];
    renderNotices(profile);
  } catch (e) {
    list.innerHTML = '<div class="error">공고 조회 실패 — 잠시 후 새로고침해 주세요.</div>';
  }
}

function renderNotices(profile) {
  const list = $("#noticesList");
  if (!lastNotices.length) {
    list.innerHTML = '<div class="empty">현재 이 지역에 신혼 관련 공고가 없습니다.</div>';
    $("#statOk").textContent = 0; $("#statNo").textContent = 0;
    return;
  }
  let ok = 0, no = 0;
  list.innerHTML = lastNotices.map(n => {
    const v = evaluateNotice(n, profile);
    if (v.status === "OK") ok++; if (v.status === "NO") no++;
    return cardHTML({
      status: v.status,
      title: n.단지명,
      tags: [n.공급유형],
      meta: [`지역 ${n.지역}`, `${n.공급규모}세대`, `접수 ${n.접수시작}~${n.접수종료}`, `발표 ${n.당첨자발표일}`],
      reasons: v.reasons,
      link: n.공고URL
    });
  }).join("");
  bindCardToggles(list);
  $("#statOk").textContent = ok; $("#statNo").textContent = no;
}

// --- 유형별 판정 ------------------------------------------------

function renderTracks(profile) {
  const results = TRACKS.map(t => ({ track: t, r: evaluateTrack(t, profile) }));
  const counts = { OK: 0, COND: 0, CHECK: 0, NO: 0 };
  results.forEach(x => counts[x.r.status]++);

  $("#summaryStrip").innerHTML = `
    <span class="summary-chip ok"><span class="n">${counts.OK}</span>신청가능</span>
    <span class="summary-chip cond"><span class="n">${counts.COND}</span>조건부</span>
    <span class="summary-chip check"><span class="n">${counts.CHECK}</span>확인필요</span>
    <span class="summary-chip no"><span class="n">${counts.NO}</span>신청곤란</span>`;

  const filtered = results.filter(x => currentCat === "all" || x.track.category === currentCat);
  const box = $("#results");
  box.innerHTML = filtered.map(x => cardHTML({
    status: x.r.status,
    title: x.track.name,
    tags: [x.track.category],
    meta: x.track.regionOnly ? [`${x.track.regionOnly} 한정`] : [],
    reasons: x.r.reasons,
    link: null
  })).join("");
  bindCardToggles(box);

  // 적합도 링 (대시보드)
  const score = Math.round((counts.OK + counts.COND * 0.5) / TRACKS.length * 100);
  $("#matchScore").textContent = score;
  $("#scoreRing").style.background = `conic-gradient(var(--blue) 0 ${score}%, #d6e3f7 ${score}%)`;
  if (counts.OK >= 5) {
    $("#summaryTitle").textContent = "신청 가능성이 높습니다";
    $("#summaryText").textContent = `9개 트랙 중 ${counts.OK}개 신청가능. 아래 공고별 판정을 확인하세요.`;
  } else if (counts.OK + counts.COND >= 3) {
    $("#summaryTitle").textContent = "일부 트랙에서 신청 가능합니다";
    $("#summaryText").textContent = `신청가능 ${counts.OK}개 · 조건부 ${counts.COND}개. 유형별 판정 탭에서 상세 확인.`;
  } else {
    $("#summaryTitle").textContent = "필수조건을 다시 확인하세요";
    $("#summaryText").textContent = "무주택·혼인상태·소득·자산 중 미충족 항목이 있습니다. 카드의 사유를 확인하세요.";
  }
}

function renderRefInfo(profile) {
  const bs = calculateBankScore(profile.bankMonths, profile.spouseBankMonths);
  $("#bankScoreCard").innerHTML = `<b>청약통장 가점</b> (민영 일반공급 참고 · 17점 만점)<br>본인 ${bs.applicantScore}점 + 배우자 가산 ${bs.spouseBonus}점 = <b>${bs.totalBankScore}점</b>`;
  const yl = evaluateYouthDreamLoan(profile);
  $("#youthLoanCard").innerHTML = yl.eligible
    ? `<b>청년 주택드림 대출 연계 가능</b><br>최대 LTV ${Math.round(yl.maxLtv * 100)}% · 최저 연 ${yl.estimatedMinInterestRate}%`
    : yl.pending
      ? `<b>청년 주택드림 대출 — 판정 보류</b><br>${yl.reason}`
      : `<b>청년 주택드림 대출 연계 불가</b><br>${yl.reason}`;
}

function renderScenarioCompare(base) {
  const scenarios = [
    { key: "before", label: "① 혼인신고 전" },
    { key: "after", label: "② 혼인신고 후" },
    { key: "newborn", label: "③ 출산·임신 후" }
  ];
  const box = $("#scenarioScroll");
  box.innerHTML = scenarios.map(s => {
    const p = applyScenario(base, s.key);
    const rows = TRACKS.map(t => {
      const r = evaluateTrack(t, p);
      return `<div class="scenario-row"><span>${t.name}</span><span class="scenario-dot ${r.status}"></span></div>`;
    }).join("");
    return `<div class="scenario-col"><h3>${s.label}</h3>${rows}</div>`;
  }).join("");
}

// --- 전체 자격조건 표 --------------------------------------------

function pct(a, b) { return a == null ? "—" : `${a}%${b != null ? ` / 맞벌이 ${b}%` : ""}`; }
function won(n) { return n == null ? "제한 없음" : "₩" + Number(n).toLocaleString("ko-KR"); }

function renderCondTable() {
  const head = `<tr><th>트랙</th><th>혼인·자격</th><th>우선공급 소득</th><th>일반/추첨 소득</th><th>총자산·부동산</th><th>자동차</th><th>비고</th></tr>`;
  const rows = TRACKS.map(t => `
    <tr>
      <td>${t.name}<span class="cat">${t.category}</span></td>
      <td>혼인 ${t.marriageYears}년 이내${t.allowEngaged ? " · 예비신혼 가능" : " · 예비신혼 불가"}${t.allowNewbornOver7y ? " · 6세↓자녀 시 유지" : ""}</td>
      <td>${pct(t.incomePriority, t.incomeSpousePriority)}</td>
      <td>${pct(t.incomeGeneral, t.incomeSpouseGeneral)}${t.incomeLottery ? ` · 추첨 ${t.incomeLottery}%` : ""}</td>
      <td>${won(t.assetLimit)}</td>
      <td>${won(t.vehicleLimit)}</td>
      <td>${t.regionOnly ? `${t.regionOnly} 한정` : ""}${t.smallCheapHouseException ? "소형저가주택 특례 적용" : ""}</td>
    </tr>`).join("");
  $("#condTable").innerHTML = head + rows;
}

// --- 실행 ---------------------------------------------------------

function runAll() {
  const p = collectProfile();
  renderTracks(p);
  renderRefInfo(p);
  renderScenarioCompare(p);
  renderNotices(p);
  saveLocal(p);
}

function saveLocal(p) { try { localStorage.setItem("housingMatchProfile", JSON.stringify(p)); } catch (e) {} }
function loadLocal() {
  try {
    const raw = localStorage.getItem("housingMatchProfile");
    if (!raw) return;
    const p = JSON.parse(raw);
    setSegmentedValue("maritalSeg", p.maritalStatus || "married");
    $("#marriageYears").value = p.marriageYears || 0;
    $("#hasChildUnder6").checked = !!p.hasChildUnder6;
    setSegmentedValue("regionSeg", p.region || "서울");
    currentRegion = (p.region && p.region !== "기타") ? p.region : "서울";
    $("#householdSize").value = p.householdSize || 2;
    $("#applicantAge").value = p.age || 28;
    $("#isDualIncome").checked = !!p.isDualIncome;
    $("#monthlyIncome").value = formatAmount(p.monthlyIncome || 0);
    $("#totalAsset").value = formatAmount(p.totalAsset || 0);
    $("#vehicleAsset").value = formatAmount(p.vehicleAsset || 0);
    $("#isHomeless").checked = p.isHomeless !== false;
    $("#hasSmallCheapHouse").checked = !!p.hasSmallCheapHouse;
    setSegmentedValue("smallHouseTypeSeg", p.smallHouseType || "apartment");
    $("#smallHouseArea").value = p.smallHouseArea || 59;
    $("#smallHousePrice").value = formatAmount(p.smallHousePrice || 90000000);
    $("#smallHouseMetro").checked = p.smallHouseMetro !== false;
    $("#bankMonths").value = p.bankMonths || 0;
    $("#spouseBankMonths").value = p.spouseBankMonths || 0;
    $("#interestedPrice").value = p.interestedPrice ? formatAmount(p.interestedPrice) : "";
    $("#interestedArea").value = p.interestedArea || "";
    $("#spUsedCount").value = p.spUsedCount || 0;
    $("#propertyDisposed").checked = !!p.propertyDisposed;
    $("#newbornWithin2y").checked = !!p.newbornWithin2y;
  } catch (e) {}
}

window.addEventListener("DOMContentLoaded", () => {
  setupSegmented("maritalSeg");
  setupSegmented("regionSeg");
  setupSegmented("smallHouseTypeSeg");
  ["monthlyIncome", "totalAsset", "vehicleAsset", "smallHousePrice", "interestedPrice"].forEach(setupAmountField);

  const toggle = $("#hasSmallCheapHouse"), details = $("#smallHouseDetails");
  const sync = () => details.style.display = toggle.checked ? "block" : "none";
  toggle.addEventListener("change", sync);

  loadLocal();
  sync();
  $$(".ntab").forEach(b => b.classList.toggle("active", b.dataset.region === currentRegion));

  // 탭 전환
  $$(".nav-link").forEach(b => b.addEventListener("click", () => {
    $$(".nav-link").forEach(x => x.classList.remove("active"));
    b.classList.add("active");
    $$(".view").forEach(v => v.classList.remove("active-view"));
    $("#" + b.dataset.view).classList.add("active-view");
    scrollTo(0, 0);
  }));

  // 공고 지역 탭
  $$(".ntab").forEach(b => b.addEventListener("click", () => {
    $$(".ntab").forEach(x => x.classList.remove("active"));
    b.classList.add("active");
    currentRegion = b.dataset.region;
    loadNotices(collectProfile(), currentRegion);
  }));
  $("#reloadNotices").addEventListener("click", () => loadNotices(collectProfile(), currentRegion));

  // 유형 필터 탭
  $$(".tab").forEach(b => b.addEventListener("click", () => {
    $$(".tab").forEach(x => x.classList.remove("active"));
    b.classList.add("active");
    currentCat = b.dataset.cat;
    renderTracks(collectProfile());
  }));

  $("#runBtn").addEventListener("click", runAll);
  $("#resetBtn").addEventListener("click", () => { localStorage.removeItem("housingMatchProfile"); location.reload(); });

  renderCondTable();
  runAll();
  loadNotices(collectProfile(), currentRegion);
});
