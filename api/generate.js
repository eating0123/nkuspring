/**
 * Serverless-style API handler: POST /api/generate
 * Body: { keyword1, keyword2, horizontalKeyword }
 *
 * 约定返回 JSON：{ upper, lower, horizontal }
 */

async function callDeepSeek({ keyword1, keyword2, horizontalKeyword }) {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    const err = new Error("Missing process.env.DEEPSEEK_API_KEY");
    err.statusCode = 500;
    throw err;
  }

  // 1. 定义更符合“我门难开”调性的 System Prompt，并要求自动生成横批
  const systemPrompt = `你是由“我门难开”公众号（南开大学校园幽默/原创平台）培训的“赛博转运”大师。
你的任务是根据用户提供的【2个关键词】，自动创作一副完整的 2026 蛇年春联（包含上联、下联、横批）。

【人设要求】
1. **调性**：幽默、搞笑、接地气、欢脱，最终落脚点必须是**喜庆和祝福**。
2. **南开梗**：熟练使用马蹄湖、新开湖、二食、省身楼、津南妖风、早八等南开大学的梗，不要出现数字或者DDL等英文。
3. **避雷**：严禁出现“挂科”、“延毕”等晦气词汇，负面词要转化为“转运”或“上岸”。

【输出要求】
1. 必须严格输出 JSON 格式：{"upper":"上联内容","lower":"下联内容","horizontal":"横批内容"}。
2. **横批由你根据上联和下联的意境自动生成**，要求 4 个字，画龙点睛（如：稳拿录用、南开锦鲤、绩点爆满等等）。
3. 对联要字数对仗（7-9字），一定要上下联字数相等，有南开韵味，不要出现标点，不要出现数字或者英文。`;

  // 2. 修改 User Prompt，去掉了 horizontalKeyword，改为让 AI 自动补充
  const userPrompt = [
    "请基于以下两个核心词，为我生成南开专属转运春联：",
    `- 关键词1：${String(keyword1 || "南开").trim()}`,
    `- 关键词2：${String(keyword2 || "顺遂").trim()}`,
    "",
    "请自动补充一个合适的横批。",
    "要求：上联和下联必须体现“南开元素”或“大学生现状”，要好玩有趣。",
  ].join("\n");

  const resp = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "deepseek-chat",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.9,
      response_format: { type: "json_object" },
    }),
  });

  const text = await resp.text();
  if (!resp.ok) {
    const err = new Error(`DeepSeek API error (${resp.status}): ${text}`);
    err.statusCode = 502;
    throw err;
  }

  let data;
  try {
    data = JSON.parse(text);
  } catch {
    const err = new Error(`DeepSeek response is not JSON: ${text}`);
    err.statusCode = 502;
    throw err;
  }

  const content = data?.choices?.[0]?.message?.content;
  if (!content) {
    const err = new Error(`DeepSeek missing message.content: ${text}`);
    err.statusCode = 502;
    throw err;
  }

  // content 应该是纯 JSON（由 response_format 保证），这里再兜底解析
  let couplet;
  try {
    couplet = JSON.parse(content);
  } catch {
    const err = new Error(`Model content is not JSON: ${content}`);
    err.statusCode = 502;
    throw err;
  }

  const upper = String(couplet?.upper || "").trim();
  const lower = String(couplet?.lower || "").trim();
  const horizontal = String(couplet?.horizontal || "").trim();

  if (!upper || !lower || !horizontal) {
    const err = new Error(
      `Invalid couplet JSON (need upper/lower/horizontal): ${content}`
    );
    err.statusCode = 502;
    throw err;
  }

  return { upper, lower, horizontal };
}

function sendJson(res, statusCode, obj) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  // Zeabur / 国内环境调试更友好：允许同源 + 基本 CORS（不影响同源部署）
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.end(JSON.stringify(obj));
}

async function readJsonBodyIfNeeded(req) {
  // 兼容：Serverless 平台/Express 会提前解析好 req.body
  if (req.body && typeof req.body === "object") return req.body;

  // 兼容：Node http server 直连（Zeabur 自建 server 或本地 server.js）
  const contentType = String(req.headers?.["content-type"] || "");
  if (!contentType.includes("application/json")) return {};

  return await new Promise((resolve) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 2_000_000) {
        // 超限直接返回空，避免撑爆
        resolve({});
        try {
          req.destroy();
        } catch {}
      }
    });
    req.on("end", () => {
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        resolve({});
      }
    });
    req.on("error", () => resolve({}));
  });
}

module.exports = async function handler(req, res) {
  try {
    if (req.method === "OPTIONS") {
      // CORS 预检
      return sendJson(res, 200, { ok: true });
    }
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      return sendJson(res, 405, { error: "Method Not Allowed" });
    }

    const body = await readJsonBodyIfNeeded(req);
    const keyword1 = body.keyword1 ?? body.k1 ?? body.keyword_1;
    const keyword2 = body.keyword2 ?? body.k2 ?? body.keyword_2;
    const horizontalKeyword =
      body.horizontalKeyword ?? body.horizontal ?? body.h;

    const result = await callDeepSeek({ keyword1, keyword2, horizontalKeyword });
    return sendJson(res, 200, result);
  } catch (e) {
    const status = Number(e?.statusCode) || 500;
    return sendJson(res, status, { error: e?.message || "Unknown error" });
  }
};

module.exports._callDeepSeek = callDeepSeek;
