// ============================================================
// housing-match: 자격판정 엔진 + UI 렌더링
// ============================================================

const YEAR = 2026;
const BADGE = {
  OK: { label: "신청가능", cls: "badge-ok" },
  COND: { label: "조건부가능", cls: "badge-cond" },
  CHECK: { label: "확인필요", cls: "badge-check" },
  NO: { label: "신청곤란", cls: "badge-no" }
};

// --- 판정 함수 ---------------------------------------------

function evaluateTrack(track, p) {
  // p = profile: {maritalStatus, marriageYears, hasChildUnder6, region,
  //   householdSize, isDualIncome, monthlyIncome, totalAsset, vehicleAsset,
  //   isHomeless, hasSmallCheapHouse, spUsedCount, propertyDisposed, newbornWithin2y}

  const reasons = [];

  // Step1: 혼인상태·혼인기간 게이트
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

  // 지역 제한
  if (track.regionOnly && p.region !== track.regionOnly) {
    return { status: "NO", reasons: [`${track.regionOnly} 거주자 한정 트랙`] };
  }

  // Step6 EX-1: 특별공급 생애 1회 원칙 (+EX-6 출산 예외)
  if (track.category === "분양" && p.spUsedCount >= 1) {
    if (p.propertyDisposed && p.newbornWithin2y) {
      reasons.push("EX-6: 기당첨 이력 있으나 무주택 전환+2년내 출산으로 1회 재신청 허용");
    } else {
      return { status: "NO", reasons: ["EX-1: 특별공급 생애 1회 원칙 — 기당첨 이력으로 신청 불가"] };
    }
  }

  // Step2: 무주택 게이트 (+ 소형저가주택 특례 분기)
  if (!p.isHomeless) {
    if (p.hasSmallCheapHouse && track.smallCheapHouseException) {
      reasons.push("EX-8: 소형·저가주택 1채 보유 — 민영주택 한정 무주택 인정 특례 적용");
    } else if (p.hasSmallCheapHouse && !track.smallCheapHouseException) {
      return { status: "NO", reasons: ["공공 트랙은 소형·저가주택 보유자도 유주택자로 분류 — 신청 불가"] };
    } else {
      return { status: "NO", reasons: ["무주택 세대구성원 요건 미충족"] };
    }
  }

  // Step3: 자산 게이트
  if (track.vehicleLimit && p.vehicleAsset > track.vehicleLimit) {
    return { status: "NO", reasons: [`자동차가액 초과 (기준 ${fmt(track.vehicleLimit)} 이하)`] };
  }
  let assetLimit = track.assetLimit;
  if (assetLimit && p.totalAsset > assetLimit) {
    return { status: "NO", reasons: [`총자산/부동산 기준 초과 (기준 ${fmt(assetLimit)} 이하)`] };
  }

  // Step3: 소득 게이트 — 트랙별 최상위 허용 percent까지 확인
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
    // 우선공급 통과 여부 별도 표시
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

  // EX-7 정보성 경고 (배제 아님)
  if (track.category === "분양" && p.maritalStatus === "married") {
    reasons.push("EX-7: 부부 중복청약 시 선접수 1건만 유효 처리됨(참고)");
  }

  if (p.maritalStatus === "engaged") {
    return { status: "COND", reasons };
  }
  return { status: "OK", reasons };
}

function fmt(n) {
  return "₩" + Number(n).toLocaleString("ko-KR");
}

// --- 시나리오 프리셋 -----------------------------------------

function applyScenario(profile, scenario) {
  const p = { ...profile };
  if (scenario === "before") {
    p.maritalStatus = "single";
  } else if (scenario === "after") {
    p.maritalStatus = "married";
    p.marriageYears = 0;
    p.hasChildUnder6 = false;
    p.newbornWithin2y = false;
  } else if (scenario === "newborn") {
    p.maritalStatus = "married";
    p.marriageYears = 0;
    p.hasChildUnder6 = true;
    p.newbornWithin2y = true;
  }
  return p;
}

// --- 렌더링 ---------------------------------------------------

function collectProfile() {
  return {
    maritalStatus: document.getElementById("maritalStatus").value,
    marriageYears: Number(document.getElementById("marriageYears").value || 0),
    hasChildUnder6: document.getElementById("hasChildUnder6").checked,
    region: document.getElementById("region").value,
    householdSize: Number(document.getElementById("householdSize").value || 1),
    isDualIncome: document.getElementById("isDualIncome").checked,
    monthlyIncome: Number(document.getElementById("monthlyIncome").value || 0) * 10000,
    totalAsset: Number(document.getElementById("totalAsset").value || 0) * 10000,
    vehicleAsset: Number(document.getElementById("vehicleAsset").value || 0) * 10000,
    isHomeless: document.getElementById("isHomeless").checked,
    hasSmallCheapHouse: document.getElementById("hasSmallCheapHouse").checked,
    spUsedCount: Number(document.getElementById("spUsedCount").value || 0),
    propertyDisposed: document.getElementById("propertyDisposed").checked,
    newbornWithin2y: document.getElementById("newbornWithin2y").checked
  };
}

function renderResults(profile) {
  const container = document.getElementById("results");
  container.innerHTML = "";
  TRACKS.forEach(track => {
    const result = evaluateTrack(track, profile);
    const badge = BADGE[result.status];
    const card = document.createElement("div");
    card.className = "track-card";
    card.innerHTML = `
      <div class="track-head">
        <span class="track-name">${track.name}</span>
        <span class="badge ${badge.cls}">${badge.label}</span>
      </div>
      <div class="track-cat">${track.category}${track.regionOnly ? " · " + track.regionOnly + " 한정" : ""}</div>
      <ul class="reasons">
        ${result.reasons.map(r => `<li>${r}</li>`).join("")}
      </ul>
    `;
    container.appendChild(card);
  });
}

function renderScenarioCompare(baseProfile) {
  const scenarios = [
    { key: "before", label: "① 혼인신고 전" },
    { key: "after", label: "② 혼인신고 후" },
    { key: "newborn", label: "③ 출산·임신 후" }
  ];
  const table = document.getElementById("scenarioTable");
  let html = "<tr><th>트랙</th>" + scenarios.map(s => `<th>${s.label}</th>`).join("") + "</tr>";
  TRACKS.forEach(track => {
    html += `<tr><td>${track.name}</td>`;
    scenarios.forEach(s => {
      const p = applyScenario(baseProfile, s.key);
      const r = evaluateTrack(track, p);
      const badge = BADGE[r.status];
      html += `<td><span class="badge ${badge.cls} small">${badge.label}</span></td>`;
    });
    html += "</tr>";
  });
  table.innerHTML = html;
}

function runAll() {
  const profile = collectProfile();
  renderResults(profile);
  renderScenarioCompare(profile);
  saveLocal(profile);
}

// --- 로컬 저장(브라우저) --------------------------------------

function saveLocal(profile) {
  try {
    localStorage.setItem("housingMatchProfile", JSON.stringify(profile));
  } catch (e) { /* ignore */ }
}
function loadLocal() {
  try {
    const raw = localStorage.getItem("housingMatchProfile");
    if (!raw) return;
    const p = JSON.parse(raw);
    document.getElementById("maritalStatus").value = p.maritalStatus || "single";
    document.getElementById("marriageYears").value = p.marriageYears || 0;
    document.getElementById("hasChildUnder6").checked = !!p.hasChildUnder6;
    document.getElementById("region").value = p.region || "서울";
    document.getElementById("householdSize").value = p.householdSize || 2;
    document.getElementById("isDualIncome").checked = !!p.isDualIncome;
    document.getElementById("monthlyIncome").value = (p.monthlyIncome || 0) / 10000;
    document.getElementById("totalAsset").value = (p.totalAsset || 0) / 10000;
    document.getElementById("vehicleAsset").value = (p.vehicleAsset || 0) / 10000;
    document.getElementById("isHomeless").checked = p.isHomeless !== false;
    document.getElementById("hasSmallCheapHouse").checked = !!p.hasSmallCheapHouse;
    document.getElementById("spUsedCount").value = p.spUsedCount || 0;
    document.getElementById("propertyDisposed").checked = !!p.propertyDisposed;
    document.getElementById("newbornWithin2y").checked = !!p.newbornWithin2y;
  } catch (e) { /* ignore */ }
}

window.addEventListener("DOMContentLoaded", () => {
  loadLocal();
  document.getElementById("runBtn").addEventListener("click", runAll);
  runAll();
});
