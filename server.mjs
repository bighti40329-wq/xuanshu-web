import express from "express";
import helmet from "helmet";
import lunarPkg from "lunar-javascript";
import { astro } from "iztro";
import * as Astronomy from "astronomy-engine";

const { Solar } = lunarPkg;

const app = express();
const port = Number(process.env.PORT || 3000);
const model =
  process.env.GEMINI_MODEL || "gemini-3.8-flash";
const apiKey = process.env.GEMINI_API_KEY || "";

app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false
  })
);

app.use(express.json({ limit: "512kb" }));
app.use(
  express.static("public", {
    extensions: ["html"]
  })
);

const elementMap = {
  甲: "木",
  乙: "木",
  丙: "火",
  丁: "火",
  戊: "土",
  己: "土",
  庚: "金",
  辛: "金",
  壬: "水",
  癸: "水",
  子: "水",
  丑: "土",
  寅: "木",
  卯: "木",
  辰: "土",
  巳: "火",
  午: "火",
  未: "土",
  申: "金",
  酉: "金",
  戌: "土",
  亥: "水"
};

const signs = [
  "牡羊座",
  "金牛座",
  "雙子座",
  "巨蟹座",
  "獅子座",
  "處女座",
  "天秤座",
  "天蠍座",
  "射手座",
  "摩羯座",
  "水瓶座",
  "雙魚座"
];

function validateBirth(body) {
  const birth = body?.birth;

  if (!birth) {
    throw new Error("缺少出生資料");
  }

  for (const field of ["year", "month", "day"]) {
    if (!Number.isInteger(Number(birth[field]))) {
      throw new Error(`缺少 ${field}`);
    }
  }

  return {
    year: Number(birth.year),
    month: Number(birth.month),
    day: Number(birth.day),
    hour: Number(birth.hour) || 0,
    minute: Number(birth.minute) || 0,
    gender: birth.gender || "不提供",
    timeIndex: Number.isInteger(Number(birth.timeIndex))
      ? Number(birth.timeIndex)
      : Math.floor(((Number(birth.hour) || 0) + 1) / 2) % 12,
    latitude: Number(birth.latitude) || 23.58,
    longitude: Number(birth.longitude) || 120.55,
    timeZone: birth.timeZone || "Asia/Taipei"
  };
}

function calculateBazi(birth) {
  const solar = Solar.fromYmdHms(
    birth.year,
    birth.month,
    birth.day,
    birth.hour,
    birth.minute,
    0
  );

  const lunar = solar.getLunar();
  const eightChar = lunar.getEightChar();

  const pillars = [
    eightChar.getYear(),
    eightChar.getMonth(),
    eightChar.getDay(),
    eightChar.getTime()
  ];

  const fiveElements = {
    木: 0,
    火: 0,
    土: 0,
    金: 0,
    水: 0
  };

  for (const pillar of pillars) {
    for (const character of pillar) {
      const element = elementMap[character];

      if (element) {
        fiveElements[element] += 1;
      }
    }
  }

  return {
    type: "bazi",
    solar: solar.toYmdHms(),
    lunar: lunar.toString(),
    fourPillars: {
      year: pillars[0],
      month: pillars[1],
      day: pillars[2],
      hour: pillars[3]
    },
    dayMaster: pillars[2][0],
    fiveElements,
    tenGods: {
      year: eightChar.getYearShiShenGan(),
      month: eightChar.getMonthShiShenGan(),
      day: eightChar.getDayShiShenGan(),
      hour: eightChar.getTimeShiShenGan()
    },
    nayin: [
      eightChar.getYearNaYin(),
      eightChar.getMonthNaYin(),
      eightChar.getDayNaYin(),
      eightChar.getTimeNaYin()
    ]
  };
}

function calculateZiwei(birth) {
  const chart = astro.bySolar(
    `${birth.year}-${birth.month}-${birth.day}`,
    Math.max(0, Math.min(12, birth.timeIndex)),
    birth.gender === "女" ? "女" : "男",
    true,
    "zh-TW"
  );

  return {
    type: "ziwei",
    solarDate: chart.solarDate,
    lunarDate: chart.lunarDate,
    chineseDate: chart.chineseDate,
    time: chart.time,
    sign: chart.sign,
    zodiac: chart.zodiac,
    soul: chart.soul,
    body: chart.body,
    fiveElementsClass: chart.fiveElementsClass,
    palaces: chart.palaces.map(palace => ({
      name: palace.name,
      isBodyPalace: palace.isBodyPalace,
      heavenlyStem: palace.heavenlyStem,
      earthlyBranch: palace.earthlyBranch,
      majorStars: (palace.majorStars || []).map(
        star => star.name
      ),
      minorStars: (palace.minorStars || [])
        .slice(0, 5)
        .map(star => star.name)
    }))
  };
}

function zodiacPosition(longitude) {
  const normalized =
    ((longitude % 360) + 360) % 360;

  const index = Math.floor(normalized / 30);

  return {
    sign: signs[index],
    degree: Number((normalized % 30).toFixed(2)),
    longitude: Number(normalized.toFixed(2))
  };
}

function calculateAstrology(birth) {
  const date = new Date(
    Date.UTC(
      birth.year,
      birth.month - 1,
      birth.day,
      birth.hour - 8,
      birth.minute
    )
  );

  const bodies = [
    "Sun",
    "Moon",
    "Mercury",
    "Venus",
    "Mars",
    "Jupiter",
    "Saturn",
    "Uranus",
    "Neptune",
    "Pluto"
  ];

  const planets = {};

  for (const name of bodies) {
    let longitude;

    if (name === "Sun") {
      longitude =
        Astronomy.SunPosition(date).elon;
    } else if (name === "Moon") {
      longitude =
        Astronomy.EclipticGeoMoon(date).lon;
    } else {
      longitude = Astronomy.Ecliptic(
        Astronomy.GeoVector(
          Astronomy.Body[name],
          date,
          true
        )
      ).elon;
    }

    planets[name] = zodiacPosition(longitude);
  }

  return {
    type: "astrology",
    utc: date.toISOString(),
    location: {
      latitude: birth.latitude,
      longitude: birth.longitude,
      timeZone: birth.timeZone
    },
    planets,
    note:
      "本版提供主要行星落座，尚未計算上升點與十二宮位。"
  };
}

function createLocalAnalysis(
  charts,
  question = ""
) {
  const summaries = [];
  const advice = [];

  if (charts.bazi) {
    const elements =
      charts.bazi.fiveElements;

    const sorted = Object.entries(elements)
      .sort((a, b) => b[1] - a[1]);

    summaries.push(
      `八字日主為 ${charts.bazi.dayMaster}，` +
      `五行以${sorted[0][0]}較多，` +
      `${sorted.at(-1)[0]}相對較少。`
    );

    advice.push(
      "五行數量只屬結構提示，不等同完整喜用神判定。"
    );
  }

  if (charts.ziwei) {
    const lifePalace =
      charts.ziwei.palaces.find(
        palace => palace.name === "命宮"
      ) || charts.ziwei.palaces[0];

    const stars =
      lifePalace?.majorStars?.length
        ? lifePalace.majorStars.join("、")
        : "空宮";

    summaries.push(
      `紫微命主為${charts.ziwei.soul || "未取得"}，` +
      `身主為${charts.ziwei.body || "未取得"}。` +
      `${lifePalace?.name || "命宮"}主要星曜為${stars}。`
    );

    advice.push(
      "紫微結果應連同三方四正、四化與採用流派一起判讀。"
    );
  }

  if (charts.astrology) {
    const planets =
      charts.astrology.planets;

    summaries.push(
      `西洋占星太陽位於${planets.Sun.sign}，` +
      `月亮位於${planets.Moon.sign}，` +
      `金星位於${planets.Venus.sign}，` +
      `火星位於${planets.Mars.sign}。`
    );

    advice.push(
      "本版星盤先提供行星落座，不包含上升點與宮位。"
    );
  }

  const count = Object.keys(charts).length;

  if (count > 1) {
    summaries.push(
      `目前已完成 ${count} 種盤面。` +
      "適合比較不同系統反覆出現的主題，" +
      "不宜把單一指標視為定論。"
    );
  }

  if (question.trim()) {
    summaries.push(
      `針對問題「${question.trim()}」，` +
      "建議把問題拆成可驗證的時間、資源及行動條件。"
    );
  }

  return {
    mode: "local",
    title: "本地規則解析",
    summary: summaries.join("\n\n"),
    advice:
      advice.join("\n") +
      "\n內容僅供自我探索，不取代醫療、法律、財務或重大人生決策。"
  };
}

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    model,
    aiConfigured: Boolean(apiKey),
    localCharts: true
  });
});

app.post("/api/chart/bazi", (req, res) => {
  try {
    const birth = validateBirth(req.body);

    res.json({
      data: calculateBazi(birth)
    });
  } catch (error) {
    res.status(400).json({
      message: error.message
    });
  }
});

app.post("/api/chart/ziwei", (req, res) => {
  try {
    const birth = validateBirth(req.body);

    res.json({
      data: calculateZiwei(birth)
    });
  } catch (error) {
    res.status(400).json({
      message: error.message
    });
  }
});

app.post(
  "/api/chart/astrology",
  (req, res) => {
    try {
      const birth = validateBirth(req.body);

      res.json({
        data: calculateAstrology(birth)
      });
    } catch (error) {
      res.status(400).json({
        message: error.message
      });
    }
  }
);

app.post(
  "/api/local/interpret",
  (req, res) => {
    res.json({
      data: createLocalAnalysis(
        req.body?.charts || {},
        req.body?.question || ""
      )
    });
  }
);

app.post("/api/ai/analyze", async (req, res) => {
  const charts = req.body?.charts || {};
  const question = req.body?.question || "";

  const fallback = createLocalAnalysis(
    charts,
    question
  );

  if (!Object.keys(charts).length) {
    return res.status(400).json({
      message: "請先完成至少一種排盤"
    });
  }

  if (!apiKey) {
    return res.status(503).json({
      message:
        "AI 尚未設定，已切換為本地解析",
      fallback
    });
  }

  const controller = new AbortController();

  const timeout = setTimeout(
    () => controller.abort(),
    60000
  );

  try {
    const prompt = `
你是命理資料解讀助手。

只能解讀下列由確定性程式產生的資料，
不得重新排盤、改寫行星位置或改寫四柱。

如果只有一種盤面，只解讀該盤。
如果有兩種盤面，整理共同點與差異。
如果有三種盤面，進行三盤綜合分析。

使用繁體中文。
不得宣稱結果具有科學保證。
內容僅供自我探索。

使用者問題：
${question || "無特定問題"}

排盤資料：
${JSON.stringify(charts)}
    `.trim();

    const endpoint =
      "https://generativelanguage.googleapis.com/" +
      `v1beta/models/${encodeURIComponent(model)}` +
      `:generateContent?key=${encodeURIComponent(apiKey)}`;

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      signal: controller.signal,
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: prompt
              }
            ]
          }
        ],
        generationConfig: {
          temperature: 0.35,
          maxOutputTokens: 1800,
          responseMimeType:
            "application/json",
          responseSchema: {
            type: "OBJECT",
            properties: {
              title: {
                type: "STRING"
              },
              summary: {
                type: "STRING"
              },
              advice: {
                type: "STRING"
              }
            },
            required: [
              "title",
              "summary",
              "advice"
            ]
          }
        }
      })
    });

    const body = await response
      .json()
      .catch(() => ({}));

    if (!response.ok) {
      const quotaExceeded =
        response.status === 429;

      return res.status(response.status).json({
        message: quotaExceeded
          ? "Gemini 額度已用完，已切換為本地解析"
          : "AI 暫時無法使用，已切換為本地解析",
        fallback,
        detail: body?.error?.message
      });
    }

    const text =
      body?.candidates?.[0]
        ?.content?.parts?.[0]?.text;

    if (!text) {
      throw new Error("AI 回傳空白內容");
    }

    const cleaned = text
      .trim()
      .replace(/^```json\s*/i, "")
      .replace(/\s*```$/, "");

    return res.json({
      data: {
        mode: "ai",
        ...JSON.parse(cleaned)
      }
    });
  } catch (error) {
    return res.status(502).json({
      message:
        "AI 暫時無法使用，已切換為本地解析",
      fallback
    });
  } finally {
    clearTimeout(timeout);
  }
});

app.get(/^(?!\/api\/).*/, (_req, res) => {
  res.sendFile("index.html", {
    root: "public"
  });
});

app.listen(port, "0.0.0.0", () => {
  console.log(
    `Xuanshu local-first server running on port ${port}`
  );

  console.log(`Gemini model: ${model}`);
  console.log(
    `Gemini configured: ${Boolean(apiKey)}`
  );
});