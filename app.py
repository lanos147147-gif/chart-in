from flask import Flask, render_template, jsonify
import time
import pandas as pd
import yfinance as yf
from ta.trend import SMAIndicator, MACD
from ta.momentum import RSIIndicator, StochasticOscillator
from ta.volatility import BollingerBands

app = Flask(__name__)

TOP10_CANDIDATES = [
    "AAPL", "MSFT", "NVDA", "AMZN", "META", "GOOGL", "TSLA", "AVGO", "AMD", "NFLX",
    "PLTR", "SNOW", "CRM", "ORCL", "UBER", "SHOP", "QCOM", "ADBE", "INTU", "PANW",
    "MU", "ANET", "CRWD", "ARM", "ASML", "NOW", "AMAT", "LRCX", "INTC", "TXN",
    "JPM", "GS", "BAC", "WMT", "COST", "HD", "MCD", "KO", "PEP", "LLY",
    "UNH", "XOM", "CVX", "MRK", "ABBV", "PFE", "CAT", "GE", "DIS", "NKE"
]

_top10_cache = {
    "timestamp": 0,
    "data": []
}


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


def get_company_name(stock, ticker):
    try:
        info = stock.info
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


def analyze_stock(ticker):
    ticker = ticker.strip().upper()

    if not ticker:
        raise ValueError("티커를 입력하세요.")

    stock = yf.Ticker(ticker)
    df = stock.history(period="1y", interval="1d", auto_adjust=False)

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

    return {
        "ticker": ticker,
        "company_name": get_company_name(stock, ticker),
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
            data = analyze_stock(ticker)
            grade = data["summary"]["grade"]
            score = data["summary"]["score"]

            if grade == "Strong Buy":
                results.append({
                    "ticker": data["ticker"],
                    "company_name": data["company_name"],
                    "score": score,
                    "grade": grade,
                    "comment": data["summary"]["comment"],
                    "close": data["summary"]["close"],
                    "change_percent": data["summary"]["change_percent"]
                })
        except Exception:
            continue

    results.sort(key=lambda x: x["score"], reverse=True)
    top10 = results[:10]

    _top10_cache["timestamp"] = now
    _top10_cache["data"] = top10
    return top10


@app.route("/")
def home():
    return render_template("index.html")


@app.route("/api/analyze/<ticker>")
def api_analyze(ticker):
    try:
        result = analyze_stock(ticker)
        return jsonify(result)
    except Exception as e:
        return jsonify({"error": str(e)}), 400


@app.route("/api/top10")
def api_top10():
    try:
        return jsonify({
            "items": get_top10_strong_buy()
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 400


if __name__ == "__main__":
    app.run(debug=True)
