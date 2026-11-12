// 간단한 자체 검사: node test.mjs (API 키가 있으면 실제 호출까지)
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
if (process.env.ANTHROPIC_API_KEY) {
  const r = await call("POST", { messages: [{ role: "user", content: "쌀 가격 앞으로 오를까? 짧게" }] });
  console.log(r.code, r.d.answer ?? r.d.error);
  assert.equal(r.code, 200);
}
