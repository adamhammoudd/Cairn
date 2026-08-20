import assert from "node:assert/strict";
import { formatTimeAgo } from "../../src/components/time-ago";

const m = 60_000;

assert.equal(formatTimeAgo(0), "just now");
assert.equal(formatTimeAgo(-5 * m), "just now"); // clock skew / future publishedAt
assert.equal(formatTimeAgo(59_999), "just now");
assert.equal(formatTimeAgo(m), "1m ago");
assert.equal(formatTimeAgo(59 * m), "59m ago");
assert.equal(formatTimeAgo(60 * m), "1h ago");
assert.equal(formatTimeAgo(23 * 60 * m), "23h ago");
assert.equal(formatTimeAgo(24 * 60 * m), "1d ago");
assert.equal(formatTimeAgo(10 * 24 * 60 * m), "10d ago");

console.log("time-ago: ok");
