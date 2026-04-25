import { Resend } from 'resend';

export interface EmailMessage {
  to: { email: string; name?: string };
  subject: string;
  text: string;
  html?: string;
}

let client: Resend | null = null;
function getClient(): Resend {
  if (!client) {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) throw new Error('RESEND_API_KEY not set');
    client = new Resend(apiKey);
  }
  return client;
}

export async function sendEmail(msg: EmailMessage): Promise<void> {
  const fromEmail = process.env.RESEND_FROM_EMAIL ?? 'onboarding@resend.dev';
  const fromName = process.env.RESEND_FROM_NAME ?? 'Warung AI';
  const from = `${fromName} <${fromEmail}>`;

  const to = msg.to.name ? `${msg.to.name} <${msg.to.email}>` : msg.to.email;

  const { error } = await getClient().emails.send({
    from,
    to,
    subject: msg.subject,
    text: msg.text,
    ...(msg.html ? { html: msg.html } : {}),
  });

  if (error) {
    throw new Error(`Resend error: ${error.name}: ${error.message}`);
  }
}
