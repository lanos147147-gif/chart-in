(() => {
    const input = document.getElementById("tickerInput");
    const analyzeBtn = document.getElementById("analyzeBtn");
    const marketSelect = document.getElementById("marketSelect");

    if (!input || !analyzeBtn) return;

    const market = document.body.dataset.market || (location.pathname.includes("/kr") ? "kr" : "us");

    const todayPanel = document.getElementById("todayPanel");
    const watchlistPanel = document.getElementById("watchlistPanel");
    const mostViewedPanel = document.getElementById("mostViewedPanel");
    const alertPanel = document.getElementById("alertPanel");
    const newsPanel = document.getElementById("newsPanel");
    const favoriteToggleBtn = document.getElementById("favoriteToggleBtn");
    const refreshTodayBtn = document.getElementById("refreshTodayBtn");

    const STORAGE = {
        watchlist: `chartin-watchlist-${market}`,
        viewed: `chartin-viewed-${market}`,
        grades: `chartin-grade-cache-${market}`
    };

    let latestAnalysis = null;
    let refreshTimer = null;

    function escapeHtml(value = "") {
        return String(value)
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;")
            .replaceAll("'", "&#039;");
    }

    function readStorage(key, fallback) {
        try {
            const raw = localStorage.getItem(key);
            return raw ? JSON.parse(raw) : fallback;
        } catch (e) {
            return fallback;
        }
    }

    function writeStorage(key, value) {
        localStorage.setItem(key, JSON.stringify(value));
    }

    function getQuery() {
        return input.value.trim();
    }

    function getMarketHint() {
        if (!marketSelect) return "KS";
        return marketSelect.value || "KS";
    }

    function getAnalyzeUrl(query) {
        if (market === "kr") {
            return `/api/analyze/kr/${encodeURIComponent(query)}?market=${encodeURIComponent(getMarketHint())}`;
        }
        return `/api/analyze/us/${encodeURIComponent(query.toUpperCase())}`;
    }

    function getNewsUrl(query) {
        if (market === "kr") {
            return `/api/news/kr/${encodeURIComponent(query)}?market=${encodeURIComponent(getMarketHint())}`;
        }
        return `/api/news/us/${encodeURIComponent(query.toUpperCase())}`;
    }

    function renderToday(items) {
        if (!todayPanel) return;

        if (!items || !items.length) {
            todayPanel.innerHTML = `<div class="empty-box">Today 데이터가 없습니다.</div>`;
            return;
        }

        todayPanel.innerHTML = items.map(item => `
            <button class="mini-stock-btn" type="button" data-dashboard-query="${escapeHtml(item.ticker)}">
                <div class="mini-stock-top">
                    <strong>${escapeHtml(item.company_name)}</strong>
                    <span class="tiny-badge">${escapeHtml(item.grade)}</span>
                </div>
                <div class="mini-stock-mid">${escapeHtml(item.ticker)}</div>
                <div class="mini-stock-meta">
                    <span>점수 ${item.score}</span>
                    <span>${item.change_percent ?? 0}%</span>
                </div>
                <div class="mini-stock-reason">${escapeHtml(item.reason || "")}</div>
            </button>
        `).join("");
    }

    async function loadToday() {
        if (!todayPanel) return;

        todayPanel.innerHTML = `<div class="empty-box">Today 불러오는 중...</div>`;

        try {
            const response = await fetch(`/api/today/${market}`);
            const data = await response.json();

            if (!response.ok || data.error) {
                throw new Error(data.error || "Today 조회 실패");
            }

            renderToday(data.items || []);
        } catch (error) {
            todayPanel.innerHTML = `<div class="empty-box">${escapeHtml(error.message)}</div>`;
        }
    }

    function makeStoredItem(data) {
        return {
            query: data.display_ticker,
            ticker: data.display_ticker,
            company_name: data.company_name,
            market: data.market,
            score: data.summary.score,
            grade: data.summary.grade,
            updated_at: Date.now()
        };
    }

    function isInWatchlist(query) {
        const list = readStorage(STORAGE.watchlist, []);
        return list.some(item => item.query === query);
    }

    function updateFavoriteButton() {
        if (!favoriteToggleBtn) return;

        if (!latestAnalysis) {
            favoriteToggleBtn.textContent = "현재 종목 저장";
            return;
        }

        favoriteToggleBtn.textContent = isInWatchlist(latestAnalysis.display_ticker)
            ? "관심종목 해제"
            : "현재 종목 저장";
    }

    function renderWatchlist() {
        if (!watchlistPanel) return;

        const list = readStorage(STORAGE.watchlist, []);
        if (!list.length) {
            watchlistPanel.innerHTML = `<div class="empty-box">저장된 종목이 없습니다.</div>`;
            return;
        }

        watchlistPanel.innerHTML = list.map(item => `
            <div class="watchlist-item">
                <button class="watchlist-main" type="button" data-dashboard-query="${escapeHtml(item.query)}">
                    <strong>${escapeHtml(item.company_name)}</strong>
                    <small>${escapeHtml(item.ticker)} · ${escapeHtml(item.grade)}</small>
                </button>
                <button class="remove-watch-btn" type="button" data-remove-watchlist="${escapeHtml(item.query)}">삭제</button>
            </div>
        `).join("");
    }

    function toggleWatchlist() {
        if (!latestAnalysis) return;

        const list = readStorage(STORAGE.watchlist, []);
        const item = makeStoredItem(latestAnalysis);
        let next;

        if (isInWatchlist(item.query)) {
            next = list.filter(x => x.query !== item.query);
        } else {
            next = [item, ...list.filter(x => x.query !== item.query)].slice(0, 12);
        }

        writeStorage(STORAGE.watchlist, next);
        renderWatchlist();
        updateFavoriteButton();
    }

    function removeWatchlist(query) {
        const list = readStorage(STORAGE.watchlist, []);
        writeStorage(STORAGE.watchlist, list.filter(item => item.query !== query));
        renderWatchlist();
        updateFavoriteButton();
    }

    function incrementViewed(data) {
        const viewed = readStorage(STORAGE.viewed, {});
        const key = data.display_ticker;

        if (!viewed[key]) {
            viewed[key] = {
                query: data.display_ticker,
                company_name: data.company_name,
                count: 0,
                updated_at: Date.now()
            };
        }

        viewed[key].count += 1;
        viewed[key].updated_at = Date.now();

        writeStorage(STORAGE.viewed, viewed);
    }

    function renderMostViewed() {
        if (!mostViewedPanel) return;

        const viewed = Object.values(readStorage(STORAGE.viewed, {}))
            .sort((a, b) => b.count - a.count)
            .slice(0, 5);

        if (!viewed.length) {
            mostViewedPanel.innerHTML = `<div class="empty-box">아직 데이터가 없습니다.</div>`;
            return;
        }

        mostViewedPanel.innerHTML = viewed.map(item => `
            <button class="chip-stock-btn" type="button" data-dashboard-query="${escapeHtml(item.query)}">
                <span>${escapeHtml(item.company_name)}</span>
                <small>${escapeHtml(item.query)} · ${item.count}회</small>
            </button>
        `).join("");
    }

    function buildAlerts(data) {
        const alerts = [];
        const grades = readStorage(STORAGE.grades, {});
        const prevGrade = grades[data.display_ticker];

        if (prevGrade && prevGrade !== data.summary.grade) {
            alerts.push({
                tone: "warn",
                text: `등급 변화: ${prevGrade} → ${data.summary.grade}`
            });
        }

        grades[data.display_ticker] = data.summary.grade;
        writeStorage(STORAGE.grades, grades);

        if (data.summary.grade === "Strong Buy") {
            alerts.push({
                tone: "good",
                text: "강한 매수 신호 종목입니다."
            });
        }

        const rsi = Number(data.indicators?.rsi ?? 50);
        const volRatio = Number(data.indicators?.vol_ratio ?? 1);
        const changePercent = Number(data.summary?.change_percent ?? 0);

        if (rsi < 30) {
            alerts.push({
                tone: "good",
                text: `RSI ${rsi}로 과매도 반등 후보입니다.`
            });
        } else if (rsi > 70) {
            alerts.push({
                tone: "warn",
                text: `RSI ${rsi}로 단기 과열 구간입니다.`
            });
        }

        if (volRatio >= 1.5) {
            alerts.push({
                tone: "info",
                text: `거래량이 평균 대비 ${volRatio}배입니다.`
            });
        }

        if (changePercent >= 3) {
            alerts.push({
                tone: "good",
                text: `전일 대비 ${changePercent}% 상승 중입니다.`
            });
        } else if (changePercent <= -3) {
            alerts.push({
                tone: "warn",
                text: `전일 대비 ${changePercent}% 하락 중입니다.`
            });
        }

        return alerts.slice(0, 4);
    }

    function renderAlerts(alerts) {
        if (!alertPanel) return;

        if (!alerts || !alerts.length) {
            alertPanel.innerHTML = `<div class="empty-box">현재 강조할 알림이 없습니다.</div>`;
            return;
        }

        alertPanel.innerHTML = alerts.map(alert => `
            <div class="alert-item ${escapeHtml(alert.tone)}">${escapeHtml(alert.text)}</div>
        `).join("");
    }

    async function loadNews(query) {
        if (!newsPanel) return;

        newsPanel.innerHTML = `<div class="empty-box">뉴스 불러오는 중...</div>`;

        try {
            const response = await fetch(getNewsUrl(query));
            const data = await response.json();

            if (!response.ok || data.error) {
                throw new Error(data.error || "뉴스 조회 실패");
            }

            const items = data.items || [];

            if (!items.length) {
                newsPanel.innerHTML = `<div class="empty-box">관련 뉴스가 없습니다.</div>`;
                return;
            }

            newsPanel.innerHTML = items.map(item => `
                <div class="news-item">
                    <a class="news-link" href="${item.link || '#'}" target="_blank" rel="noopener noreferrer">
                        ${escapeHtml(item.title || "")}
                    </a>
                    <div class="news-meta">
                        <span>${escapeHtml(item.publisher || "")}</span>
                        <span>${escapeHtml(item.published_at || "")}</span>
                    </div>
                    <p>${escapeHtml(item.summary || "")}</p>
                </div>
            `).join("");
        } catch (error) {
            newsPanel.innerHTML = `<div class="empty-box">${escapeHtml(error.message)}</div>`;
        }
    }

    async function refreshSidebar(query) {
        if (!query) return;

        try {
            const response = await fetch(getAnalyzeUrl(query));
            const data = await response.json();

            if (!response.ok || data.error) {
                throw new Error(data.error || "분석 실패");
            }

            if (data.need_select) {
                renderAlerts([
                    {
                        tone: "warn",
                        text: "동일한 종목명이 여러 개입니다. 아래 추천 종목 중 하나를 먼저 선택하세요."
                    }
                ]);

                if (newsPanel) {
                    newsPanel.innerHTML = `<div class="empty-box">종목 선택 후 뉴스가 표시됩니다.</div>`;
                }
                return;
            }

            latestAnalysis = data;
            incrementViewed(data);
            renderMostViewed();
            renderWatchlist();
            updateFavoriteButton();
            renderAlerts(buildAlerts(data));
            loadNews(data.display_ticker || query);
        } catch (error) {
            renderAlerts([{ tone: "warn", text: error.message }]);
        }
    }

    function scheduleRefresh(delay = 700) {
        clearTimeout(refreshTimer);
        refreshTimer = setTimeout(() => {
            const query = getQuery();
            if (query) {
                refreshSidebar(query);
            }
        }, delay);
    }

    document.addEventListener("click", (event) => {
        const queryButton = event.target.closest("[data-dashboard-query]");
        if (queryButton) {
            const query = queryButton.dataset.dashboardQuery;
            input.value = query;
            analyzeBtn.click();
            scheduleRefresh(750);
            return;
        }

        const removeBtn = event.target.closest("[data-remove-watchlist]");
        if (removeBtn) {
            removeWatchlist(removeBtn.dataset.removeWatchlist);
        }
    });

    analyzeBtn.addEventListener("click", () => {
        scheduleRefresh(750);
    });

    input.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
            scheduleRefresh(750);
        }
    });

    if (marketSelect) {
        marketSelect.addEventListener("change", () => {
            scheduleRefresh(300);
        });
    }

    if (favoriteToggleBtn) {
        favoriteToggleBtn.addEventListener("click", toggleWatchlist);
    }

    if (refreshTodayBtn) {
        refreshTodayBtn.addEventListener("click", loadToday);
    }

    window.addEventListener("load", () => {
        renderWatchlist();
        renderMostViewed();
        updateFavoriteButton();
        loadToday();

        setTimeout(() => {
            const query = getQuery();
            if (query) {
                refreshSidebar(query);
            }
        }, 900);
    });
})();
