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
    if (p.hasSmallCheapHouse && track.smallCheapHouseException) {
      reasons.push("EX-8: 소형·저가주택 1채 보유 — 민영주택 한정 무주택 인정 특례 적용");
    } else if (p.hasSmallCheapHouse && !track.smallCheapHouseException) {
      return { status: "NO", reasons: ["공공 트랙은 소형·저가주택 보유자도 유주택자로 분류 — 신청 불가"] };
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

// --- 세그먼트 컨트롤 ------------------------------------------

function setupSegmented(id) {
  const group = document.getElementById(id);
  group.querySelectorAll("button").forEach(btn => {
    btn.addEventListener("click", () => {
      group.querySelectorAll("button").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
    });
  });
}
function getSegmentedValue(id) {
  return document.querySelector(`#${id} button.active`).dataset.val;
}
function setSegmentedValue(id, val) {
  const group = document.getElementById(id);
  group.querySelectorAll("button").forEach(b => {
    b.classList.toggle("active", b.dataset.val === val);
  });
}

// --- 프로필 수집 ------------------------------------------------

function collectProfile() {
  return {
    maritalStatus: getSegmentedValue("maritalSeg"),
    marriageYears: Number(document.getElementById("marriageYears").value || 0),
    hasChildUnder6: document.getElementById("hasChildUnder6").checked,
    region: getSegmentedValue("regionSeg"),
    householdSize: Number(document.getElementById("householdSize").value || 1),
    isDualIncome: document.getElementById("isDualIncome").checked,
    monthlyIncome: parseAmount(document.getElementById("monthlyIncome").value),
    totalAsset: parseAmount(document.getElementById("totalAsset").value),
    vehicleAsset: parseAmount(document.getElementById("vehicleAsset").value),
    isHomeless: document.getElementById("isHomeless").checked,
    hasSmallCheapHouse: document.getElementById("hasSmallCheapHouse").checked,
    spUsedCount: Number(document.getElementById("spUsedCount").value || 0),
    propertyDisposed: document.getElementById("propertyDisposed").checked,
    newbornWithin2y: document.getElementById("newbornWithin2y").checked
  };
}

// --- 렌더링 ---------------------------------------------------

function renderSummary(results) {
  const counts = { OK: 0, COND: 0, CHECK: 0, NO: 0 };
  results.forEach(r => counts[r.status]++);
  const strip = document.getElementById("summaryStrip");
  strip.innerHTML = `
    <div class="summary-chip ok"><span class="n">${counts.OK}</span>신청가능</div>
    <div class="summary-chip cond"><span class="n">${counts.COND}</span>조건부</div>
    <div class="summary-chip check"><span class="n">${counts.CHECK}</span>확인필요</div>
    <div class="summary-chip no"><span class="n">${counts.NO}</span>신청곤란</div>
  `;
}

function renderResults(profile) {
  const container = document.getElementById("results");
  container.innerHTML = "";
  const results = [];

  TRACKS.forEach(track => {
    const result = evaluateTrack(track, profile);
    results.push(result);
    const meta = STATUS_META[result.status];

    const card = document.createElement("div");
    card.className = `track-card status-${result.status}`;
    card.innerHTML = `
      <div class="track-head">
        <div class="status-icon status-${result.status}">${ICONS[result.status]}</div>
        <div class="info">
          <div class="track-name">${track.name}</div>
          <div class="track-meta">${track.category}${track.regionOnly ? " · " + track.regionOnly + " 한정" : ""} · <span class="track-badge-label">${meta.label}</span></div>
        </div>
        ${CHEVRON}
      </div>
      <div class="track-detail">
        <ul>${result.reasons.map(r => `<li>${r}</li>`).join("")}</ul>
      </div>
    `;
    card.querySelector(".track-head").addEventListener("click", () => {
      card.classList.toggle("open");
    });
    container.appendChild(card);
  });

  renderSummary(results);
}

function renderScenarioCompare(baseProfile) {
  const scenarios = [
    { key: "before", label: "① 혼인신고 전" },
    { key: "after", label: "② 혼인신고 후" },
    { key: "newborn", label: "③ 출산·임신 후" }
  ];
  const scroll = document.getElementById("scenarioScroll");
  scroll.innerHTML = "";
  scenarios.forEach(s => {
    const p = applyScenario(baseProfile, s.key);
    const col = document.createElement("div");
    col.className = "scenario-col";
    let rows = "";
    TRACKS.forEach(track => {
      const r = evaluateTrack(track, p);
      rows += `<div class="scenario-row"><span class="name">${track.name}</span><span class="scenario-dot ${r.status}"></span></div>`;
    });
    col.innerHTML = `<h3>${s.label}</h3>${rows}`;
    scroll.appendChild(col);
  });
}

// --- 신규 공고 조회 ---------------------------------------------

async function loadNotices(profile) {
  const list = document.getElementById("noticesList");
  list.innerHTML = '<div class="notice-loading">공고 조회 중…</div>';
  try {
    const res = await fetch(`${API_BASE}/notices?region=${encodeURIComponent(profile.region)}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (!data.notices || data.notices.length === 0) {
      list.innerHTML = '<div class="notice-empty">현재 조건에 맞는 신혼 관련 공고가 없습니다.</div>';
      return;
    }
    list.innerHTML = data.notices.map((n, idx) => {
      const verdict = evaluateNotice(n, profile);
      const meta = STATUS_META[verdict.status];
      return `
      <div class="track-card status-${verdict.status}">
        <div class="track-head" data-notice-idx="${idx}">
          <div class="status-icon status-${verdict.status}">${ICONS[verdict.status]}</div>
          <div class="info">
            <div class="track-name">${n.단지명}</div>
            <div class="track-meta">${n.지역} · ${n.공급유형} · <span class="track-badge-label">${meta.label}</span></div>
          </div>
          ${CHEVRON}
        </div>
        <div class="track-detail">
          <ul>
            ${verdict.reasons.map(r => `<li>${r}</li>`).join("")}
            <li>공급규모 ${n.공급규모}세대 · 접수 ${n.접수시작}~${n.접수종료} · 당첨발표 ${n.당첨자발표일}</li>
          </ul>
          <div style="padding:0 14px 12px 40px;">
            <a href="${n.공고URL}" target="_blank" rel="noopener" style="font-size:12.5px; color:var(--navy); font-weight:600;">공고 원문 보기 →</a>
          </div>
        </div>
      </div>`;
    }).join("");
    list.querySelectorAll(".track-head").forEach(head => {
      head.addEventListener("click", () => head.closest(".track-card").classList.toggle("open"));
    });
  } catch (e) {
    list.innerHTML = `<div class="notice-error">공고 조회 실패 — 잠시 후 다시 시도해주세요.</div>`;
  }
}

function runAll() {
  const profile = collectProfile();
  renderResults(profile);
  renderScenarioCompare(profile);
  saveLocal(profile);
  loadNotices(profile);
  document.getElementById("resultsPanel").scrollIntoView({ behavior: "smooth", block: "start" });
}

// --- 로컬 저장(브라우저) --------------------------------------

function saveLocal(profile) {
  try { localStorage.setItem("housingMatchProfile", JSON.stringify(profile)); } catch (e) {}
}
function loadLocal() {
  try {
    const raw = localStorage.getItem("housingMatchProfile");
    if (!raw) return;
    const p = JSON.parse(raw);
    setSegmentedValue("maritalSeg", p.maritalStatus || "married");
    document.getElementById("marriageYears").value = p.marriageYears || 0;
    document.getElementById("hasChildUnder6").checked = !!p.hasChildUnder6;
    setSegmentedValue("regionSeg", p.region || "서울");
    document.getElementById("householdSize").value = p.householdSize || 2;
    document.getElementById("isDualIncome").checked = !!p.isDualIncome;
    document.getElementById("monthlyIncome").value = formatAmount(p.monthlyIncome || 0);
    document.getElementById("totalAsset").value = formatAmount(p.totalAsset || 0);
    document.getElementById("vehicleAsset").value = formatAmount(p.vehicleAsset || 0);
    document.getElementById("isHomeless").checked = p.isHomeless !== false;
    document.getElementById("hasSmallCheapHouse").checked = !!p.hasSmallCheapHouse;
    document.getElementById("spUsedCount").value = p.spUsedCount || 0;
    document.getElementById("propertyDisposed").checked = !!p.propertyDisposed;
    document.getElementById("newbornWithin2y").checked = !!p.newbornWithin2y;
  } catch (e) {}
}

window.addEventListener("DOMContentLoaded", () => {
  setupSegmented("maritalSeg");
  setupSegmented("regionSeg");
  setupAmountField("monthlyIncome");
  setupAmountField("totalAsset");
  setupAmountField("vehicleAsset");
  loadLocal();
  document.getElementById("runBtn").addEventListener("click", runAll);
  // 첫 카드는 기본적으로 펼쳐서 사용법을 보여줌
  const profile = collectProfile();
  renderResults(profile);
  renderScenarioCompare(profile);
  loadNotices(profile);
  const first = document.querySelector(".track-card");
  if (first) first.classList.add("open");
});
