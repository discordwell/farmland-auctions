import nodemailer from "nodemailer";
import type { PoolClient, QueryResultRow } from "pg";
import { config } from "./config.js";
import { query } from "./db/pool.js";

type NotificationInput = {
  eventType: string;
  recipientEmail: string;
  subject: string;
  body: string;
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
        event_type, recipient_email, subject, body, status, metadata
      )
      VALUES ($1, lower($2), $3, $4, $5, $6::jsonb)
      RETURNING id
    `,
    [
      input.eventType,
      input.recipientEmail,
      input.subject,
      input.body,
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
        event_type, recipient_email, subject, body, status, metadata
      )
      VALUES ($1, lower($2), $3, $4, $5, $6::jsonb)
      RETURNING id
    `,
    [
      input.eventType,
      input.recipientEmail,
      input.subject,
      input.body,
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
      text: row.body as string
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
    await query(
      `
        UPDATE notification_outbox
        SET status = 'failed', last_error = $2, updated_at = now()
        WHERE id = $1
      `,
      [id, error instanceof Error ? error.message : "SMTP delivery failed"]
    );
    throw error;
  }
}
