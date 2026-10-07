/** Retry + failure-copy policy for Hub downloads. Run: node --test tests/http-retry.test.ts */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  describeHttpFailure,
  errorCodeForStatus,
  isRetryableStatus,
  MAX_ATTEMPTS,
  retryAfterMs,
} from "../lib/models/http-retry.ts";

describe("isRetryableStatus", () => {
  it("retries a throttle and any server fault", () => {
    assert.equal(isRetryableStatus(429), true);
    for (const s of [500, 502, 503, 504, 599]) {
      assert.equal(isRetryableStatus(s), true, `${s} should retry`);
    }
  });

  it("never retries a fact about the request", () => {
    // 401 bad token, 403 no access, 404 gone, 416 range — a second identical
    // request gets the identical answer.
    for (const s of [400, 401, 403, 404, 416, 418]) {
      assert.equal(isRetryableStatus(s), false, `${s} should not retry`);
    }
  });
});

describe("retryAfterMs", () => {
  it("backs off exponentially when the server has no opinion", () => {
    assert.equal(retryAfterMs(undefined, 0), 1_000);
    assert.equal(retryAfterMs({}, 1), 2_000);
    assert.equal(retryAfterMs({}, 2), 4_000);
  });

  it("obeys Retry-After delta-seconds over its own curve", () => {
    assert.equal(retryAfterMs({ "retry-after": "7" }, 0), 7_000);
  });

  it("reads the header whatever case the platform used", () => {
    assert.equal(retryAfterMs({ "Retry-After": "3" }, 0), 3_000);
    assert.equal(retryAfterMs({ "RETRY-AFTER": "3" }, 0), 3_000);
  });

  it("treats a past HTTP-date as now, not as never", () => {
    const past = new Date(Date.now() - 60_000).toUTCString();
    assert.equal(retryAfterMs({ "retry-after": past }, 0), 0);
  });

  it("caps a hostile or absurd value so a retry can't hang the row", () => {
    assert.equal(retryAfterMs({ "retry-after": "99999" }, 0), 30_000);
    assert.equal(retryAfterMs(undefined, 40), 30_000);
  });

  it("falls through to backoff on a malformed header", () => {
    assert.equal(retryAfterMs({ "retry-after": "soon" }, 0), 1_000);
  });
});

describe("describeHttpFailure", () => {
  it("separates a bad token from missing repo access", () => {
    // The whole point of the taxonomy: these need different user actions,
    // so they must not collapse into one "HTTP 4xx".
    const unauthorized = describeHttpFailure(401);
    const forbidden = describeHttpFailure(403);
    assert.match(unauthorized, /token/i);
    assert.match(forbidden, /can't read this repo/i);
    assert.notEqual(unauthorized, forbidden);
  });

  it("keeps every special-cased status distinct", () => {
    // The taxonomy's whole value: if two of these collapse to the same
    // sentence, the distinction the copy is making is not real.
    const msgs = [401, 403, 404, 416, 429].map(describeHttpFailure);
    assert.equal(new Set(msgs).size, msgs.length);
  });

  it("names the status, so the card is never a bare mystery", () => {
    for (const s of [401, 403, 404, 416, 429]) {
      assert.match(describeHttpFailure(s), new RegExp(String(s)), `${s}`);
    }
  });

  it("still names the status when it has nothing specific to say", () => {
    assert.match(describeHttpFailure(418), /418/);
  });
});

describe("errorCodeForStatus", () => {
  it("offers token recovery only for a rejected token", () => {
    assert.equal(errorCodeForStatus(401), "authentication");
  });

  it("offers nothing for a repo the account cannot read", () => {
    // Retrying anonymously cannot grant repo access, so a recovery button
    // here is a dead end that looks like help.
    assert.equal(errorCodeForStatus(403), undefined);
  });

  it("offers nothing for failures the user must fix outside the app", () => {
    for (const s of [404, 416, 429, 500, 503]) {
      assert.equal(errorCodeForStatus(s), undefined, `${s}`);
    }
  });
});

describe("MAX_ATTEMPTS", () => {
  it("bounds the spinner", () => {
    assert.equal(MAX_ATTEMPTS, 3);
  });
});