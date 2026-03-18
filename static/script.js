const tickerInput = document.getElementById("tickerInput");
const analyzeBtn = document.getElementById("analyzeBtn");
const statusText = document.getElementById("statusText");
const resultSection = document.getElementById("resultSection");

const companyName = document.getElementById("companyName");
const tickerName = document.getElementById("tickerName");
const gradeBadge = document.getElementById("gradeBadge");
const commentText = document.getElementById("commentText");
const scoreValue = document.getElementById("scoreValue");
const priceValue = document.getElementById("priceValue");
const changeValue = document.getElementById("changeValue");
const dateValue = document.getElementById("dateValue");
const reasonList = document.getElementById("reasonList");
const indicatorGrid = document.getElementById("indicatorGrid");

const recentTickersEl = document.getElementById("recentTickers");
const clearRecentBtn = document.getElementById("clearRecentBtn");

const loadTop10Btn = document.getElementById("loadTop10Btn");
const top10Status = document.getElementById("top10Status");
const top10Grid = document.getElementById("top10Grid");

const RECENT_STORAGE_KEY = "chartin_recent_tickers";

analyzeBtn.addEventListener("click", analyzeTicker);
tickerInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
        analyzeTicker();
    }
});

if (clearRecentBtn) {
    clearRecentBtn.addEventListener("click", clearRecentTickers);
}

if (loadTop10Btn) {
    loadTop10Btn.addEventListener("click", loadTop10);
}

window.addEventListener("load", () => {
    renderRecentTickers();
    analyzeTicker();
});

function setStatus(message, isError = false) {
    statusText.textContent = message;
    statusText.classList.toggle("error", isError);
}

function setLoading(isLoading) {
    analyzeBtn.disabled = isLoading;
    analyzeBtn.textContent = isLoading ? "분석중..." : "분석하기";
}

function formatNumber(value, digits = 2) {
    if (value === null || value === undefined || Number.isNaN(value)) {
        return "-";
    }
    return Number(value).toLocaleString("en-US", {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits
    });
}

function formatPercent(value) {
    if (value === null || value === undefined || Number.isNaN(value)) {
        return "-";
    }
    const sign = value > 0 ? "+" : "";
    return `${sign}${Number(value).toFixed(2)}%`;
}

function gradeClassName(grade) {
    const map = {
        "Strong Buy": "grade-strong-buy",
        "Buy": "grade-buy",
        "Hold": "grade-hold",
        "Sell": "grade-sell",
        "Strong Sell": "grade-strong-sell"
    };
    return map[grade] || "";
}

function getStoredRecentTickers() {
    try {
        const raw = localStorage.getItem(RECENT_STORAGE_KEY);
        return raw ? JSON.parse(raw) : [];
    } catch (e) {
        return [];
    }
}

function saveStoredRecentTickers(list) {
    localStorage.setItem(RECENT_STORAGE_KEY, JSON.stringify(list));
}

function normalizeTicker(ticker) {
    return ticker.trim().toUpperCase();
}

function addRecentTicker(ticker) {
    const symbol = normalizeTicker(ticker);
    if (!symbol) return;

    let recent = getStoredRecentTickers();
    recent = recent.filter(item => item !== symbol);
    recent.unshift(symbol);
    recent = recent.slice(0, 5);

    saveStoredRecentTickers(recent);
    renderRecentTickers();
}

function removeRecentTicker(ticker) {
    const symbol = normalizeTicker(ticker);
    const recent = getStoredRecentTickers().filter(item => item !== symbol);
    saveStoredRecentTickers(recent);
    renderRecentTickers();
}

function clearRecentTickers() {
    localStorage.removeItem(RECENT_STORAGE_KEY);
    renderRecentTickers();
}

function renderRecentTickers() {
    if (!recentTickersEl) return;

    recentTickersEl.innerHTML = "";
    const recent = getStoredRecentTickers();

    if (!recent.length) {
        const span = document.createElement("span");
        span.className = "empty-chip";
        span.textContent = "아직 최근 검색이 없어요.";
        recentTickersEl.appendChild(span);
        return;
    }

    recent.forEach((ticker) => {
        const wrap = document.createElement("div");
        wrap.className = "ticker-chip-wrap";

        const tickerBtn = document.createElement("button");
        tickerBtn.className = "ticker-chip";
        tickerBtn.type = "button";
        tickerBtn.textContent = ticker;
        tickerBtn.addEventListener("click", () => {
            tickerInput.value = ticker;
            analyzeTicker();
        });

        const deleteBtn = document.createElement("button");
        deleteBtn.className = "ticker-delete-btn";
        deleteBtn.type = "button";
        deleteBtn.textContent = "✕";
        deleteBtn.addEventListener("click", () => {
            removeRecentTicker(ticker);
        });

        wrap.appendChild(tickerBtn);
        wrap.appendChild(deleteBtn);
        recentTickersEl.appendChild(wrap);
    });
}

async function analyzeTicker() {
    const ticker = tickerInput.value.trim().toUpperCase();

    if (!ticker) {
        setStatus("티커를 입력하세요.", true);
        return;
    }

    try {
        setLoading(true);
        setStatus("데이터를 불러오는 중입니다...");
        const response = await fetch(`/api/analyze/${encodeURIComponent(ticker)}`);
        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || "분석 실패");
        }

        renderSummary(data);
        renderReasons(data.reasons);
        renderIndicators(data.indicators);
        renderPriceChart(data.chart, data.ticker);
        renderMacdChart(data.chart);
        renderOscillatorChart(data.chart);

        addRecentTicker(data.ticker || ticker);

        resultSection.classList.remove("hidden");
        setStatus(`${data.company_name} (${data.ticker || ticker}) 분석 완료`);
    } catch (error) {
        resultSection.classList.add("hidden");
        setStatus(error.message || "오류가 발생했습니다.", true);
    } finally {
        setLoading(false);
    }
}

function renderSummary(data) {
    companyName.textContent = data.company_name;
    tickerName.textContent = data.ticker;

    gradeBadge.textContent = data.summary.grade;
    gradeBadge.className = `grade-badge ${gradeClassName(data.summary.grade)}`;

    commentText.textContent = data.summary.comment;
    scoreValue.textContent = `${data.summary.score}점`;
    priceValue.textContent = `$${formatNumber(data.summary.close)}`;

    const change = data.summary.change_percent;
    changeValue.textContent = `전일 대비 ${formatPercent(change)}`;
    changeValue.style.color = change >= 0 ? "#16a34a" : "#dc2626";

    dateValue.textContent = data.summary.as_of;
}

function renderReasons(reasons) {
    reasonList.innerHTML = "";
    reasons.forEach((reason) => {
        const li = document.createElement("li");
        li.textContent = reason;
        reasonList.appendChild(li);
    });
}

function renderIndicators(indicators) {
    const i
