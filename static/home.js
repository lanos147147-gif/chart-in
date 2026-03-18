function escapeHtml(value = "") {
    return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function renderHomeToday(targetId, items) {
    const el = document.getElementById(targetId);
    if (!el) return;

    if (!items || !items.length) {
        el.innerHTML = `<div class="empty-box">표시할 종목이 없습니다.</div>`;
        return;
    }

    el.innerHTML = items.map(item => `
        <button class="home-today-item" onclick="location.href='/${item.market === 'US' ? 'us' : 'kr'}'">
            <div class="home-today-top">
                <strong>${escapeHtml(item.company_name)}</strong>
                <span class="tiny-badge">${escapeHtml(item.grade)}</span>
            </div>
            <div class="home-today-mid">${escapeHtml(item.ticker)}</div>
            <div class="home-today-bottom">
                <span>점수 ${item.score}</span>
                <span>${item.change_percent ?? 0}%</span>
            </div>
        </button>
    `).join("");
}

async function loadHomeToday(market, targetId) {
    const el = document.getElementById(targetId);
    if (!el) return;

    try {
        const response = await fetch(`/api/today/${market}`);
        const data = await response.json();

        if (!response.ok || data.error) {
            throw new Error(data.error || "Today 불러오기 실패");
        }

        renderHomeToday(targetId, data.items || []);
    } catch (error) {
        el.innerHTML = `<div class="empty-box">${escapeHtml(error.message)}</div>`;
    }
}

window.addEventListener("load", () => {
    loadHomeToday("us", "homeTodayUs");
    loadHomeToday("kr", "homeTodayKr");
});
