// 간단한 자체 검사: node test.mjs (RAGBOT_URL·RAGBOT_TOKEN이 있으면 실제 호출까지)
import assert from "node:assert";
import handler from "./api/chat.js";
const call = (method, body) => new Promise((ok) => {
  const res = { code: 0, status(c) { this.code = c; return this; }, json(d) { ok({ code: this.code, d }); } };
  handler({ method, body }, res);
});
assert.equal((await call("GET")).code, 405);
assert.equal((await call("POST", {})).code, 400);
assert.equal((await call("POST", { messages: [{ role: "system", content: "x" }] })).code, 400);
assert.equal((await call("POST", { messages: [{ role: "user", content: "x".repeat(4001) }] })).code, 400);
console.log("validation ok");

// admin: 비밀번호 확인과 문항 검증 (ADMIN_PASSWORD는 테스트용 값)
process.env.ADMIN_PASSWORD = "test-pw";
const admin = (await import("./api/admin.js?t=" + Date.now())).default;
const acall = (method, query, body, pw) => new Promise((ok) => {
  const res = { code: 0, status(c) { this.code = c; return this; }, json(d) { ok({ code: this.code, d }); } };
  admin({ method, query, body, headers: pw === undefined ? {} : { "x-admin-password": pw } }, res);
});
assert.equal((await acall("GET", { op: "questions" })).code, 401);
assert.equal((await acall("GET", { op: "questions" }, undefined, "wrong")).code, 401);
if (process.env.RAGBOT_TOKEN) {
  assert.equal((await acall("PUT", { op: "questions" }, { questions: [] }, "test-pw")).code, 400);
  assert.equal((await acall("PUT", { op: "questions" }, { questions: Array(51).fill({ question: "x" }) }, "test-pw")).code, 400);
  assert.equal((await acall("PUT", { op: "questions" }, { questions: [{ question: "x", route: "bad" }] }, "test-pw")).code, 400);
  assert.equal((await acall("GET", { op: "run", id: "../files" }, undefined, "test-pw")).code, 400);
  const q = await acall("GET", { op: "questions" }, undefined, "test-pw");
  assert.equal(q.code, 200); console.log("admin questions:", q.d.questions.length);
}
console.log("admin ok");

if (process.env.RAGBOT_TOKEN) {
  const r = await call("POST", { messages: [{ role: "user", content: "2026년 10월 쌀 중도매가격은 얼마인가요?" }] });
  console.log(r.code, r.d.answer ?? r.d.error);
  assert.equal(r.code, 200);
}
