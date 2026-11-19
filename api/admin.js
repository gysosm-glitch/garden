// Password-protected proxy for the chatbot's evaluation set (ragbot-lab API).
// Extra Vercel env var: ADMIN_PASSWORD (only people who know it can edit questions or run evals).
import { createHash, timingSafeEqual } from "node:crypto";

const BASE_URL = (process.env.RAGBOT_URL || "").replace(/\/+$/, "");
const TOKEN = process.env.RAGBOT_TOKEN || "";
const BOT = process.env.RAGBOT_BOT || "crop-price";
const PASSWORD = process.env.ADMIN_PASSWORD || "";
const ROUTES = ["any", "none", "documents", "tables", "web"];

const sha = (s) => createHash("sha256").update(String(s)).digest();
const authorized = (given) => PASSWORD && timingSafeEqual(sha(given), sha(PASSWORD));

const strList = (v) => Array.isArray(v) && v.length <= 10 && v.every((s) => typeof s === "string" && s.length <= 200);
function validQuestions(qs) {
  return (
    Array.isArray(qs) && qs.length >= 1 && qs.length <= 50 &&
    qs.every(
      (q) =>
        q && typeof q.question === "string" && q.question.trim().length > 0 && q.question.length <= 1000 &&
        (q.id === undefined || (typeof q.id === "string" && q.id.length <= 40)) &&
        (q.route === undefined || ROUTES.includes(q.route)) &&
        ["reference_answer", "evidence"].every((k) => q[k] === undefined || (typeof q[k] === "string" && q[k].length <= 2000)) &&
        ["key_points", "any_of", "must_not"].every((k) => q[k] === undefined || strList(q[k])) &&
        (q.unanswerable === undefined || typeof q.unanswerable === "boolean")
    )
  );
}

async function ragbot(path, method = "GET", body) {
  const r = await fetch(`${BASE_URL}/api/chatbots/${encodeURIComponent(BOT)}${path}`, {
    method,
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(60_000),
  });
  const data = await r.json().catch(() => ({}));
  return { status: r.ok ? 200 : r.status === 429 ? 429 : 502, data: r.ok ? data : { error: data.error || "챗봇 서버 오류" } };
}

export default async function handler(req, res) {
  if (!PASSWORD) return res.status(503).json({ error: "Vercel 환경변수 ADMIN_PASSWORD가 설정되지 않았어요." });
  if (!authorized(req.headers["x-admin-password"] || "")) return res.status(401).json({ error: "비밀번호가 맞지 않아요." });
  if (!BASE_URL || !TOKEN) return res.status(500).json({ error: "RAGBOT_URL / RAGBOT_TOKEN이 설정되지 않았어요." });

  const op = req.query?.op;
  try {
    let out;
    if (op === "questions" && req.method === "GET") out = await ragbot("/eval/questions");
    else if (op === "questions" && req.method === "PUT") {
      const qs = req.body?.questions;
      if (!validQuestions(qs)) return res.status(400).json({ error: "문항 형식이 올바르지 않아요. (1~50개, 질문은 필수)" });
      out = await ragbot("/eval/questions", "PUT", { questions: qs });
    } else if (op === "runs" && req.method === "GET") out = await ragbot("/eval/runs");
    else if (op === "runs" && req.method === "POST") {
      const label = typeof req.body?.label === "string" ? req.body.label.slice(0, 120) : "";
      out = await ragbot("/eval/runs", "POST", { label, ragas: false });
    } else if (op === "run" && req.method === "GET") {
      if (!/^eval_\d{8}_\d{6}$/.test(req.query.id || "")) return res.status(400).json({ error: "잘못된 평가 ID예요." });
      out = await ragbot(`/eval/runs/${req.query.id}`);
    } else return res.status(404).json({ error: "알 수 없는 요청이에요." });
    return res.status(out.status).json(out.data);
  } catch (err) {
    console.error(err);
    return res.status(502).json({ error: "챗봇 서버에 연결하지 못했어요." });
  }
}
