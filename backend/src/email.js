import { isPlaceholder, settings } from "./config.js";

export function emailEnabled() {
  return (
    !isPlaceholder(settings.resendApiKey) && !isPlaceholder(settings.senderEmail)
  );
}

export async function sendThankYouEmail(to, orderId, amount, currency) {
  if (!emailEnabled()) {
    console.log(
      `[MOCK EMAIL] Would have sent thank-you email to ${to} (Order #${orderId}, ${Number(amount).toFixed(2)} ${currency})`,
    );
    return;
  }

  const subject = `Thank you for your purchase! (Order #${orderId})`;
  const text = `Hi,\n\nThank you for your purchase! Your payment has been confirmed.\n\nOrder #: ${orderId}\nAmount: ${Number(amount).toFixed(2)} ${currency}\n\nIf you have any questions, reply to this email or contact our support team at ${settings.senderEmail}.\n\nThank you for choosing Moc Tam.\n`;

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${settings.resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: settings.senderEmail,
      to: [to],
      subject,
      text,
    }),
  });

  const body = await response.text();
  if (!response.ok) {
    throw new Error(`Resend API returned ${response.status}: ${body}`);
  }

  console.log(`[EMAIL] Thank-you email sent to ${to} (Order #${orderId})`);
}
