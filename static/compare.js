function gradeClass(grade) {
  const g = String(grade || "").toLowerCase();
  if (g === "strong buy") return "grade-strong-buy";
  if (g === "buy") return "grade-buy";
  if (g === "hold") return "grade-hold";
  if (g === "sell") return "grade-sell";
  if (g === "strong sell") return "grade-strong-sell";
  return "";
}

function fmtNumber(value) {
  if (value === null || value === undefined || value === "") return "-";
  const num = Number(value);
  if (Number.isNaN(num)) return value;
  return num.toLocaleString();
}

function fmtPercent(value) {
  if (value === null || value === undefined || value === "") return "-";
  const num = Number(value);
  if (Number.isNaN(num)) return value;
  const sign = num > 0 ? "+" : "";
  return `${sign}${num.toFixed(2)}%`;
}

function fmtPrice(value, currency) {
  if (value === null || value === undefined || value === "") return "-";
  const num = Number(value);
  if (Number.isNaN(num)) return value;
  const prefix = currency === "KRW" ? "₩" : "$";
  return `${prefix}${num.toLocaleString()}`;
}

function showStatus(message, isError = false) {
  const box = document.getElementById("statusBox");
  box.style.display = "block";
  box.textContent = message;
  box.style.background = isError ? "#7f1d1d" : "#1e293b";
  box.style.color = isError ? "#fecaca" : "#cbd5e1";
}

function hideStatus() {
  const box = document.getElementById("statusBox");
  box.style.display = "none";
  box.textContent = "";
}

function renderNews(news = []) {
  if (!news.length) {
    return `<li>뉴스가 없습니다.</li>`;
  }

  return news.map(item => `
    <li>
      <a href="${item.link || '#'}" target="_blank" rel="noopener noreferrer">
        ${item.title || "제목 없음"}
      </a>
      <div class="news-meta">
        ${item.publisher || "-"} ${item.published_at ? `· ${item.published_at}` : ""}
      </div>
      <div>${item.summary || ""}</div>
    </li>
  `).join("");
}

function renderReasons(reasons = []) {
  if (!reasons.length) {
    return `<li>분석 근거가 없습니다.</li>`;
  }
  return reasons.map(reason => `<li>${reason}</li>`).join("");
}

function renderCard(item) {
  const summary = item.summary || {};
  const indicators = item.indicators || {};
  const profile = item.profile || {};
  const reasons = item.reasons || [];
  const news = item.news || [];
  const grade = summary.grade || "-";

  return `
    <article class="card">
      <h2>${item.company_name || "-"}</h2>
      <div class="ticker">${item.display_ticker || item.ticker || "-"} · ${item.market || "-"}</div>

      <div class="badge-row">
        <span class="badge ${gradeClass(grade)}">${grade}</span>
        <span class="badge">점수 ${summary.score ?? "-"}</span>
        <span class="badge">${item.currency || "-"}</span>
      </div>

      <div class="metric-grid">
        <div class="metric">
          <div class="label">현재가</div>
          <div class="value">${fmtPrice(summary.close, item.currency)}</div>
        </div>
        <div class="metric">
          <div class="label">등락률</div>
          <div class="value">${fmtPercent(summary.change_percent)}</div>
        </div>
        <div class="metric">
          <div class="label">시가총액</div>
          <div class="value">${profile.market_cap_text || "-"}</div>
        </div>
        <div class="metric">
          <div class="label">기준일</div>
          <div class="value">${summary.as_of || "-"}</div>
        </div>
        <div class="metric">
          <div class="label">RSI</div>
          <div class="value">${fmtNumber(indicators.rsi)}</div>
        </div>
        <div class="metric">
          <div class="label">MACD</div>
          <div class="value">${fmtNumber(indicators.macd)}</div>
        </div>
        <div class="metric">
          <div class="label">섹터</div>
          <div class="value">${profile.sector || "-"}</div>
        </div>
        <div class="metric">
          <div class="label">산업</div>
          <div class="value">${profile.industry || "-"}</div>
        </div>
      </div>

      <div class="section-title">회사 소개</div>
      <div class="desc">${profile.business_summary || "회사 설명이 없습니다."}</div>

      <div class="section-title">분석 코멘트</div>
      <div class="desc">${summary.comment || "-"}</div>

      <div class="section-title">판단 근거</div>
      <ul class="reason-list">
        ${renderReasons(reasons)}
      </ul>

      <div class="section-title">최신 뉴스</div>
      <ul class="news-list">
        ${renderNews(news)}
      </ul>
    </article>
  `;
}

async function fetchCompare() {
  const s1 = document.getElementById("symbol1").value.trim();
  const s2 = document.getElementById("symbol2").value.trim();
  const s3 = document.getElementById("symbol3").value.trim();

  const symbols = [s1, s2, s3].filter(Boolean);

  if (symbols.length < 2) {
    showStatus("비교할 종목을 2개 이상 입력하세요.", true);
    return;
  }

  showStatus("비교 데이터를 불러오는 중입니다...");
  document.getElementById("compareResult").innerHTML = "";

  try {
    const url = `/api/compare?symbols=${encodeURIComponent(symbols.join(","))}`;
    const res = await fetch(url);
    const data = await res.json();

    if (!res.ok || data.error) {
      throw new Error(data.error || "비교 데이터를 불러오지 못했습니다.");
    }

    const items = data.items || [];
    if (!items.length) {
      throw new Error("비교 결과가 없습니다.");
    }

    document.getElementById("compareResult").innerHTML = items.map(renderCard).join("");
    hideStatus();
  } catch (err) {
    showStatus(err.message || "오류가 발생했습니다.", true);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("compareBtn").addEventListener("click", fetchCompare);

  document.getElementById("symbol1").addEventListener("keydown", (e) => {
    if (e.key === "Enter") fetchCompare();
  });
  document.getElementById("symbol2").addEventListener("keydown", (e) => {
    if (e.key === "Enter") fetchCompare();
  });
  document.getElementById("symbol3").addEventListener("keydown", (e) => {
    if (e.key === "Enter") fetchCompare();
  });

  document.getElementById("symbol1").value = "AAPL";
  document.getElementById("symbol2").value = "삼성전자";
});
