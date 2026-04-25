const MAILJET_URL = 'https://api.mailjet.com/v3.1/send';

export interface MailjetMessage {
  to: { email: string; name?: string };
  subject: string;
  text: string;
  html?: string;
}

export async function sendEmail(msg: MailjetMessage): Promise<void> {
  const apiKey = process.env.MAILJET_APIKEY;
  const secretKey = process.env.MAILJET_SECRETKEY;
  if (!apiKey || !secretKey) {
    throw new Error('MAILJET_APIKEY / MAILJET_SECRETKEY not set');
  }

  const fromEmail = process.env.MAILJET_FROM_EMAIL ?? 'noreply@warungai.app';
  const fromName = process.env.MAILJET_FROM_NAME ?? 'Warung AI';

  const auth = Buffer.from(`${apiKey}:${secretKey}`).toString('base64');

  const res = await fetch(MAILJET_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Basic ${auth}`,
    },
    body: JSON.stringify({
      Messages: [
        {
          From: { Email: fromEmail, Name: fromName },
          To: [{ Email: msg.to.email, Name: msg.to.name ?? msg.to.email }],
          Subject: msg.subject,
          TextPart: msg.text,
          ...(msg.html ? { HTMLPart: msg.html } : {}),
        },
      ],
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Mailjet error ${res.status}: ${body}`);
  }
}
