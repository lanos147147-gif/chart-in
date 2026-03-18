(() => {
    const marketMode = document.body.dataset.market || "us";
    const topEnabled = document.body.dataset.top === "true";

    const tickerInput = document.getElementById("tickerInput");
    const analyzeBtn = document.getElementById("analyzeBtn");
    const statusText = document.getElementById("statusText");
    const resultSection = document.getElementById("resultSection");
    const marketSelect = document.getElementById("marketSelect");
    const krSuggestList = document.getElementById("krSuggestList");

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

    const RECENT_STORAGE_KEY = marketMode === "kr"
        ? "chartin_recent_kr"
        : "chartin_recent_us";

    let currentCurrency = marketMode === "kr" ? "KRW" : "USD";

    if (!tickerInput || !analyzeBtn) {
        return;
    }

    if (analyzeBtn) {
        analyzeBtn.addEventListener("click", analyzeTicker);
    }

    if (tickerInput) {
        tickerInput.addEventListener("keydown", (e) => {
            if (e.key === "Enter") {
                analyzeTicker();
            }
        });
    }

    if (clearRecentBtn) {
        clearRecentBtn.addEventListener("click", clearRecentTickers);
    }

    if (loadTop10Btn && topEnabled) {
        loadTop10Btn.addEventListener("click", loadTop10);
    }

    window.addEventListener("load", () => {
        renderRecentTickers();
        if (tickerInput && tickerInput.value.trim()) {
            analyzeTicker();
        }
    });

    function setStatus(message, isError = false) {
        if (!statusText) return;
        statusText.textContent = message;
        statusText.classList.toggle("error", isError);
    }

    function setLoading(isLoading) {
        if (!analyzeBtn) return;
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

    function formatPrice(value, currency = "USD") {
        if (value === null || value === undefined || Number.isNaN(value)) {
            return "-";
        }

        if (currency === "KRW") {
            return `₩${Number(value).toLocaleString("ko-KR", {
                maximumFractionDigits: 0
            })}`;
        }

        return `$${Number(value).toLocaleString("en-US", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        })}`;
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

    function normalizeRecentTicker(ticker) {
        return String(ticker || "").trim().toUpperCase();
    }

    function addRecentTicker(ticker) {
        const symbol = normalizeRecentTicker(ticker);
        if (!symbol) return;

        let recent = getStoredRecentTickers();
        recent = recent.filter(item => item !== symbol);
        recent.unshift(symbol);
        recent = recent.slice(0, 5);

        saveStoredRecentTickers(recent);
        renderRecentTickers();
    }

    function removeRecentTicker(ticker) {
        const symbol = normalizeRecentTicker(ticker);
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
                if (marketMode === "kr" && marketSelect) {
                    marketSelect.value = ticker.endsWith(".KQ") ? "KQ" : "KS";
                }
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

    function clearKrSuggestions() {
        if (!krSuggestList) return;
        krSuggestList.innerHTML = "";
        krSuggestList.classList.remove("active");
    }

    function renderKrSuggestions(matches) {
        if (!krSuggestList) return;

        krSuggestList.innerHTML = "";
        krSuggestList.classList.add("active");

        matches.forEach((item) => {
            const btn = document.createElement("button");
            btn.className = "kr-suggest-btn";
            btn.type = "button";
            btn.innerHTML = `
                <span class="kr-suggest-name">${item.name}</span>
                <span class="kr-suggest-meta">${item.display_ticker} · ${item.market}</span>
            `;

            btn.addEventListener("click", () => {
                tickerInput.value = item.name;
                if (marketSelect) {
                    marketSelect.value = item.suffix;
                }
                analyzeResolvedKr(item.code, item.suffix);
            });

            krSuggestList.appendChild(btn);
        });
    }

    async function analyzeResolvedKr(code, suffix) {
        try {
            setLoading(true);
            setStatus("선택한 한국 종목을 분석하는 중입니다...");

            const response = await fetch(`/api/analyze/kr/${encodeURIComponent(code)}?market=${encodeURIComponent(suffix)}`);
            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || "분석 실패");
            }

            clearKrSuggestions();
            renderAnalysis(data);
            addRecentTicker(data.display_ticker || data.ticker || code);
        } catch (error) {
            if (resultSection) {
                resultSection.classList.add("hidden");
            }
            setStatus(error.message || "오류가 발생했습니다.", true);
        } finally {
            setLoading(false);
        }
    }

    async function analyzeTicker() {
        const rawTicker = tickerInput.value.trim();

        if (!rawTicker) {
            setStatus("종목명 또는 티커를 입력하세요.", true);
            return;
        }

        try {
            setLoading(true);
            setStatus("데이터를 불러오는 중입니다...");

            let endpoint = "";
            if (marketMode === "kr") {
                const market = marketSelect ? marketSelect.value : "KS";
                endpoint = `/api/analyze/kr/${encodeURIComponent(rawTicker)}?market=${encodeURIComponent(market)}`;
            } else {
                endpoint = `/api/analyze/us/${encodeURIComponent(rawTicker.toUpperCase())}`;
            }

            const response = await fetch(endpoint);
            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || "분석 실패");
            }

            if (marketMode === "kr" && data.need_select) {
                if (resultSection) {
                    resultSection.classList.add("hidden");
                }
                renderKrSuggestions(data.matches || []);
                setStatus("같은 이름의 종목이 여러 개 있어요. 아래에서 선택하세요.");
                return;
            }

            clearKrSuggestions();
            renderAnalysis(data);
            addRecentTicker(data.display_ticker || data.ticker || rawTicker);
        } catch (error) {
            if (resultSection) {
                resultSection.classList.add("hidden");
            }
            setStatus(error.message || "오류가 발생했습니다.", true);
        } finally {
            setLoading(false);
        }
    }

    function renderAnalysis(data) {
        renderSummary(data);
        renderReasons(data.reasons || []);
        renderIndicators(data.indicators || {});
        renderPriceChart(data.chart, data.display_ticker || data.ticker);
        renderMacdChart(data.chart);
        renderOscillatorChart(data.chart);

        if (resultSection) {
            resultSection.classList.remove("hidden");
        }

        setStatus(`${data.company_name} (${data.display_ticker || data.ticker}) 분석 완료`);
    }

    function renderSummary(data) {
        currentCurrency = data.currency || "USD";

        if (companyName) companyName.textContent = data.company_name;
        if (tickerName) tickerName.textContent = `${data.display_ticker || data.ticker} · ${data.market}`;

        if (gradeBadge) {
            gradeBadge.textContent = data.summary.grade;
            gradeBadge.className = `grade-badge ${gradeClassName(data.summary.grade)}`;
        }

        if (commentText) commentText.textContent = data.summary.comment;
        if (scoreValue) scoreValue.textContent = `${data.summary.score}점`;
        if (priceValue) priceValue.textContent = formatPrice(data.summary.close, currentCurrency);

        const change = data.summary.change_percent;
        if (changeValue) {
            changeValue.textContent = `전일 대비 ${formatPercent(change)}`;
            changeValue.style.color = change >= 0 ? "#16a34a" : "#dc2626";
        }

        if (dateValue) dateValue.textContent = data.summary.as_of;
    }

    function renderReasons(reasons) {
        if (!reasonList) return;
        reasonList.innerHTML = "";
        reasons.forEach((reason) => {
            const li = document.createElement("li");
            li.textContent = reason;
            reasonList.appendChild(li);
        });
    }

    function renderIndicators(indicators) {
        if (!indicatorGrid) return;

        const items = [
            { name: "SMA20", value: indicators.sma20, note: "20일 이동평균" },
            { name: "SMA60", value: indicators.sma60, note: "60일 이동평균" },
            { name: "SMA120", value: indicators.sma120, note: "120일 이동평균" },
            { name: "RSI", value: indicators.rsi, note: "30 이하면 과매도, 70 이상 과열" },
            { name: "MACD", value: indicators.macd, note: "시그널 위면 모멘텀 우위" },
            { name: "MACD Signal", value: indicators.macd_signal, note: "MACD 비교 기준선" },
            { name: "Stoch %K", value: indicators.stoch_k, note: "단기 모멘텀" },
            { name: "Stoch %D", value: indicators.stoch_d, note: "스토캐스틱 시그널" },
            { name: "BB High", value: indicators.bb_high, note: "볼린저 상단" },
            { name: "BB Mid", value: indicators.bb_mid, note: "볼린저 중심선" },
            { name: "BB Low", value: indicators.bb_low, note: "볼린저 하단" },
            { name: "Vol Ratio", value: indicators.vol_ratio, note: "현재 거래량 / 20일 평균" }
        ];

        indicatorGrid.innerHTML = "";
        items.forEach((item) => {
            const card = document.createElement("div");
            card.className = "indicator-item";
            card.innerHTML = `
                <div class="indicator-name">${item.name}</div>
                <div class="indicator-value">${formatNumber(item.value)}</div>
                <div class="indicator-note">${item.note}</div>
            `;
            indicatorGrid.appendChild(card);
        });
    }

    function renderPriceChart(chart, ticker) {
        if (!chart || !window.Plotly) return;

        const traces = [
            {
                x: chart.dates,
                open: chart.open,
                high: chart.high,
                low: chart.low,
                close: chart.close,
                type: "candlestick",
                name: ticker,
                increasing: { line: { color: "#ef4444" } },
                decreasing: { line: { color: "#3b82f6" } }
            },
            {
                x: chart.dates,
                y: chart.sma20,
                type: "scatter",
                mode: "lines",
                name: "SMA20",
                line: { color: "#111827", width: 1.8 }
            },
            {
                x: chart.dates,
                y: chart.sma60,
                type: "scatter",
                mode: "lines",
                name: "SMA60",
                line: { color: "#8b5cf6", width: 1.8 }
            },
            {
                x: chart.dates,
                y: chart.bb_high,
                type: "scatter",
                mode: "lines",
                name: "BB High",
                line: { color: "#9ca3af", width: 1.2, dash: "dot" }
            },
            {
                x: chart.dates,
                y: chart.bb_low,
                type: "scatter",
                mode: "lines",
                name: "BB Low",
                line: { color: "#9ca3af", width: 1.2, dash: "dot" }
            }
        ];

        const layout = {
            paper_bgcolor: "#ffffff",
            plot_bgcolor: "#ffffff",
            margin: { t: 10, r: 10, b: 40, l: 45 },
            xaxis: {
                type: "date",
                gridcolor: "#f1f5f9",
                rangeslider: { visible: false }
            },
            yaxis: {
                gridcolor: "#f1f5f9"
            },
            legend: {
                orientation: "h",
                y: 1.08,
                x: 0
            }
        };

        Plotly.newPlot("priceChart", traces, layout, {
            responsive: true,
            displaylogo: false
        });
    }

    function renderMacdChart(chart) {
        if (!chart || !window.Plotly) return;

        const colors = chart.macd_hist.map((v) => (v >= 0 ? "#16a34a" : "#dc2626"));

        const traces = [
            {
                x: chart.dates,
                y: chart.macd_hist,
                type: "bar",
                name: "Histogram",
                marker: { color: colors, opacity: 0.7 }
            },
            {
                x: chart.dates,
                y: chart.macd,
                type: "scatter",
                mode: "lines",
                name: "MACD",
                line: { color: "#2563eb", width: 2 }
            },
            {
                x: chart.dates,
                y: chart.macd_signal,
                type: "scatter",
                mode: "lines",
                name: "Signal",
                line: { color: "#f59e0b", width: 2 }
            }
        ];

        const layout = {
            paper_bgcolor: "#ffffff",
            plot_bgcolor: "#ffffff",
            margin: { t: 10, r: 10, b: 40, l: 45 },
            xaxis: {
                type: "date",
                gridcolor: "#f1f5f9"
            },
            yaxis: {
                gridcolor: "#f1f5f9"
            },
            legend: {
                orientation: "h",
                y: 1.08,
                x: 0
            }
        };

        Plotly.newPlot("macdChart", traces, layout, {
            responsive: true,
            displaylogo: false
        });
    }

    function renderOscillatorChart(chart) {
        if (!chart || !window.Plotly) return;

        const traces = [
            {
                x: chart.dates,
                y: chart.rsi,
                type: "scatter",
                mode: "lines",
                name: "RSI",
                line: { color: "#111827", width: 2 }
            },
            {
                x: chart.dates,
                y: chart.stoch_k,
                type: "scatter",
                mode: "lines",
                name: "Stoch %K",
                line: { color: "#2563eb", width: 2 }
            },
            {
                x: chart.dates,
                y: chart.stoch_d,
                type: "scatter",
                mode: "lines",
                name: "Stoch %D",
                line: { color: "#f97316", width: 2 }
            }
        ];

        const layout = {
            paper_bgcolor: "#ffffff",
            plot_bgcolor: "#ffffff",
            margin: { t: 10, r: 10, b: 40, l: 45 },
            xaxis: {
                type: "date",
                gridcolor: "#f1f5f9"
            },
            yaxis: {
                range: [0, 100],
                gridcolor: "#f1f5f9"
            },
            shapes: [
                {
                    type: "line",
                    xref: "paper",
                    x0: 0,
                    x1: 1,
                    y0: 70,
                    y1: 70,
                    line: { color: "#d1d5db", dash: "dot", width: 1 }
                },
                {
                    type: "line",
                    xref: "paper",
                    x0: 0,
                    x1: 1,
                    y0: 30,
                    y1: 30,
                    line: { color: "#d1d5db", dash: "dot", width: 1 }
                },
                {
                    type: "line",
                    xref: "paper",
                    x0: 0,
                    x1: 1,
                    y0: 80,
                    y1: 80,
                    line: { color: "#e5e7eb", dash: "dot", width: 1 }
                },
                {
                    type: "line",
                    xref: "paper",
                    x0: 0,
                    x1: 1,
                    y0: 20,
                    y1: 20,
                    line: { color: "#e5e7eb", dash: "dot", width: 1 }
                }
            ],
            legend: {
                orientation: "h",
                y: 1.08,
                x: 0
            }
        };

        Plotly.newPlot("oscillatorChart", traces, layout, {
            responsive: true,
            displaylogo: false
        });
    }

    function setTop10Status(message, isError = false) {
        if (!top10Status) return;
        top10Status.textContent = message;
        top10Status.classList.toggle("error", isError);
    }

    function renderTop10(items) {
        if (!top10Grid) return;

        top10Grid.innerHTML = "";

        if (!items.length) {
            top10Grid.innerHTML = `<div class="empty-chip">현재 Strong Buy 종목이 없어요.</div>`;
            return;
        }

        items.forEach((item, index) => {
            const card = document.createElement("div");
            card.className = "top10-card";
            card.innerHTML = `
                <div class="top10-top">
                    <div class="top10-ticker">#${index + 1} ${item.ticker}</div>
                    <div class="top10-score">${item.score}점</div>
                </div>
                <div class="top10-name">${item.company_name}</div>
                <div class="top10-meta">
                    <div>${item.grade}</div>
                    <div>${formatPrice(item.close, item.currency || "USD")}</div>
                </div>
                <div class="top10-comment">${item.comment}</div>
            `;

            card.addEventListener("click", () => {
                tickerInput.value = item.ticker;
                analyzeTicker();
                window.scrollTo({ top: 0, behavior: "smooth" });
            });

            top10Grid.appendChild(card);
        });
    }

    async function loadTop10() {
        try {
            setTop10Status("TOP10 종목을 불러오는 중입니다...");
            if (top10Grid) top10Grid.innerHTML = "";

            const response = await fetch("/api/top10");
            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || "TOP10 조회 실패");
            }

            renderTop10(data.items || []);
            setTop10Status(`Strong Buy 후보 ${data.items.length}개를 불러왔습니다.`);
        } catch (error) {
            setTop10Status(error.message || "TOP10 조회 중 오류가 발생했습니다.", true);
        }
    }
})();
