// =============================================================
// PURPOSE: Post-purchase email (SMTP / Resend) with mock fallback
//
// Plug-and-play: as soon as `SMTP_PASSWORD` and `SENDER_EMAIL` hold real
// values in `.env`, real SMTP requests are made — no code changes needed.
// While they are missing/empty/placeholder, every send logs a
// `[MOCK EMAIL] ...` line to stdout and returns `Ok(())`.
// =============================================================
use crate::config::{Settings, is_placeholder};
use serde::Serialize;
#[derive(Debug, Clone)]
pub struct EmailConfig {
    resend_api_key: String,
    sender: String,
    enabled: bool,
}

impl EmailConfig {
    pub fn from_settings(settings: &Settings) -> Self {
        let enabled =
            !is_placeholder(&settings.resend_api_key) && !is_placeholder(&settings.sender_email);

        Self {
            resend_api_key: settings.resend_api_key.clone(),
            sender: settings.sender_email.clone(),
            enabled,
        }
    }

    pub fn is_enabled(&self) -> bool {
        self.enabled
    }
}

/// Subject line shared by the real send and the mock log.
pub(crate) fn thank_you_subject(order_id: &str) -> String {
    format!("Thank you for your purchase! (Order #{order_id})")
}

/// Plain-text body shared by the real send and the mock log.
pub(crate) fn thank_you_body(
    order_id: &str,
    amount: f64,
    currency: &str,
    support_email: &str,
) -> String {
    format!(
        "Hi,\n\n\
         Thank you for your purchase! Your payment has been confirmed.\n\n\
         Order #: {order_id}\n\
         Amount: {amount:.2} {currency}\n\n\
         If you have any questions, reply to this email or contact our \
         support team at {support_email}.\n\n\
         Thank you for choosing Moc Tam.\n"
    )
}

/// Send the thank-you email. Degrades to a stdout mock when SMTP is not
/// configured. Always returns `Ok(())` in mock mode so the checkout flow
/// never fails because of email delivery.
#[derive(Debug, Serialize)]
struct ResendEmailRequest {
    from: String,
    to: Vec<String>,
    subject: String,
    text: String,
}
pub async fn send_thank_you_email(
    config: &EmailConfig,
    to: &str,
    order_id: &str,
    amount: f64,
    currency: &str,
) -> Result<(), String> {
    if !config.enabled {
        println!(
            "[MOCK EMAIL] Would have sent thank-you email to {to} \
             (Order #{order_id}, {amount:.2} {currency})"
        );
        return Ok(());
    }

    let subject = thank_you_subject(order_id);
    let body = thank_you_body(order_id, amount, currency, &config.sender);

    let request = ResendEmailRequest {
        from: config.sender.clone(),
        to: vec![to.to_owned()],
        subject,
        text: body,
    };

    let client = reqwest::Client::new();

    let response = client
        .post("https://api.resend.com/emails")
        .bearer_auth(&config.resend_api_key)
        .json(&request)
        .send()
        .await
        .map_err(|error| format!("Resend API request failed: {error}"))?;

    let status = response.status();
    let response_body = response
        .text()
        .await
        .map_err(|error| format!("Failed to read Resend response: {error}"))?;

    if !status.is_success() {
        return Err(format!("Resend API returned {status}: {response_body}"));
    }

    println!("[EMAIL] Thank-you email sent to {to} (Order #{order_id})");

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{thank_you_body, thank_you_subject};

    #[test]
    fn subject_contains_order_id() {
        assert_eq!(
            thank_you_subject("123ABC"),
            "Thank you for your purchase! (Order #123ABC)"
        );
    }

    #[test]
    fn body_contains_amount_currency_and_support() {
        let body = thank_you_body("123ABC", 29.99, "USD", "orders@moc-tam.com");
        assert!(body.contains("Order #: 123ABC"));
        assert!(body.contains("Amount: 29.99 USD"));
        assert!(body.contains("orders@moc-tam.com"));
    }
}
