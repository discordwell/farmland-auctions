import nodemailer from "nodemailer";
import type { PoolClient, QueryResultRow } from "pg";
import { config } from "./config.js";
import { query } from "./db/pool.js";

type NotificationInput = {
  eventType: string;
  recipientEmail: string;
  subject: string;
  body: string;
  htmlBody?: string | null;
  metadata?: Record<string, unknown>;
};

function smtpReady() {
  return Boolean(config.smtp.host && config.smtp.from);
}

function transporter() {
  return nodemailer.createTransport({
    auth: config.smtp.user
      ? {
          pass: config.smtp.password,
          user: config.smtp.user
        }
      : undefined,
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.secure
  });
}

export async function enqueueNotification(input: NotificationInput) {
  const result = await query<{ id: string }>(
    `
      INSERT INTO notification_outbox (
        event_type, recipient_email, subject, body, html_body, status, metadata
      )
      VALUES ($1, lower($2), $3, $4, $5, $6, $7::jsonb)
      RETURNING id
    `,
    [
      input.eventType,
      input.recipientEmail,
      input.subject,
      input.body,
      input.htmlBody ?? null,
      smtpReady() ? "pending" : "queued",
      JSON.stringify(input.metadata ?? {})
    ]
  );

  if (smtpReady()) {
    await deliverNotification(result.rows[0].id);
  }

  return result.rows[0].id;
}

export async function enqueueNotificationInTransaction(
  client: PoolClient,
  input: NotificationInput
) {
  const result = await client.query<{ id: string }>(
    `
      INSERT INTO notification_outbox (
        event_type, recipient_email, subject, body, html_body, status, metadata
      )
      VALUES ($1, lower($2), $3, $4, $5, $6, $7::jsonb)
      RETURNING id
    `,
    [
      input.eventType,
      input.recipientEmail,
      input.subject,
      input.body,
      input.htmlBody ?? null,
      smtpReady() ? "pending" : "queued",
      JSON.stringify(input.metadata ?? {})
    ]
  );
  return result.rows[0].id;
}

export async function deliverNotification(id: string) {
  const pending = await query<QueryResultRow>(
    "SELECT * FROM notification_outbox WHERE id = $1",
    [id]
  );
  if (!pending.rowCount) {
    throw new Error("Notification not found");
  }

  const row = pending.rows[0];
  if (!smtpReady()) {
    await query(
      "UPDATE notification_outbox SET status = 'queued', updated_at = now() WHERE id = $1",
      [id]
    );
    return { delivered: false, reason: "SMTP is not configured" };
  }

  try {
    await transporter().sendMail({
      from: config.smtp.from,
      to: row.recipient_email as string,
      subject: row.subject as string,
      text: row.body as string,
      html: row.html_body ? (row.html_body as string) : undefined
    });

    await query(
      `
        UPDATE notification_outbox
        SET status = 'sent', sent_at = now(), last_error = NULL, updated_at = now()
        WHERE id = $1
      `,
      [id]
    );
    return { delivered: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "SMTP delivery failed";
    // attempts column added in migration 005; default 0. Exponential backoff capped at 30 min.
    await query(
      `
        UPDATE notification_outbox
        SET status = 'failed',
            attempts = COALESCE(attempts, 0) + 1,
            last_error = $2,
            next_attempt_at = now() + (LEAST(power(2, COALESCE(attempts, 0)), 30) * interval '1 minute'),
            updated_at = now()
        WHERE id = $1
      `,
      [id, message]
    );
    throw error;
  }
}

/**
 * Drain pending/queued/failed notifications eligible for retry.
 * Caller decides cadence (the in-process worker calls every 30s).
 */
export async function drainOutbox(limit = 20) {
  if (!smtpReady()) return { drained: 0, skipped: 0 };

  const due = await query<{ id: string }>(
    `
      SELECT id FROM notification_outbox
      WHERE status IN ('pending', 'queued', 'failed')
        AND COALESCE(attempts, 0) < 5
        AND (next_attempt_at IS NULL OR next_attempt_at <= now())
      ORDER BY created_at ASC
      LIMIT $1
    `,
    [limit]
  );

  let drained = 0;
  let skipped = 0;
  for (const row of due.rows) {
    try {
      await deliverNotification(row.id);
      drained += 1;
    } catch {
      skipped += 1;
    }
  }
  return { drained, skipped };
}
