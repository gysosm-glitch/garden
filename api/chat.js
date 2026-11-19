// Vercel serverless function: forwards the chat to the ragbot-lab chatbot (the class API).
// The token stays on the server; set these in Vercel → Project → Settings → Environment Variables:
//   RAGBOT_URL    e.g. https://demo.saksonita.com  (no trailing slash)
//   RAGBOT_TOKEN  personal token from the ragbot-lab web app
//   RAGBOT_BOT    chatbot id (default crop-price)
const BASE_URL = (process.env.RAGBOT_URL || "").replace(/\/+$/, "");
const TOKEN = process.env.RAGBOT_TOKEN || "";
const BOT = process.env.RAGBOT_BOT || "crop-price";
const HISTORY_TURNS = 6; // earlier messages sent along for follow-up questions

const HINTS = { 401: "토큰(RAGBOT_TOKEN)을 확인해 주세요.", 403: "이 계정은 챗봇을 쓸 수 없어요.", 429: "오늘 질문 한도를 다 썼어요." };

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  // Trust boundary: accept only a short, well-formed chat history.
  const messages = req.body?.messages;
  const valid =
    Array.isArray(messages) &&
    messages.length > 0 &&
    messages.length <= 20 &&
    messages.every(
      (m) =>
        (m.role === "user" || m.role === "assistant") &&
        typeof m.content === "string" &&
        m.content.length > 0 &&
        m.content.length <= 4000
    ) &&
    messages.at(-1).role === "user";
  if (!valid) return res.status(400).json({ error: "잘못된 요청입니다." });
  if (!BASE_URL || !TOKEN) return res.status(500).json({ error: "서버에 RAGBOT_URL / RAGBOT_TOKEN이 설정되지 않았어요." });

  const question = messages.at(-1).content;
  const history = messages.slice(0, -1).slice(-HISTORY_TURNS).map(({ role, content }) => ({ role, content }));

  try {
    const r = await fetch(`${BASE_URL}/api/chatbots/${encodeURIComponent(BOT)}/ask`, {
      method: "POST",
      headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ question, history: history.length ? history : null }),
      signal: AbortSignal.timeout(120_000),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      console.error("ragbot", r.status, data.error);
      return res.status(r.status === 429 ? 429 : 502).json({ error: HINTS[r.status] || "답변을 가져오지 못했어요. 잠시 후 다시 시도해주세요." });
    }
    return res.status(200).json({ answer: data.answer || "(빈 답변)", sources: data.sources || [] });
  } catch (err) {
    console.error(err);
    return res.status(502).json({ error: "답변을 가져오지 못했어요. 잠시 후 다시 시도해주세요." });
  }
}
