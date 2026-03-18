from flask import Flask, render_template, jsonify, request, make_response
from datetime import datetime
import time
import sqlite3
import uuid
import hashlib
import pandas as pd
import yfinance as yf
import FinanceDataReader as fdr
from deep_translator import GoogleTranslator
from ta.trend import SMAIndicator, MACD
from ta.momentum import RSIIndicator, StochasticOscillator
from ta.volatility import BollingerBands

app = Flask(__name__)

DB_PATH = "chartin_visits.db"
VISIT_INTERVAL_SECONDS = 30 * 60

TOP10_CANDIDATES = [
    "AAPL", "MSFT", "NVDA", "AMZN", "META", "GOOGL", "TSLA", "AVGO", "AMD", "NFLX",
    "PLTR", "SNOW", "CRM", "ORCL", "UBER", "SHOP", "QCOM", "ADBE", "INTU", "PANW",
    "MU", "ANET", "CRWD", "ARM", "ASML", "NOW", "AMAT", "LRCX", "INTC", "TXN",
    "JPM", "GS", "BAC", "WMT", "COST", "HD", "MCD", "KO", "PEP", "LLY",
    "UNH", "XOM", "CVX", "MRK", "ABBV", "PFE", "CAT", "GE", "DIS", "NKE"
]

KR_TODAY_CANDIDATES = [
    {"ticker": "005930.KS", "name": "삼성전자", "market": "KOSPI"},
    {"ticker": "000660.KS", "name": "SK하이닉스", "market": "KOSPI"},
    {"ticker": "035420.KS", "name": "NAVER", "market": "KOSPI"},
    {"ticker": "005380.KS", "name": "현대차", "market": "KOSPI"},
    {"ticker": "051910.KS", "name": "LG화학", "market": "KOSPI"},
    {"ticker": "068270.KS", "name": "셀트리온", "market": "KOSPI"},
    {"ticker": "035720.KS", "name": "카카오", "market": "KOSPI"},
    {"ticker": "207940.KS", "name": "삼성바이오로직스", "market": "KOSPI"},
    {"ticker": "091990.KQ", "name": "셀트리온헬스케어", "market": "KOSDAQ"},
    {"ticker": "196170.KQ", "name": "알테오젠", "market": "KOSDAQ"}
]

_top10_cache = {"timestamp": 0, "data": []}
_kr_cache = {"timestamp": 0, "data": []}
translator = GoogleTranslator(source="auto", target="ko")


def get_db_conn():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_visit_db():
    conn = get_db_conn()
    cur = conn.cursor()

    cur.execute("""
        CREATE TABLE IF NOT EXISTS visit_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            visitor_key TEXT NOT NULL,
            visited_at INTEGER NOT NULL,
            visit_date TEXT NOT NULL
        )
    """)

    cur.execute("""
        CREATE INDEX IF NOT EXISTS idx_visit_events_key_time
        ON visit_events(visitor_key, visited_at)
    """)

    cur.execute("""
        CREATE INDEX IF NOT EXISTS idx_visit_events_date
        ON visit_events(visit_date)
    """)

    conn.commit()
    conn.close()


def get_client_ip():
    forwarded = request.headers.get("X-Forwarded-For", "")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.remote_addr or "0.0.0.0"


def make_visitor_key(visitor_id):
    ip = get_client_ip()
    user_agent = request.headers.get("User-Agent", "")[:200]
    raw = f"{visitor_id}|{ip}|{user_agent}"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def record_visit(visitor_id):
    now_ts = int(time.time())
    today_str = datetime.now().strftime("%Y-%m-%d")
    visitor_key = make_visitor_key(visitor_id)

    conn = get_db_conn()
    cur = conn.cursor()

    cur.execute("""
        SELECT visited_at
        FROM visit_events
        WHERE visitor_key = ?
        ORDER BY visited_at DESC
        LIMIT 1
    """, (visitor_key,))
    row = cur.fetchone()

    should_count = False
    if row is None:
        should_count = True
    else:
        last_seen = int(row["visited_at"])
        if now_ts - last_seen >= VISIT_INTERVAL_SECONDS:
            should_count = True

    if should_count:
        cur.execute("""
            INSERT INTO visit_events (visitor_key, visited_at, visit_date)
            VALUES (?, ?, ?)
        """, (visitor_key, now_ts, today_str))
        conn.commit()

    cur.execute("SELECT COUNT(*) AS cnt FROM visit_events")
    total_count = int(cur.fetchone()["cnt"])

    cur.execute("""
        SELECT COUNT(*) AS cnt
        FROM visit_events
        WHERE visit_date = ?
    """, (today_str,))
    today_count = int(cur.fetchone()["cnt"])

    cur.execute("""
        SELECT COUNT(DISTINCT visitor_key) AS cnt
        FROM visit_events
        WHERE visit_date = ?
    """, (today_str,))
    today_unique = int(cur.fetchone()["cnt"])

    conn.close()

    return {
        "total": total_count,
        "today": today_count,
        "today_unique": today_unique,
        "counted": should_count
    }


def get_visit_stats():
    today_str = datetime.now().strftime("%Y-%m-%d")
    conn = get_db_conn()
    cur = conn.cursor()

    cur.execute("SELECT COUNT(*) AS cnt FROM visit_events")
    total_count = int(cur.fetchone()["cnt"])

    cur.execute("""
        SELECT COUNT(*) AS cnt
        FROM visit_events
        WHERE visit_date = ?
    """, (today_str,))
    today_count = int(cur.fetchone()["cnt"])

    cur.execute("""
        SELECT COUNT(DISTINCT visitor_key) AS cnt
        FROM visit_events
        WHERE visit_date = ?
    """, (today_str,))
    today_unique = int(cur.fetchone()["cnt"])

    conn.close()

    return {
        "total": total_count,
        "today": today_count,
        "today_unique": today_unique
    }


def render_page_with_visit(template_name, **context):
    visitor_id = request.cookies.get("chartin_vid")
    is_new_cookie = False

    if not visitor_id:
        visitor_id = str(uuid.uuid4())
        is_new_cookie = True

    visit_stats = record_visit(visitor_id)

    merged_context = {
        **context,
        "visit_stats": visit_stats
    }

    response = make_response(render_template(template_name, **merged_context))

    if is_new_cookie:
        response.set_cookie(
            "chartin_vid",
            visitor_id,
            max_age=60 * 60 * 24 * 365 * 2,
            samesite="Lax"
        )

    return response


def safe_round(value, digits=2):
    if pd.isna(value):
        return None
    return round(float(value), digits)


def clean_series(series, digits=2):
    result = []
    for value in series:
        if pd.isna(value):
            result.append(None)
        else:
            result.append(round(float(value), digits))
    return result


def get_company_name(stock_obj, ticker):
    try:
        info = stock_obj.info
        return info.get("shortName") or info.get("longName") or ticker
    except Exception:
        return ticker


def build_grade(score):
    if score >= 80:
        return "Strong Buy", "강한 매수 우위 신호입니다."
    if score >= 65:
        return "Buy", "매수 우위 신호입니다."
    if score >= 50:
        return "Hold", "관망 또는 분할 접근 구간입니다."
    if score >= 35:
        return "Sell", "약세 신호가 더 많습니다."
    return "Strong Sell", "매도 경고 신호가 강합니다."


def get_kr_market_name(suffix):
    return "KOSDAQ" if suffix == "KQ" else "KOSPI"


def normalize_market_to_suffix(market_value):
    market = str(market_value or "").upper()
    if "KOSDAQ" in market:
        return "KQ", "KOSDAQ"
    return "KS", "KOSPI"


def translate_ko(text):
    text = str(text or "").strip()
    if not text:
        return ""
    try:
        return translator.translate(text)
    except Exception:
        return text


def format_news_datetime(value):
    if value is None:
        return None

    try:
        if isinstance(value, (int, float)):
            return datetime.fromtimestamp(int(value)).strftime("%Y-%m-%d %H:%M")

        text = str(value).strip()
        if not text:
            return None

        text = text.replace("Z", "+00:00")
        dt = datetime.fromisoformat(text)
        return dt.strftime("%Y-%m-%d %H:%M")
    except Exception:
        return str(value)


def get_news_items(ticker, fallback_name=None, limit=5):
    items = []

    try:
        raw_news = yf.Ticker(ticker).news or []
    except Exception:
        raw_news = []

    for item in raw_news[:limit]:
        content = item.get("content") or {}

        title_en = (
            item.get("title")
            or content.get("title")
            or "제목 없음"
        )

        publisher = (
            item.get("publisher")
            or item.get("provider")
            or content.get("publisher")
            or "Yahoo Finance"
        )

        link = (
            item.get("link")
            or content.get("canonicalUrl", {}).get("url")
            or content.get("clickThroughUrl", {}).get("url")
            or ""
        )

        published_raw = (
            item.get("providerPublishTime")
            or content.get("pubDate")
            or content.get("displayTime")
        )

        published_at = format_news_datetime(published_raw)

        summary_en = (
            item.get("summary")
            or content.get("summary")
            or content.get("description")
            or ""
        )

        summary_en = str(summary_en).strip()
        if len(summary_en) > 180:
            summary_en = summary_en[:180].rstrip() + "..."

        title_ko = translate_ko(title_en)
        summary_ko = translate_ko(summary_en) if summary_en else ""

        items.append({
            "title": title_ko or title_en,
            "publisher": publisher,
            "link": link,
            "published_at": published_at,
            "summary": summary_ko or summary_en,
            "title_en": title_en,
            "summary_en": summary_en
        })

    if not items and fallback_name:
        items.append({
            "title": f"{fallback_name} 관련 최신 뉴스가 아직 없습니다.",
            "publisher": "",
            "link": "",
            "published_at": None,
            "summary": "잠시 후 다시 확인해보세요.",
            "title_en": "",
            "summary_en": ""
        })

    return items


def get_kr_universe():
    now = time.time()
    if now - _kr_cache["timestamp"] < 86400 and _kr_cache["data"]:
        return _kr_cache["data"]

    items = []

    try:
        listing = fdr.StockListing("KRX")
        listing = listing.fillna("")

        for _, row in listing.iterrows():
            code = str(row.get("Code", "")).strip().zfill(6)
            name = str(row.get("Name", "")).strip()

            if not code or not name:
                continue

            suffix, market_name = normalize_market_to_suffix(row.get("Market", ""))
            items.append({
                "code": code,
                "name": name,
                "name_norm": name.replace(" ", "").upper(),
                "suffix": suffix,
                "market": market_name,
                "yahoo_ticker": f"{code}.{suffix}",
                "display_ticker": f"{code}.{suffix}"
            })
    except Exception:
        items = []

    _kr_cache["timestamp"] = now
    _kr_cache["data"] = items
    return items


def find_kr_candidates(query, market_hint="KS"):
    raw = str(query or "").strip()
    if not raw:
        return []

    universe = get_kr_universe()
    upper = raw.upper()

    if upper.endswith(".KS") or upper.endswith(".KQ"):
        code, suffix = upper.split(".")
        for item in universe:
            if item["code"] == code and item["suffix"] == suffix:
                return [item]
        return [{
            "code": code,
            "name": code,
            "name_norm": code,
            "suffix": suffix,
            "market": get_kr_market_name(suffix),
            "yahoo_ticker": f"{code}.{suffix}",
            "display_ticker": f"{code}.{suffix}"
        }]

    digits = "".join(ch for ch in raw if ch.isdigit())
    if len(digits) == 6 and raw.replace(" ", "").replace(".", "").isdigit():
        exact = [item for item in universe if item["code"] == digits]
        if exact:
            preferred = [item for item in exact if item["suffix"] == market_hint.upper()]
            return preferred[:1] if preferred else exact[:1]

        suffix = "KQ" if market_hint.upper() == "KQ" else "KS"
        return [{
            "code": digits,
            "name": digits,
            "name_norm": digits,
            "suffix": suffix,
            "market": get_kr_market_name(suffix),
            "yahoo_ticker": f"{digits}.{suffix}",
            "display_ticker": f"{digits}.{suffix}"
        }]

    q = raw.replace(" ", "").upper()
    exact = [item for item in universe if item["name_norm"] == q]
    starts = [item for item in universe if item["name_norm"].startswith(q) and item not in exact]
    contains = [item for item in universe if q in item["name_norm"] and item not in exact and item not in starts]

    return (exact + starts + contains)[:10]


def analyze_stock(
    ticker,
    company_name_override=None,
    display_ticker=None,
    currency="USD",
    market_label="US"
):
    ticker = ticker.strip().upper()

    if not ticker:
        raise ValueError("티커를 입력하세요.")

    stock_obj = yf.Ticker(ticker)
    df = stock_obj.history(period="1y", interval="1d", auto_adjust=False)

    if df is None or df.empty:
        raise ValueError("데이터를 찾지 못했습니다. 티커를 다시 확인하세요.")

    df = df.reset_index()

    if "Date" not in df.columns:
        df.rename(columns={df.columns[0]: "Date"}, inplace=True)

    close = df["Close"]
    high = df["High"]
    low = df["Low"]
    volume = df["Volume"]

    df["SMA20"] = SMAIndicator(close=close, window=20).sma_indicator()
    df["SMA60"] = SMAIndicator(close=close, window=60).sma_indicator()
    df["SMA120"] = SMAIndicator(close=close, window=120).sma_indicator()

    bb = BollingerBands(close=close, window=20, window_dev=2)
    df["BB_H"] = bb.bollinger_hband()
    df["BB_M"] = bb.bollinger_mavg()
    df["BB_L"] = bb.bollinger_lband()

    macd = MACD(close=close, window_slow=26, window_fast=12, window_sign=9)
    df["MACD"] = macd.macd()
    df["MACD_SIGNAL"] = macd.macd_signal()
    df["MACD_HIST"] = macd.macd_diff()

    df["RSI"] = RSIIndicator(close=close, window=14).rsi()

    stoch = StochasticOscillator(
        high=high,
        low=low,
        close=close,
        window=14,
        smooth_window=3
    )
    df["STOCH_K"] = stoch.stoch()
    df["STOCH_D"] = stoch.stoch_signal()

    df["VOL_MA20"] = volume.rolling(window=20).mean()
    df = df.dropna().reset_index(drop=True)

    if len(df) < 3:
        raise ValueError("분석에 필요한 데이터가 부족합니다.")

    latest = df.iloc[-1]
    prev = df.iloc[-2]

    score = 50
    reasons = []

    if latest["Close"] > latest["SMA20"]:
        score += 8
        reasons.append("종가가 SMA20 위에 있어 단기 추세가 살아 있습니다.")
    else:
        score -= 8
        reasons.append("종가가 SMA20 아래에 있어 단기 탄력이 약합니다.")

    if latest["SMA20"] > latest["SMA60"]:
        score += 10
        reasons.append("SMA20이 SMA60 위라서 중기 추세가 우상향입니다.")
    else:
        score -= 10
        reasons.append("SMA20이 SMA60 아래라서 중기 추세가 약합니다.")

    if latest["SMA60"] > latest["SMA120"]:
        score += 12
        reasons.append("SMA60이 SMA120 위라서 장기 흐름도 안정적입니다.")
    else:
        score -= 12
        reasons.append("SMA60이 SMA120 아래라서 장기 흐름은 아직 약세입니다.")

    if latest["MACD"] > latest["MACD_SIGNAL"]:
        score += 10
        reasons.append("MACD가 시그널 위에 있어 모멘텀이 우세합니다.")
    else:
        score -= 10
        reasons.append("MACD가 시그널 아래라서 모멘텀이 둔합니다.")

    if prev["MACD"] <= prev["MACD_SIGNAL"] and latest["MACD"] > latest["MACD_SIGNAL"]:
        score += 4
        reasons.append("최근 MACD 골든크로스가 발생했습니다.")
    elif prev["MACD"] >= prev["MACD_SIGNAL"] and latest["MACD"] < latest["MACD_SIGNAL"]:
        score -= 4
        reasons.append("최근 MACD 데드크로스가 발생했습니다.")

    rsi = latest["RSI"]

    if rsi < 30:
        score += 8
        reasons.append("RSI가 30 아래로 과매도 반등 가능성이 있습니다.")
    elif rsi < 45:
        score += 3
        reasons.append("RSI가 낮은 편이라 반등 여지가 있습니다.")
    elif rsi <= 65:
        score += 6
        reasons.append("RSI가 과열이 아닌 상승 친화 구간입니다.")
    elif rsi <= 75:
        score -= 4
        reasons.append("RSI가 높아 단기 과열 부담이 있습니다.")
    else:
        score -= 8
        reasons.append("RSI가 매우 높아 과열 경고 구간입니다.")

    if latest["STOCH_K"] > latest["STOCH_D"] and latest["STOCH_K"] < 80:
        score += 6
        reasons.append("스토캐스틱이 상향 우위라 단기 반등 흐름이 좋습니다.")
    elif latest["STOCH_K"] < latest["STOCH_D"] and latest["STOCH_K"] > 20:
        score -= 6
        reasons.append("스토캐스틱이 하향 우위라 단기 힘이 약해졌습니다.")
    elif latest["STOCH_K"] < 20:
        score += 4
        reasons.append("스토캐스틱이 침체 구간이라 기술적 반등 후보입니다.")

    if latest["Close"] < latest["BB_L"]:
        score += 6
        reasons.append("가격이 볼린저 하단 아래라 반등 후보입니다.")
    elif latest["Close"] > latest["BB_H"]:
        score -= 6
        reasons.append("가격이 볼린저 상단 위라 과열 부담이 큽니다.")
    else:
        reasons.append("가격이 볼린저 밴드 안에 있어 극단 구간은 아닙니다.")

    vol_ratio = 1
    if pd.notna(latest["VOL_MA20"]) and latest["VOL_MA20"] > 0:
        vol_ratio = float(latest["Volume"] / latest["VOL_MA20"])

    if vol_ratio >= 1.3 and score >= 50:
        score += 6
        reasons.append("거래량이 평균보다 강해 상승 신호 신뢰도가 높습니다.")
    elif vol_ratio >= 1.3 and score < 50:
        reasons.append("거래량은 크지만 방향성은 추가 확인이 필요합니다.")
    elif vol_ratio < 0.8:
        score -= 2
        reasons.append("거래량이 평균보다 약해 신호 신뢰도는 낮습니다.")

    score = max(0, min(100, score))
    grade, comment = build_grade(score)

    change_percent = 0
    if prev["Close"] != 0:
        change_percent = ((latest["Close"] - prev["Close"]) / prev["Close"]) * 100

    chart_df = df.tail(160)
    company_name = company_name_override or get_company_name(stock_obj, ticker)
    display_ticker = display_ticker or ticker

    return {
        "ticker": ticker,
        "display_ticker": display_ticker,
        "company_name": company_name,
        "market": market_label,
        "currency": currency,
        "summary": {
            "grade": grade,
            "score": int(round(score)),
            "comment": comment,
            "close": safe_round(latest["Close"]),
            "change_percent": safe_round(change_percent),
            "as_of": latest["Date"].strftime("%Y-%m-%d")
        },
        "indicators": {
            "sma20": safe_round(latest["SMA20"]),
            "sma60": safe_round(latest["SMA60"]),
            "sma120": safe_round(latest["SMA120"]),
            "bb_high": safe_round(latest["BB_H"]),
            "bb_mid": safe_round(latest["BB_M"]),
            "bb_low": safe_round(latest["BB_L"]),
            "macd": safe_round(latest["MACD"]),
            "macd_signal": safe_round(latest["MACD_SIGNAL"]),
            "macd_hist": safe_round(latest["MACD_HIST"]),
            "rsi": safe_round(latest["RSI"]),
            "stoch_k": safe_round(latest["STOCH_K"]),
            "stoch_d": safe_round(latest["STOCH_D"]),
            "vol_ratio": safe_round(vol_ratio)
        },
        "reasons": reasons[:6],
        "chart": {
            "dates": chart_df["Date"].dt.strftime("%Y-%m-%d").tolist(),
            "open": clean_series(chart_df["Open"]),
            "high": clean_series(chart_df["High"]),
            "low": clean_series(chart_df["Low"]),
            "close": clean_series(chart_df["Close"]),
            "sma20": clean_series(chart_df["SMA20"]),
            "sma60": clean_series(chart_df["SMA60"]),
            "bb_high": clean_series(chart_df["BB_H"]),
            "bb_low": clean_series(chart_df["BB_L"]),
            "macd": clean_series(chart_df["MACD"]),
            "macd_signal": clean_series(chart_df["MACD_SIGNAL"]),
            "macd_hist": clean_series(chart_df["MACD_HIST"]),
            "rsi": clean_series(chart_df["RSI"]),
            "stoch_k": clean_series(chart_df["STOCH_K"]),
            "stoch_d": clean_series(chart_df["STOCH_D"])
        }
    }


def get_top10_strong_buy():
    now = time.time()

    if now - _top10_cache["timestamp"] < 1800 and _top10_cache["data"]:
        return _top10_cache["data"]

    results = []

    for ticker in TOP10_CANDIDATES:
        try:
            data = analyze_stock(ticker, currency="USD", market_label="US")
            grade = data["summary"]["grade"]
            score = data["summary"]["score"]

            if grade == "Strong Buy":
                results.append({
                    "ticker": data["display_ticker"],
                    "company_name": data["company_name"],
                    "score": score,
                    "grade": grade,
                    "comment": data["summary"]["comment"],
                    "close": data["summary"]["close"],
                    "change_percent": data["summary"]["change_percent"],
                    "currency": "USD"
                })
        except Exception:
            continue

    results.sort(key=lambda x: x["score"], reverse=True)
    top10 = results[:10]

    _top10_cache["timestamp"] = now
    _top10_cache["data"] = top10
    return top10


def build_today_card(data):
    first_reason = data["reasons"][0] if data["reasons"] else "기술 지표 기반 종합 점수"
    return {
        "ticker": data["display_ticker"],
        "company_name": data["company_name"],
        "market": data["market"],
        "score": data["summary"]["score"],
        "grade": data["summary"]["grade"],
        "close": data["summary"]["close"],
        "change_percent": data["summary"]["change_percent"],
        "reason": first_reason
    }


def get_today_us(limit=3):
    results = []

    for ticker in TOP10_CANDIDATES[:15]:
        try:
            data = analyze_stock(ticker, currency="USD", market_label="US")
            results.append(build_today_card(data))
        except Exception:
            continue

    results.sort(key=lambda x: x["score"], reverse=True)
    return results[:limit]


def get_today_kr(limit=3):
    results = []

    for item in KR_TODAY_CANDIDATES:
        try:
            data = analyze_stock(
                item["ticker"],
                company_name_override=item["name"],
                display_ticker=item["ticker"],
                currency="KRW",
                market_label=item["market"]
            )
            results.append(build_today_card(data))
        except Exception:
            continue

    results.sort(key=lambda x: x["score"], reverse=True)
    return results[:limit]


@app.route("/")
def home():
    return render_page_with_visit("home.html")


@app.route("/us")
def us_page():
    return render_page_with_visit("us.html")


@app.route("/kr")
def kr_page():
    return render_page_with_visit("kr.html")


@app.route("/api/visit-stats")
def api_visit_stats():
    try:
        return jsonify(get_visit_stats())
    except Exception as e:
        return jsonify({"error": str(e)}), 400


@app.route("/api/analyze/<ticker>")
def api_analyze_legacy(ticker):
    try:
        result = analyze_stock(ticker, currency="USD", market_label="US")
        return jsonify(result)
    except Exception as e:
        return jsonify({"error": str(e)}), 400


@app.route("/api/analyze/us/<ticker>")
def api_analyze_us(ticker):
    try:
        result = analyze_stock(ticker, currency="USD", market_label="US")
        return jsonify(result)
    except Exception as e:
        return jsonify({"error": str(e)}), 400


@app.route("/api/analyze/kr/<path:query>")
def api_analyze_kr(query):
    try:
        market_hint = request.args.get("market", "KS").upper()
        candidates = find_kr_candidates(query, market_hint=market_hint)

        if not candidates:
            return jsonify({"error": "일치하는 한국 종목을 찾지 못했습니다."}), 404

        if len(candidates) > 1:
            return jsonify({
                "need_select": True,
                "matches": [
                    {
                        "code": item["code"],
                        "name": item["name"],
                        "suffix": item["suffix"],
                        "market": item["market"],
                        "display_ticker": item["display_ticker"]
                    }
                    for item in candidates
                ]
            })

        item = candidates[0]
        result = analyze_stock(
            item["yahoo_ticker"],
            company_name_override=item["name"],
            display_ticker=item["display_ticker"],
            currency="KRW",
            market_label=item["market"]
        )
        return jsonify(result)

    except Exception as e:
        return jsonify({"error": str(e)}), 400


@app.route("/api/top10")
def api_top10():
    try:
        return jsonify({"items": get_top10_strong_buy()})
    except Exception as e:
        return jsonify({"error": str(e)}), 400


@app.route("/api/today/<market>")
def api_today(market):
    try:
        market = market.lower()

        if market == "us":
            items = get_today_us()
        elif market == "kr":
            items = get_today_kr()
        else:
            return jsonify({"error": "지원하지 않는 시장입니다."}), 400

        return jsonify({
            "market": market.upper(),
            "generated_at": datetime.now().strftime("%Y-%m-%d %H:%M"),
            "items": items
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 400


@app.route("/api/news/us/<ticker>")
def api_news_us(ticker):
    try:
        result = analyze_stock(ticker, currency="USD", market_label="US")
        return jsonify({
            "ticker": result["display_ticker"],
            "company_name": result["company_name"],
            "items": get_news_items(result["ticker"], fallback_name=result["company_name"])
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 400


@app.route("/api/news/kr/<path:query>")
def api_news_kr(query):
    try:
        market_hint = request.args.get("market", "KS").upper()
        candidates = find_kr_candidates(query, market_hint=market_hint)

        if not candidates:
            return jsonify({"error": "일치하는 한국 종목을 찾지 못했습니다."}), 404

        item = candidates[0]

        return jsonify({
            "ticker": item["display_ticker"],
            "company_name": item["name"],
            "items": get_news_items(item["yahoo_ticker"], fallback_name=item["name"])
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 400


if __name__ == "__main__":
    init_visit_db()
    app.run(debug=True)
else:
    init_visit_db()
