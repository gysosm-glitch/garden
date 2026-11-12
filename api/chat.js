import Anthropic from "@anthropic-ai/sdk";
import { PRICES_CSV, REPORTS_MD } from "./_data.js";

const client = new Anthropic(); // ANTHROPIC_API_KEY from Vercel env

const SYSTEM = [
  {
    type: "text",
    text: `너는 식량작물 중도매가격 상담 챗봇이다. 아래 자료(KAMIS aT 중도매가격, 단위 원/kg)만 근거로 한국어로 답한다.

규칙:
- 가격을 말할 때는 품목·연월·수치를 함께 적는다. 자료에 없는 값은 지어내지 말고 없다고 말한다.
- "앞으로 오를까?" 같은 질문에는 (1) 최근 3~6개월 흐름, (2) 같은 달 기준 전년·평년 대비, (3) 과거 연도의 같은 시기(11~12월 등) 계절 패턴, (4) 보고서의 가격변동 요인을 근거로 "상승/보합/하락 가능성"을 제시하고, 전망은 과거 자료 기반 추정일 뿐 확정이 아니라고 한 줄 덧붙인다.
- 원본 표에 오기로 보이는 값(예: 쌀 2026년 3월 2,007)은 이상치일 수 있다고 언급한다.
- 답은 짧은 문단과 목록으로 쓰고, 마크다운 표는 쓰지 않는다.

[월별 중도매가격 CSV: 품목,연도,1월~12월 / 빈칸은 자료 없음]
${PRICES_CSV}

[월간 분석 보고서]
${REPORTS_MD}`,
    cache_control: { type: "ephemeral" },
  },
];

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

  try {
    const response = await client.beta.messages.create({
      model: "claude-opus-5-5",
      max_tokens: 16000,
      output_config: { effort: "medium" },
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: SYSTEM,
      messages: messages.map(({ role, content }) => ({ role, content })),
    });

    if (response.stop_reason === "refusal") {
      return res.status(200).json({ answer: "이 질문에는 답할 수 없어요. 다른 질문을 해주세요." });
    }
    const answer = response.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("");
    return res.status(200).json({ answer });
  } catch (err) {
    console.error(err);
    const status = err instanceof Anthropic.RateLimitError ? 429 : 502;
    return res.status(status).json({ error: "답변을 가져오지 못했어요. 잠시 후 다시 시도해주세요." });
  }
}
