// =============================================================
// PURPOSE: PayPal webhook signature verification
//
// Plug-and-play: while `PAYPAL_WEBHOOK_ID` is missing/empty/placeholder the
// verifier logs a `[MOCK WEBHOOK]` warning and accepts the event so the flow
// still works end-to-end in development. With a real webhook id configured,
// every request is verified against PayPal's verify-webhook-signature API —
// no code changes needed.
// =============================================================
use crate::config::{Settings, is_placeholder};
use crate::paypal_client::PayPalClient;
use serde::Deserialize;
use serde_json::value::RawValue;
use serde_json::json;

/// The five `PAYPAL-*` headers PayPal sends with every webhook delivery.
#[derive(Debug, Clone)]
pub struct WebhookHeaders {
    pub transmission_id: String,
    pub transmission_sig: String,
    pub cert_url: String,
    pub auth_algo: String,
    pub transmission_time: String,
}

impl WebhookHeaders {
    /// Extract the verification headers from an actix `HeaderMap`.
    /// Returns `None` when any required header is absent.
    pub fn from_headers(headers: &actix_web::http::header::HeaderMap) -> Option<Self> {
        fn header_value(
            headers: &actix_web::http::header::HeaderMap,
            name: &str,
        ) -> Option<String> {
            headers
                .get(name)?
                .to_str()
                .ok()
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(str::to_owned)
        }

        Some(Self {
            transmission_id: header_value(headers, "paypal-transmission-id")?,
            transmission_sig: header_value(headers, "paypal-transmission-sig")?,
            cert_url: header_value(headers, "paypal-cert-url")?,
            auth_algo: header_value(headers, "paypal-auth-algo")?,
            transmission_time: header_value(headers, "paypal-transmission-time")?,
        })
    }
}

#[derive(Deserialize)]
struct VerifyWebhookResponse {
    verification_status: String,
}

/// Verify that a webhook event really came from PayPal.
///
/// * Unconfigured (`PAYPAL_WEBHOOK_ID` missing/placeholder) → logs
///   `[MOCK WEBHOOK] ...` and returns `Ok(true)` so local flows keep working.
/// * Configured → calls PayPal's `/v1/notifications/verify-webhook-signature`
///   and returns whether the signature is valid.
pub async fn verify_webhook_signature(
    paypal_client: &PayPalClient,
    settings: &Settings,
    headers: &WebhookHeaders,
    raw_event: &RawValue,
) -> Result<bool, String> {
    if is_placeholder(&settings.paypal_webhook_id) {
        println!(
            "[MOCK WEBHOOK] PAYPAL_WEBHOOK_ID is not configured — skipping \
             signature verification for transmission {}",
            headers.transmission_id
        );
        return Ok(true);
    }

    let token = paypal_client.get_access_token().await?;
    let url = format!(
        "{}/v1/notifications/verify-webhook-signature",
        paypal_client.base_url()
    );

    // `raw_event` preserves the exact JSON bytes PayPal delivered, which the
    // signature verification depends on.
    let payload = json!({
        "auth_algo": headers.auth_algo,
        "cert_url": headers.cert_url,
        "transmission_id": headers.transmission_id,
        "transmission_sig": headers.transmission_sig,
        "transmission_time": headers.transmission_time,
        "webhook_event": raw_event,
        "webhook_id": settings.paypal_webhook_id,
    });

    let response = reqwest::Client::new()
        .post(&url)
        .bearer_auth(token)
        .json(&payload)
        .send()
        .await
        .map_err(|error| format!("Failed to reach PayPal verify endpoint: {error}"))?;

    if !response.status().is_success() {
        let status = response.status();
        let error_text = response.text().await.unwrap_or_default();
        return Err(format!(
            "PayPal verify-webhook-signature failed ({status}): {error_text}"
        ));
    }

    let body: VerifyWebhookResponse = response
        .json()
        .await
        .map_err(|error| format!("Failed to parse verify response: {error}"))?;

    Ok(body.verification_status.eq_ignore_ascii_case("SUCCESS"))
}
