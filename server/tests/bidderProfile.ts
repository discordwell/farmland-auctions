import "dotenv/config";
import pg from "pg";

const baseUrl = process.env.SMOKE_BASE_URL ?? "http://127.0.0.1:3510";
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) throw new Error("DATABASE_URL is required for cleanup");

const unique = Date.now().toString(36);
const email = `buyer-profile-${unique}@example.invalid`;
const password = "test-password-123!";
const collisionEmail = `collision-${unique}@example.invalid`;
const collisionPassword = "test-password-123!";

function extractSessionCookie(response: Response): string {
  const raw = response.headers.get("set-cookie");
  if (!raw) throw new Error("No set-cookie header on auth response");
  const match = raw.split(",").find((segment) => segment.includes("farmauction_session="));
  if (!match) throw new Error("Session cookie missing from set-cookie header");
  const pair = match.split(";")[0].trim();
  if (!pair.startsWith("farmauction_session=")) {
    throw new Error(`Unexpected cookie segment: ${pair}`);
  }
  return pair;
}

async function expectJson<T>(response: Response, label: string): Promise<T> {
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(`${label} failed with ${response.status}: ${JSON.stringify(payload)}`);
  }
  return payload as T;
}

async function cleanup(emails: string[]) {
  const pool = new pg.Pool({ connectionString: databaseUrl, max: 2 });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const userEmail of emails) {
      await client.query("DELETE FROM bidders WHERE lower(email) = lower($1)", [userEmail]);
      await client.query(
        "DELETE FROM user_sessions WHERE user_id IN (SELECT id FROM users WHERE lower(email) = lower($1))",
        [userEmail]
      );
      await client.query("DELETE FROM users WHERE lower(email) = lower($1)", [userEmail]);
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

async function main() {
  try {
    // 401 when not signed in
    const unauthed = await fetch(`${baseUrl}/api/me/bidder`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        legalName: "No Session",
        entityType: "individual"
      })
    });
    if (unauthed.status !== 401) {
      throw new Error(`Expected 401 from PATCH without session, got ${unauthed.status}`);
    }

    // Sign up a fresh user
    const signupResponse = await fetch(`${baseUrl}/api/auth/signup`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email,
        password,
        displayName: "Test Buyer",
        intent: "buyer"
      })
    });
    await expectJson<{ user: { id: string } }>(signupResponse, "signup");
    const cookie = extractSessionCookie(signupResponse);

    // First PATCH: insert a brand-new bidder row
    const insertResponse = await fetch(`${baseUrl}/api/me/bidder`, {
      method: "PATCH",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({
        legalName: "Test Buyer Holdings Ltd.",
        phone: "(306) 555-0100",
        entityType: "corporation",
        mailingAddress: "1 Prairie Road, Lipton SK"
      })
    });
    const inserted = await expectJson<{ bidder: Record<string, unknown> }>(insertResponse, "PATCH insert");
    if (inserted.bidder.legal_name !== "Test Buyer Holdings Ltd.") {
      throw new Error(`Insert legal_name mismatch: ${JSON.stringify(inserted.bidder)}`);
    }
    if (inserted.bidder.entity_type !== "corporation") {
      throw new Error(`Insert entity_type mismatch: ${JSON.stringify(inserted.bidder)}`);
    }
    if (inserted.bidder.verification_status !== "pending") {
      throw new Error(
        `New bidder should start pending verification, got ${JSON.stringify(inserted.bidder)}`
      );
    }

    // Verification status should be ignored when the client tries to set it
    const tamperResponse = await fetch(`${baseUrl}/api/me/bidder`, {
      method: "PATCH",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({
        legalName: "Test Buyer Holdings Ltd.",
        entityType: "corporation",
        verification_status: "approved",
        verificationStatus: "approved"
      })
    });
    const tampered = await expectJson<{ bidder: Record<string, unknown> }>(tamperResponse, "PATCH tamper");
    if (tampered.bidder.verification_status !== "pending") {
      throw new Error(
        `Buyer should not be able to flip verification_status; got ${JSON.stringify(tampered.bidder)}`
      );
    }

    // Second PATCH: update existing row
    const updateResponse = await fetch(`${baseUrl}/api/me/bidder`, {
      method: "PATCH",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({
        legalName: "Test Buyer Holdings Ltd.",
        phone: "(306) 555-0200",
        entityType: "trust",
        mailingAddress: "2 Prairie Road, Lipton SK"
      })
    });
    const updated = await expectJson<{ bidder: Record<string, unknown> }>(updateResponse, "PATCH update");
    if (updated.bidder.id !== inserted.bidder.id) {
      throw new Error("Second PATCH inserted a new row instead of updating");
    }
    if (updated.bidder.phone !== "(306) 555-0200" || updated.bidder.entity_type !== "trust") {
      throw new Error(`Update did not persist: ${JSON.stringify(updated.bidder)}`);
    }

    // Summary should now include the bidder
    const summaryResponse = await fetch(`${baseUrl}/api/me/summary`, {
      headers: { cookie }
    });
    const summary = await expectJson<{ bidder: Record<string, unknown> | null }>(
      summaryResponse,
      "summary"
    );
    if (!summary.bidder || summary.bidder.id !== inserted.bidder.id) {
      throw new Error(`Summary did not echo the upserted bidder: ${JSON.stringify(summary)}`);
    }

    // A second user with a *different* email cannot stomp an existing bidder
    // row that belongs to user A. Set up by signing user A in, claiming their
    // bidder via PATCH, then signing user B in and PATCHing user A's email — but
    // signup uses user B's email so the bidder row lookup keys on user B's
    // email. The defense we actually want is: if a bidder row exists for an
    // email and is owned by a different user_id, the upsert must NOT overwrite.
    // To force the collision we directly bind a second user to user A's email
    // by reassigning the orphan path: rename user A's email at the DB layer to
    // simulate the unlikely-but-possible case of two users mapping to the same
    // bidder email row.
    const collisionSignup = await fetch(`${baseUrl}/api/auth/signup`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: collisionEmail,
        password: collisionPassword,
        displayName: "Collision User",
        intent: "buyer"
      })
    });
    await expectJson<{ user: { id: string } }>(collisionSignup, "collision signup");
    const collisionCookie = extractSessionCookie(collisionSignup);

    // Pin the existing bidder row's email to the collision user's email via SQL,
    // so the next PATCH from collision user matches that row but with a
    // different owner.
    const pinPool = new pg.Pool({ connectionString: databaseUrl, max: 1 });
    try {
      await pinPool.query(
        "UPDATE bidders SET email = lower($1) WHERE id = $2",
        [collisionEmail, inserted.bidder.id]
      );
    } finally {
      await pinPool.end();
    }

    const collisionAttempt = await fetch(`${baseUrl}/api/me/bidder`, {
      method: "PATCH",
      headers: { "content-type": "application/json", cookie: collisionCookie },
      body: JSON.stringify({
        legalName: "Hijack Attempt",
        entityType: "individual"
      })
    });
    if (collisionAttempt.status !== 409) {
      throw new Error(
        `Cross-owner PATCH should be rejected with 409, got ${collisionAttempt.status}`
      );
    }

    console.log(`bidder profile test ok: ${baseUrl}`);
  } finally {
    await cleanup([email, collisionEmail]);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
