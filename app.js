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

function noticeCandidates(houseSecdNm) {
  const t = houseSecdNm || "";
  if (t.includes("신혼희망타운")) return TRACKS.filter(x => x.supplyKind === "sinhon");
  if (t.includes("민영")) return TRACKS.filter(x => x.supplyKind === "private");
  if (t.includes("국민") || t.includes("공공")) return TRACKS.filter(x => x.supplyKind === "public");
  return [];
}

function evaluateNotice(notice, profile) {
  const cands = noticeCandidates(notice.공급유형);
  if (!cands.length) {
    return { status: "CHECK", reasons: [`공급유형 "${notice.공급유형}"은 자동판정 트랙과 매치되지 않음 — 공고문 직접 확인`], notes: [] };
  }
  const evals = orderTracks(cands).map(t => ({ t, r: evaluateTrack(t, profile) }));
  const ok = evals.filter(x => x.r.status === "OK");
  const cond = evals.filter(x => x.r.status === "COND");
  if (ok.length) return { status: "OK", reasons: [`신청가능: ${ok.map(x => x.t.name.replace(/\s*\(.*?\)/g, "")).join(", ")}`], notes: cond.map(x => `조건부: ${x.t.name}`) };
  if (cond.length) return { status: "COND", reasons: cond.map(x => `${x.t.name}: ${x.r.reasons[0] || "조건부"}`), notes: [] };
  // 전부 불가 — 트랙별 첫 사유 요약 (가장 적은 사유 순)
  const sorted = evals.sort((a, b) => a.r.reasons.length - b.r.reasons.length);
  return { status: "NO", reasons: sorted.slice(0, 3).map(x => `${x.t.name.replace(/\s*\(.*?\)/g, "")}: ${x.r.reasons[0]}`), notes: sorted.slice(3).map(x => `${x.t.name}: ${x.r.reasons[0]}`) };
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
  const fails = [], notes = [];
  const marital = { single: "미혼", engaged: "예비신혼", married: "기혼" }[p.maritalStatus];

  // 대상별 게이트 --------------------------------------------------
  if (track.requireNewlywed) {
    if (p.maritalStatus === "single") fails.push("미혼 — 신혼부부 트랙은 혼인신고 후 대상");
    else if (p.maritalStatus === "engaged") {
      if (!track.allowEngaged) fails.push("예비신혼부부는 이 트랙 신청 불가 (혼인신고 후 가능)");
      else notes.push("예비신혼부부 — 혼인신고 완료 시 자격 확정");
    } else if (p.marriageYears > track.marriageYears) {
      if (track.allowNewbornOver7y && p.hasChildUnder6) notes.push("혼인 7년 초과이나 만 6세 이하 자녀로 신혼 계층 유지");
      else fails.push(`혼인기간 ${p.marriageYears}년 — 7년 초과`);
    }
  }
  if (track.requireSingle && p.maritalStatus !== "single") fails.push(`${marital} — 청년 트랙은 미혼(혼인 중 아님)만 가능`);
  if (track.ageMin != null && (p.age < track.ageMin || p.age > track.ageMax)) fails.push(`만 ${p.age}세 — 대상 연령 ${track.ageMin}~${track.ageMax}세 벗어남`);
  if (track.requireChildren && p.childCount < track.requireChildren) fails.push(`미성년 자녀 ${p.childCount}명 — ${track.requireChildren}명 이상 필요`);
  if (track.requireOldParent && !p.oldParentSupport) fails.push("65세 이상 직계존속 3년 이상 부양 요건 미충족");
  if (track.requireNewborn && !p.newbornWithin2y) fails.push("2년 이내 출생 자녀 없음");
  if (track.requireLifeFirst) {
    if (!p.noHouseHistory) fails.push("세대원 주택 소유 이력 있음 — 생애최초 불가");
    if (!p.taxYears5) fails.push("5년 이상 소득세 납부 요건 미충족");
    if (p.maritalStatus === "single" && p.childCount === 0 && track.supplyKind === "public") fails.push("공공 생애최초는 혼인 중이거나 자녀가 있어야 함");
  }
  if (track.regionOnly && p.region !== track.regionOnly) fails.push(`${track.regionOnly} 한정 (희망지역: ${p.region})`);

  // 특별공급 1회 ---------------------------------------------------
  if (track.category === "분양" && track.target !== "일반" && p.spUsedCount >= 1) {
    if (p.propertyDisposed && p.newbornWithin2y) notes.push("기당첨 이력 있으나 무주택 전환+2년 내 출산으로 1회 재신청 허용");
    else fails.push(`과거 특별공급 당첨 ${p.spUsedCount}회 — 생애 1회 원칙`);
  }

  // 무주택 --------------------------------------------------------
  if (!p.isHomeless) {
    if (p.hasSmallCheapHouse) {
      const ex = isSmallCheapHouseEligible(p.smallHouseType, p.smallHouseArea, p.smallHousePrice, p.smallHouseMetro);
      if (ex && track.smallCheapHouseException) notes.push(`소형·저가주택 특례 충족 — 민영 한정 무주택 인정`);
      else if (ex) fails.push("공공 트랙은 소형·저가주택 보유자도 유주택자로 분류");
      else fails.push("보유주택이 소형·저가 특례 기준 초과 — 유주택자");
    } else if (track.id === "general_priv") {
      notes.push("유주택자 — 민영 일반공급은 1주택 처분조건 추첨 가능 (가점제 불가)");
    } else fails.push("무주택 세대구성원 요건 미충족");
  }

  // 자산 ----------------------------------------------------------
  if (track.vehicleLimit && p.vehicleAsset > track.vehicleLimit) fails.push(`자동차가액 ${fmt(p.vehicleAsset)} > 기준 ${fmt(track.vehicleLimit)}`);
  if (track.assetLimit && p.totalAsset > track.assetLimit) fails.push(`총자산 ${fmt(p.totalAsset)} > 기준 ${fmt(track.assetLimit)}`);

  // 소득 ----------------------------------------------------------
  const hasIncome = [track.incomePriority, track.incomeSpousePriority, track.incomeGeneral, track.incomeSpouseGeneral, track.incomeLottery].some(v => v != null);
  if (hasIncome) {
    const dual = track.incomeSelfOnly ? false : p.isDualIncome;
    const hh = track.incomeSelfOnly ? 1 : p.householdSize;
    const maxPct = dual
      ? Math.max(track.incomeSpousePriority || 0, track.incomeSpouseGeneral || 0, track.incomeLottery || 0)
      : Math.max(track.incomePriority || 0, track.incomeGeneral || 0, track.incomeLottery || 0);
    const th = incomeThreshold(YEAR, hh, maxPct);
    const label = track.incomeSelfOnly ? "본인·1인" : `${dual ? "맞벌이" : "외벌이"}·${hh}인`;
    if (p.monthlyIncome > th) fails.push(`월소득 ${fmt(p.monthlyIncome)} > 상한 ${fmt(th)} (${maxPct}%·${label})`);
    else {
      const pPct = dual ? track.incomeSpousePriority : track.incomePriority;
      if (pPct) notes.push(p.monthlyIncome <= incomeThreshold(YEAR, hh, pPct) ? `우선공급 소득기준(${pPct}%) 충족` : "우선공급 초과 — 일반/추첨 구간");
    }
  }

  if (track.category === "분양" && p.maritalStatus === "married" && track.target !== "일반") notes.push("부부 중복청약 시 선접수 1건만 유효(참고)");
  if (track.note) notes.push(track.note);

  if (fails.length) return { status: "NO", reasons: fails, notes };
  if (p.maritalStatus === "engaged" && track.requireNewlywed) return { status: "COND", reasons: notes.filter(n => n.includes("예비신혼")), notes: notes.filter(n => !n.includes("예비신혼")) };
  return { status: "OK", reasons: notes.slice(0, 1), notes: notes.slice(1) };
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
// UI 레이어 (v4 — 하단 5탭 네이티브 스타일)
// ============================================================

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const CHEV = '<svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>';

const TARGET_ORDER = ["일반", "생애최초", "신혼", "청년", "다자녀", "노부모", "신생아"];
const orderTracks = list => [...list].sort((x, y) => TARGET_ORDER.indexOf(x.target) - TARGET_ORDER.indexOf(y.target));
const TRACKS_ORDERED = orderTracks(TRACKS);
let currentRegion = "서울";
let currentCat = "all";
let lastNotices = [];
let newlywedOnly = 0;

// --- 탭 전환 ---------------------------------------------------

function showView(id) {
  $$(".view").forEach(v => v.classList.toggle("active", v.id === id));
  $$(".tb").forEach(b => b.classList.toggle("on", b.dataset.view === id));
  $("#ctaBar").classList.toggle("show", id === "v-profile");
  window.scrollTo({ top: 0 });
}

// --- 세그먼트 ---------------------------------------------------

function setupSeg(id) {
  const g = document.getElementById(id);
  g.querySelectorAll("button").forEach(btn => btn.addEventListener("click", () => {
    g.querySelectorAll("button").forEach(b => b.classList.remove("on"));
    btn.classList.add("on");
    if (id === "regionSeg") {
      currentRegion = btn.dataset.val === "기타" ? "서울" : btn.dataset.val;
      $$(".chip[data-region]").forEach(c => c.classList.toggle("on", c.dataset.region === currentRegion));
    }
  }));
}
const segVal = id => document.querySelector(`#${id} button.on`).dataset.val;
const segSet = (id, v) => document.getElementById(id).querySelectorAll("button").forEach(b => b.classList.toggle("on", b.dataset.val === v));

// --- 프로필 ------------------------------------------------------

function collectProfile() {
  return {
    maritalStatus: segVal("maritalSeg"),
    marriageYears: +$("#marriageYears").value || 0,
    hasChildUnder6: $("#hasChildUnder6").checked,
    region: segVal("regionSeg"),
    householdSize: +$("#householdSize").value || 1,
    age: +$("#applicantAge").value || 0,
    isDualIncome: $("#isDualIncome").checked,
    monthlyIncome: parseAmount($("#monthlyIncome").value),
    totalAsset: parseAmount($("#totalAsset").value),
    vehicleAsset: parseAmount($("#vehicleAsset").value),
    isHomeless: $("#isHomeless").checked,
    hasSmallCheapHouse: $("#hasSmallCheapHouse").checked,
    smallHouseType: segVal("smallHouseTypeSeg"),
    smallHouseArea: +$("#smallHouseArea").value || 0,
    smallHousePrice: parseAmount($("#smallHousePrice").value),
    smallHouseMetro: $("#smallHouseMetro").checked,
    spUsedCount: +$("#spUsedCount").value || 0,
    propertyDisposed: $("#propertyDisposed").checked,
    newbornWithin2y: $("#newbornWithin2y").checked,
    childCount: +$("#childCount").value || 0,
    oldParentSupport: $("#oldParentSupport").checked,
    noHouseHistory: $("#noHouseHistory").checked,
    taxYears5: $("#taxYears5").checked,
    bankMonths: +$("#bankMonths").value || 0,
    spouseBankMonths: +$("#spouseBankMonths").value || 0,
    interestedPrice: parseAmount($("#interestedPrice").value),
    interestedArea: +$("#interestedArea").value || 0
  };
}

// --- 카드 ---------------------------------------------------------

function card({ status, title, tags = [], meta = [], reasons = [], notes = [], link = null }) {
  const m = STATUS_META[status];
  // 불가/조건부/확인필요 사유는 카드 본문에 바로 노출
  const why = (status === "NO" || status === "COND" || status === "CHECK") && reasons.length
    ? `<ul class="why ${status}">${reasons.map(r => `<li>${r}</li>`).join("")}</ul>`
    : (status === "OK" ? `<div class="why-ok">✓ 모든 필수조건 충족${reasons.length ? " · " + reasons[0] : ""}</div>` : "");
  const extra = (status === "OK" ? reasons.slice(1) : []).concat(notes);
  const hasDetail = extra.length || link;
  return `
  <div class="card status-${status}">
    <div class="card-head ${hasDetail ? "" : "no-detail"}">
      <div class="info">
        <div class="card-title">${title}</div>
        <div class="card-meta">${tags.map(t => `<span class="tag">${t}</span>`).join("")}${meta.map(x => `<span>${x}</span>`).join("")}</div>
      </div>
      <span class="pill ${status}">${m.label}</span>
      ${hasDetail ? CHEV : ""}
    </div>
    ${why}
    ${hasDetail ? `<div class="card-detail">
      ${extra.length ? `<ul class="reason-list">${extra.map(r => `<li>${r}</li>`).join("")}</ul>` : ""}
      ${link ? `<div class="link-row"><a href="${link}" target="_blank" rel="noopener">공고 원문 보기 →</a></div>` : ""}
    </div>` : ""}
  </div>`;
}
function bindCards(root) {
  root.querySelectorAll(".card-head").forEach(h => h.addEventListener("click", () => h.closest(".card").classList.toggle("open")));
}

// --- 공고 ----------------------------------------------------------

async function loadNotices(region) {
  $("#noticesList").innerHTML = '<div class="loading">청약홈에서 공고를 가져오는 중…</div>';
  $("#homeNotices").innerHTML = '<div class="loading">불러오는 중…</div>';
  try {
    const r = await fetch(`${API_BASE}/notices?region=${encodeURIComponent(region)}&newlywed=${newlywedOnly}`);
    if (!r.ok) throw new Error(r.status);
    lastNotices = (await r.json()).notices || [];
  } catch (e) {
    lastNotices = [];
    $("#noticesList").innerHTML = '<div class="error">공고 조회 실패 — 새로고침해 주세요.</div>';
    $("#homeNotices").innerHTML = '<div class="error">공고 조회 실패</div>';
    return;
  }
  renderNotices(collectProfile());
}

function renderNotices(p) {
  const counts = { OK: 0, COND: 0, CHECK: 0, NO: 0 };
  const items = lastNotices.map(n => {
    const v = evaluateNotice(n, p);
    counts[v.status]++;
    return { n, v };
  });
  $("#statOk").textContent = counts.OK;
  $("#statNo").textContent = counts.NO;
  $("#statCheck").textContent = counts.CHECK;
  $("#homeRegionLabel").textContent = currentRegion;

  const html = items.map(({ n, v }) => {
    const no = n.주택관리번호 || n.공고번호;
    return card({
      status: v.status, title: n.단지명, tags: [n.공급유형],
      meta: [n.지역, `${n.공급규모}세대`, `접수 ${n.접수시작}~${n.접수종료}`],
      reasons: v.reasons, notes: v.notes || [], link: n.공고URL
    }).replace('<div class="card-detail">', `<div class="detail-slot" data-no="${no}"><div class="detail-loading">공고문 자동조회 중…</div></div><div class="card-detail">`);
  });
  const list = $("#noticesList"), home = $("#homeNotices");
  if (!items.length) {
    list.innerHTML = home.innerHTML = '<div class="empty">현재 이 지역에 신혼 관련 공고가 없습니다.</div>';
    return;
  }
  list.innerHTML = html.join(""); bindCards(list);
  home.innerHTML = html.slice(0, 3).join(""); bindCards(home);
  loadNoticeDetails(items, p);
}


// --- 공고 상세(주택형별 분양가·면적·신혼특공 세대) 자동 로드 -------------

const detailCache = {};
async function loadNoticeDetails(items, p) {
  for (const { n } of items) {
    const no = n.주택관리번호 || n.공고번호;
    const slots = $$(`.detail-slot[data-no="${no}"]`);
    if (!slots.length) continue;
    try {
      if (!detailCache[no]) {
        const r = await fetch(`${API_BASE}/notice-detail?houseManageNo=${encodeURIComponent(no)}`);
        if (!r.ok) throw new Error(r.status);
        detailCache[no] = (await r.json()).models || [];
      }
      const html = detailHTML(detailCache[no], n, p);
      slots.forEach(s => { s.innerHTML = html; });
    } catch (e) {
      slots.forEach(s => { s.innerHTML = '<div class="detail-err">공고 상세를 불러오지 못했습니다.</div>'; });
    }
  }
}

function detailHTML(models, n, p) {
  if (!models.length) return '<div class="detail-err">주택형 정보 없음</div>';
  const isSinhon = (n.공급유형 || "").includes("신혼희망타운");
  const totalNw = models.reduce((s, m) => s + (isSinhon ? (m.특별공급합계 + m.일반공급) : m.신혼부부), 0);
  const rows = models.map(m => {
    const loanOk = m.분양최고가 <= YOUTH_DREAM_LOAN.maxSupplyPrice && m.공급면적 <= YOUTH_DREAM_LOAN.maxExclusiveArea;
    const nw = isSinhon ? (m.특별공급합계 + m.일반공급) : m.신혼부부;
    return `<tr>
      <td>${m.주택형.replace(/^0+/, "").replace(/\.0+/, "")}</td>
      <td>${m.공급면적.toFixed(1)}㎡</td>
      <td class="num">₩${m.분양최고가.toLocaleString("ko-KR")}</td>
      <td class="num">${nw}</td>
      <td>${loanOk ? '<span class="ok-mark">가능</span>' : '<span class="no-mark">불가</span>'}</td>
    </tr>`;
  }).join("");
  return `
    <div class="detail-head">
      <b>공고문 자동조회</b>
      <span>${isSinhon ? "신혼희망타운 전체" : "신혼부부 특공"} <strong>${totalNw}</strong>세대 · 주택형 ${models.length}개</span>
    </div>
    <table class="mdl">
      <thead><tr><th>주택형</th><th>면적</th><th>분양최고가</th><th>신혼</th><th>드림대출</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

// --- 유형별 --------------------------------------------------------

function renderTracks(p) {
  const results = TRACKS_ORDERED.map(t => ({ t, r: evaluateTrack(t, p) }));
  const c = { OK: 0, COND: 0, CHECK: 0, NO: 0 };
  results.forEach(x => c[x.r.status]++);
  $("#kpiOk").textContent = c.OK; $("#kpiCond").textContent = c.COND; $("#kpiNo").textContent = c.NO;

  const box = $("#results");
  box.innerHTML = results.filter(x => currentCat === "all" || x.t.target === currentCat).map(x => card({
    status: x.r.status, title: x.t.name, tags: [x.t.target, x.t.category],
    meta: x.t.regionOnly ? [`${x.t.regionOnly} 한정`] : [], reasons: x.r.reasons, notes: x.r.notes || []
  })).join("");
  bindCards(box);

  const score = Math.round((c.OK + c.COND * .5) / TRACKS_ORDERED.length * 100);
  $("#matchScore").textContent = score;
  $("#scoreRing").style.background = `conic-gradient(#fff 0 ${score}%, rgba(255,255,255,.22) ${score}%)`;
  if (c.OK >= 5) { $("#heroTitle").innerHTML = "신청 가능성이<br>높습니다"; $("#heroSub").textContent = `9개 트랙 중 ${c.OK}개 신청가능. 공고 탭에서 단지별 판정을 확인하세요.`; }
  else if (c.OK + c.COND >= 3) { $("#heroTitle").innerHTML = "일부 트랙에서<br>신청 가능합니다"; $("#heroSub").textContent = `신청가능 ${c.OK}개 · 조건부 ${c.COND}개. 유형별 탭에서 상세 확인.`; }
  else { $("#heroTitle").innerHTML = "필수조건을<br>다시 확인하세요"; $("#heroSub").textContent = "무주택·혼인·소득·자산 중 미충족 항목이 있습니다. 카드의 사유를 확인하세요."; }
}

function renderRef(p) {
  const b = calculateBankScore(p.bankMonths, p.spouseBankMonths);
  $("#bankScoreCard").innerHTML = `<b>청약통장 가점</b> <small>민영 일반공급 · 17점 만점</small><br>본인 ${b.applicantScore}점 + 배우자 가산 ${b.spouseBonus}점 = <b>${b.totalBankScore}점</b>`;
  const y = evaluateYouthDreamLoan(p);
  $("#youthLoanCard").innerHTML = y.eligible
    ? `<b>청년 주택드림 대출 연계 가능</b><br>최대 LTV ${Math.round(y.maxLtv * 100)}% · 최저 연 ${y.estimatedMinInterestRate}%`
    : y.pending ? `<b>청년 주택드림 대출 — 판정 보류</b><br>${y.reason}` : `<b>청년 주택드림 대출 연계 불가</b><br>${y.reason}`;
}

function renderScenarios(base) {
  const sc = [["before", "① 혼인신고 전"], ["after", "② 혼인신고 후"], ["newborn", "③ 출산·임신 후"]];
  $("#scenarioScroll").innerHTML = sc.map(([k, label]) => {
    const p = applyScenario(base, k);
    const rows = TRACKS_ORDERED.map(t => `<div class="scenario-row"><span>${t.name}</span><span class="dot ${evaluateTrack(t, p).status}"></span></div>`).join("");
    return `<div class="scenario-col"><h3>${label}</h3>${rows}</div>`;
  }).join("");
}

// --- 기준표 --------------------------------------------------------

const pctTxt = (a, b) => a == null ? "—" : `${a}%` + (b != null ? ` · 맞벌이 ${b}%` : "");
const wonTxt = n => n == null ? "제한 없음" : "₩" + Number(n).toLocaleString("ko-KR");

let currentRuleCat = "all";

function renderRules(p) {
  const W = n => "₩" + Number(n).toLocaleString("ko-KR");
  const mk = ok => ok === null ? '<span class="mk na">–</span>' : ok ? '<span class="mk ok">✓</span>' : '<span class="mk no">✗</span>';
  const row = (lbl, stdMain, stdSub, meMain, meSub, ok) =>
    `<div class="cmp-row ${ok === false ? "miss" : ""}">
       <div class="cmp-lbl">${lbl}</div>
       <div class="cmp-std"><small>기준</small>${stdMain}${stdSub ? `<br><small>${stdSub}</small>` : ""}</div>
       <div class="cmp-me"><small>내 조건</small>${meMain}${meSub ? `<br><small>${meSub}</small>` : ""}</div>
       <div>${mk(ok)}</div>
     </div>`;
  const marital = { single: "미혼", engaged: "예비신혼", married: "기혼" }[p.maritalStatus];

  $("#rulesCards").innerHTML = TRACKS_ORDERED
    .filter(t => currentRuleCat === "all" || t.target === currentRuleCat)
    .map(t => {
      const v = evaluateTrack(t, p);
      const rows = [];

      if (t.requireNewlywed) {
        let ok = p.maritalStatus === "single" ? false : p.maritalStatus === "engaged" ? t.allowEngaged : (p.marriageYears <= t.marriageYears || (t.allowNewbornOver7y && p.hasChildUnder6));
        rows.push(row("혼인", `${t.marriageYears}년 이내`, t.allowEngaged ? "예비신혼 가능" : "예비신혼 불가", marital, p.maritalStatus === "married" ? `${p.marriageYears}년` : "", ok));
      }
      if (t.requireSingle) rows.push(row("혼인", "미혼(혼인 중 아님)", "", marital, "", p.maritalStatus === "single"));
      if (t.ageMin != null) rows.push(row("연령", `만 ${t.ageMin}~${t.ageMax}세`, "", `만 ${p.age}세`, "", p.age >= t.ageMin && p.age <= t.ageMax));
      if (t.requireChildren) rows.push(row("자녀", `미성년 ${t.requireChildren}명 이상`, "", `${p.childCount}명`, "", p.childCount >= t.requireChildren));
      if (t.requireOldParent) rows.push(row("부양", "65세↑ 직계존속 3년", "세대주", p.oldParentSupport ? "부양 중" : "해당 없음", "", p.oldParentSupport));
      if (t.requireNewborn) rows.push(row("출산", "2년 이내 출생", "", p.newbornWithin2y ? "해당" : "없음", "", p.newbornWithin2y));
      if (t.requireLifeFirst) {
        rows.push(row("소유이력", "세대원 전원 없음", "", p.noHouseHistory ? "없음" : "있음", "", p.noHouseHistory));
        rows.push(row("소득세", "5년 이상 납부", "", p.taxYears5 ? "충족" : "미충족", "", p.taxYears5));
      }

      const dual = t.incomeSelfOnly ? false : p.isDualIncome;
      const hh = t.incomeSelfOnly ? 1 : p.householdSize;
      const dlabel = t.incomeSelfOnly ? "본인·1인" : `${dual ? "맞벌이" : "외벌이"}·${hh}인`;
      const pPct = dual ? t.incomeSpousePriority : t.incomePriority;
      if (pPct) {
        const th = incomeThreshold(YEAR, hh, pPct);
        rows.push(row("소득·우선", W(th), `${pPct}% · ${dlabel}`, W(p.monthlyIncome), "월소득", p.monthlyIncome <= th));
      }
      const gPct = Math.max(dual ? (t.incomeSpouseGeneral || 0) : (t.incomeGeneral || 0), t.incomeLottery || 0);
      if (gPct && gPct !== pPct) {
        const th = incomeThreshold(YEAR, hh, gPct);
        rows.push(row("소득·상한", W(th), `${gPct}% · ${dlabel}`, W(p.monthlyIncome), "월소득", p.monthlyIncome <= th));
      }
      if (!pPct && !gPct) rows.push(row("소득", "제한 없음", "", W(p.monthlyIncome), "", null));

      rows.push(row("총자산", t.assetLimit ? W(t.assetLimit) + " 이하" : "제한 없음", "", W(p.totalAsset), "", t.assetLimit ? p.totalAsset <= t.assetLimit : null));
      rows.push(row("자동차", t.vehicleLimit ? W(t.vehicleLimit) + " 이하" : "제한 없음", "", W(p.vehicleAsset), "", t.vehicleLimit ? p.vehicleAsset <= t.vehicleLimit : null));

      let homeOk = p.isHomeless, homeMe = p.isHomeless ? "무주택" : "유주택";
      if (!p.isHomeless && p.hasSmallCheapHouse) {
        const ex = isSmallCheapHouseEligible(p.smallHouseType, p.smallHouseArea, p.smallHousePrice, p.smallHouseMetro);
        homeOk = ex && t.smallCheapHouseException; homeMe = ex ? "소형·저가주택 보유" : "특례 기준 초과";
      } else if (!p.isHomeless && t.id === "general_priv") { homeOk = null; homeMe = "유주택(추첨만)"; }
      rows.push(row("무주택", "세대원 전원 무주택", t.smallCheapHouseException ? "소형·저가 특례 인정" : "", homeMe, "", homeOk));

      if (t.category === "분양" && t.target !== "일반") {
        rows.push(row("특공 이력", "생애 1회", "출산 시 1회 재개방", `${p.spUsedCount}회`, "", p.spUsedCount === 0 || (p.propertyDisposed && p.newbornWithin2y)));
      }
      if (t.regionOnly) rows.push(row("지역", `${t.regionOnly} 한정`, "", p.region, "", p.region === t.regionOnly));

      return `
      <div class="rule-card status-${v.status}">
        <div class="rule-head">
          <div class="info"><h3>${t.name}</h3><div class="sub-line">${t.target} · ${t.category}${t.note ? " · " + t.note : ""}</div></div>
          <span class="pill ${v.status}">${STATUS_META[v.status].label}</span>
        </div>
        <div class="cmp">${rows.join("")}</div>
      </div>`;
    }).join("");
}

// --- 실행 / 저장 ---------------------------------------------------

function runAll() {
  const p = collectProfile();
  renderTracks(p); renderRef(p); renderScenarios(p); renderNotices(p); renderRules(p);
  saveLocal(p);
  showView("v-home");
}
const saveLocal = p => { try { localStorage.setItem("housingMatchProfile", JSON.stringify(p)); } catch (e) {} };
function loadLocal() {
  try {
    const p = JSON.parse(localStorage.getItem("housingMatchProfile") || "null");
    if (!p) return;
    segSet("maritalSeg", p.maritalStatus || "married");
    segSet("regionSeg", p.region || "서울");
    currentRegion = (p.region && p.region !== "기타") ? p.region : "서울";
    segSet("smallHouseTypeSeg", p.smallHouseType || "apartment");
    const set = (id, v) => { $("#" + id).value = v; };
    const chk = (id, v) => { $("#" + id).checked = v; };
    set("marriageYears", p.marriageYears || 0); set("householdSize", p.householdSize || 2); set("applicantAge", p.age || 28);
    set("monthlyIncome", formatAmount(p.monthlyIncome || 0)); set("totalAsset", formatAmount(p.totalAsset || 0)); set("vehicleAsset", formatAmount(p.vehicleAsset || 0));
    set("spUsedCount", p.spUsedCount || 0); set("smallHouseArea", p.smallHouseArea || 59); set("smallHousePrice", formatAmount(p.smallHousePrice || 90000000));
    set("bankMonths", p.bankMonths || 0); set("spouseBankMonths", p.spouseBankMonths || 0);
    set("interestedPrice", p.interestedPrice ? formatAmount(p.interestedPrice) : ""); set("interestedArea", p.interestedArea || "");
    chk("hasChildUnder6", !!p.hasChildUnder6); chk("newbornWithin2y", !!p.newbornWithin2y); chk("isDualIncome", !!p.isDualIncome);
    chk("isHomeless", p.isHomeless !== false); chk("hasSmallCheapHouse", !!p.hasSmallCheapHouse); chk("smallHouseMetro", p.smallHouseMetro !== false);
    chk("propertyDisposed", !!p.propertyDisposed);
    set("childCount", p.childCount || 0); chk("oldParentSupport", !!p.oldParentSupport);
    chk("noHouseHistory", p.noHouseHistory !== false); chk("taxYears5", !!p.taxYears5);
  } catch (e) {}
}

window.addEventListener("DOMContentLoaded", () => {
  $("#appMeta").textContent = `${YEAR} 기준 · 업데이트 ${APP_UPDATED.replace(/-/g, ".")}`;
  ["maritalSeg", "regionSeg", "smallHouseTypeSeg"].forEach(setupSeg);
  ["monthlyIncome", "totalAsset", "vehicleAsset", "smallHousePrice", "interestedPrice"].forEach(setupAmountField);

  const tog = $("#hasSmallCheapHouse"), det = $("#smallHouseDetails");
  const sync = () => { det.hidden = !tog.checked; };
  tog.addEventListener("change", sync);

  loadLocal(); sync();
  $$(".chip[data-region]").forEach(c => c.classList.toggle("on", c.dataset.region === currentRegion));

  $$(".tb").forEach(b => b.addEventListener("click", () => showView(b.dataset.view)));
  $$("[data-goto]").forEach(b => b.addEventListener("click", () => showView(b.dataset.goto)));

  $$(".chip[data-region]").forEach(c => c.addEventListener("click", () => {
    $$(".chip[data-region]").forEach(x => x.classList.remove("on")); c.classList.add("on");
    currentRegion = c.dataset.region; loadNotices(currentRegion);
  }));
  $$(".chip[data-cat]").forEach(c => c.addEventListener("click", () => {
    $$(".chip[data-cat]").forEach(x => x.classList.remove("on")); c.classList.add("on");
    currentCat = c.dataset.cat; renderTracks(collectProfile());
  }));
  $$(".chip[data-rcat]").forEach(c => c.addEventListener("click", () => {
    $$(".chip[data-rcat]").forEach(x => x.classList.remove("on")); c.classList.add("on");
    currentRuleCat = c.dataset.rcat; renderRules(collectProfile());
  }));
  $$(".chip[data-nw]").forEach(c => c.addEventListener("click", () => {
    $$(".chip[data-nw]").forEach(x => x.classList.remove("on")); c.classList.add("on");
    newlywedOnly = +c.dataset.nw; loadNotices(currentRegion);
  }));
  $("#reloadNotices").addEventListener("click", () => loadNotices(currentRegion));
  $("#runBtn").addEventListener("click", runAll);
  $("#resetBtn").addEventListener("click", () => { localStorage.removeItem("housingMatchProfile"); location.reload(); });

  const p = collectProfile();
  renderTracks(p); renderRef(p); renderScenarios(p); renderRules(p);
  loadNotices(currentRegion);
});
