import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  constantTimeEquals,
  hashPassword,
  parseCookies,
  verifyPassword
} from "../../auth.js";

describe("parseCookies", () => {
  it("parses multiple pairs and trims whitespace", () => {
    assert.deepEqual(parseCookies("a=1; b=2;c=3"), { a: "1", b: "2", c: "3" });
  });

  it("returns an empty object for a missing header", () => {
    assert.deepEqual(parseCookies(undefined), {});
    assert.deepEqual(parseCookies(""), {});
  });

  it("decodes percent-encoded values", () => {
    assert.deepEqual(parseCookies("name=hello%20world"), { name: "hello world" });
  });

  it("keeps the raw value when decoding fails", () => {
    assert.deepEqual(parseCookies("name=%E0%A4%A"), { name: "%E0%A4%A" });
  });

  it("skips segments without an equals sign and empty names", () => {
    assert.deepEqual(parseCookies("junk; =orphan; ok=1"), { ok: "1" });
  });

  it("preserves equals signs inside values", () => {
    assert.deepEqual(parseCookies("token=abc=def=="), { token: "abc=def==" });
  });
});

describe("hashPassword / verifyPassword", () => {
  it("round-trips a correct password", async () => {
    const encoded = await hashPassword("hunter2hunter2");
    assert.ok(encoded.startsWith("scrypt$16384$"));
    assert.equal(await verifyPassword("hunter2hunter2", encoded), true);
  });

  it("rejects a wrong password", async () => {
    const encoded = await hashPassword("correct-horse-battery");
    assert.equal(await verifyPassword("incorrect-horse-battery", encoded), false);
  });

  it("produces unique salts per hash", async () => {
    const first = await hashPassword("same-password");
    const second = await hashPassword("same-password");
    assert.notEqual(first, second);
  });

  it("rejects malformed encodings without throwing", async () => {
    assert.equal(await verifyPassword("pw", "not-an-encoded-hash"), false);
    assert.equal(await verifyPassword("pw", "scrypt$abc$salt$hash"), false);
    assert.equal(await verifyPassword("pw", "scrypt$0$c2FsdA==$aGFzaA=="), false);
    assert.equal(await verifyPassword("pw", "bcrypt$10$x$y"), false);
  });
});

describe("constantTimeEquals", () => {
  it("matches identical strings", () => {
    assert.equal(constantTimeEquals("admin-key-123", "admin-key-123"), true);
  });

  it("rejects different strings of the same length", () => {
    assert.equal(constantTimeEquals("admin-key-123", "admin-key-124"), false);
  });

  it("rejects strings of different lengths", () => {
    assert.equal(constantTimeEquals("short", "a-much-longer-candidate-key"), false);
  });

  it("treats empty strings as equal only to each other", () => {
    assert.equal(constantTimeEquals("", ""), true);
    assert.equal(constantTimeEquals("", "x"), false);
  });
});
