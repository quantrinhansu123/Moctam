// =============================================================
// PURPOSE: PayPal order endpoints + post-purchase email dispatch
// =============================================================
pub mod email;
pub mod paypal;

use actix_web::{HttpRequest, HttpResponse, Responder, post, web};
use serde::{Deserialize, Serialize};
use serde_json::value::RawValue;
use serde_json::{Value, json};

use crate::config::Settings;
use crate::paypal_client::PayPalClient;
use crate::supabase_client::{OrderInsert, SupabaseClient};
use email::EmailConfig;
use paypal::WebhookHeaders;

// =============================================================
// REQUEST / RESPONSE TYPES
// =============================================================

#[derive(Deserialize)]
pub struct CreateOrderRequest {
    /// Customer email — required to store the order and send the thank-you
    /// email. Optional at the API level for backward compatibility; when
    /// absent the order is still created but no receipt can be sent.
    #[serde(default)]
    pub email: Option<String>,
    /// Customer full name (shipping / contact).
    #[serde(default)]
    pub name: Option<String>,
    /// Customer phone number.
    #[serde(default)]
    pub phone: Option<String>,
    /// Customer shipping address.
    #[serde(default)]
    pub address: Option<String>,
    /// Cart total. Accepts a JSON number (29.99) or string ("29.99").
    #[serde(default)]
    pub amount: Option<Value>,
    /// ISO-4217 code, defaults to USD.
    #[serde(default)]
    pub currency: Option<String>,
    /// Legacy payload (old clients sent only a product id).
    #[serde(default)]
    pub product_id: Option<String>,
}

#[derive(Serialize)]
pub struct CreateOrderResponse {
    pub paypal_order_id: String,
    pub approve_url: String,
}

#[derive(Serialize)]
pub struct ManualOrderResponse {
    pub status: &'static str,
    pub message: &'static str,
    pub order_id: String,
}

#[derive(Deserialize)]
pub struct CaptureOrderRequest {
    pub paypal_order_id: String,
}

#[derive(Serialize)]
pub struct CaptureOrderResponse {
    pub status: &'static str,
    pub message: String,
    pub paypal_order_id: String,
}

#[derive(Serialize)]
struct ErrorResponse {
    status: &'static str,
    message: String,
}

fn error_response(status: actix_web::http::StatusCode, message: impl Into<String>) -> HttpResponse {
    HttpResponse::build(status).json(ErrorResponse {
        status: "error",
        message: message.into(),
    })
}

// =============================================================
// HELPERS
// =============================================================

/// Accept a JSON number or string as a monetary amount.
fn parse_amount(value: Option<&Value>) -> Option<f64> {
    match value? {
        Value::Number(number) => number.as_f64(),
        Value::String(text) => text.trim().parse::<f64>().ok(),
        _ => None,
    }
}

fn is_valid_email(candidate: &str) -> bool {
    if candidate.len() > 254 || candidate.chars().any(char::is_whitespace) {
        return false;
    }
    let Some((local, domain)) = candidate.split_once('@') else {
        return false;
    };
    !local.is_empty()
        && !domain.contains('@')
        && domain.contains('.')
        && !domain.starts_with('.')
        && !domain.ends_with('.')
        && !domain.contains("..")
}

fn optional_trimmed(value: Option<&str>) -> Option<String> {
    value
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_owned)
}

fn is_valid_phone(candidate: &str) -> bool {
    let digits = candidate.chars().filter(|c| c.is_ascii_digit()).count();
    digits >= 8
        && digits <= 15
        && candidate.len() <= 40
        && candidate
            .chars()
            .all(|c| c.is_ascii_digit() || matches!(c, '+' | ' ' | '(' | ')' | '-' | '.'))
}

/// Temporary order ids while PayPal Live is restricted (`manual-<nanos>`).
fn new_manual_order_id() -> String {
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    format!("manual-{nanos}")
}

fn resolve_amount_and_currency(
    amount: Option<&Value>,
    currency: Option<&str>,
    product_id: Option<&str>,
) -> Result<(f64, String), HttpResponse> {
    let amount = match parse_amount(amount) {
        Some(value) if value.is_finite() && value > 0.0 && value <= 9_999.99 => value,
        Some(_) => {
            return Err(error_response(
                actix_web::http::StatusCode::BAD_REQUEST,
                "amount must be greater than 0 and at most 9999.99.",
            ));
        }
        None if product_id.is_some() => 1.00,
        None => {
            return Err(error_response(
                actix_web::http::StatusCode::BAD_REQUEST,
                "amount is required.",
            ));
        }
    };

    let currency = currency
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or("USD")
        .to_ascii_uppercase();
    if currency.len() != 3 {
        return Err(error_response(
            actix_web::http::StatusCode::BAD_REQUEST,
            "currency must be a 3-letter ISO-4217 code.",
        ));
    }

    Ok((amount, currency))
}

/// Mark the order COMPLETED, then claim the single email send and spawn the
/// thank-you delivery in the background. Shared by the capture endpoint and
/// the webhook handler (idempotent from both sides).
async fn complete_order_and_queue_email(
    supabase: &SupabaseClient,
    email_config: &EmailConfig,
    paypal_order_id: &str,
    source: &str,
) {
    match supabase
        .mark_order_status(paypal_order_id, "COMPLETED")
        .await
    {
        Ok(0) => println!(
            "[ORDERS] ({source}) no order record found for {paypal_order_id} — was insert_order run?"
        ),
        Ok(_) => println!("[ORDERS] ({source}) {paypal_order_id} → COMPLETED"),
        Err(error) => {
            eprintln!("[ORDERS] ({source}) failed to mark {paypal_order_id} COMPLETED: {error}")
        }
    }

    match supabase.claim_email_send(paypal_order_id).await {
        Ok(Some(order)) => {
            let recipient = order.customer_email.clone();
            let amount = order.total_amount;
            let currency = order.currency.clone().unwrap_or_else(|| "USD".to_owned());
            println!(
                "[EMAIL] ({source}) queueing thank-you email to {recipient} (Order #{paypal_order_id})"
            );

            let config = email_config.clone();
            let order_id = paypal_order_id.to_owned();
            actix_web::rt::spawn(async move {
                match email::send_thank_you_email(&config, &recipient, &order_id, amount, &currency)
                    .await
                {
                    Ok(()) => println!("[EMAIL] thank-you email delivered for {order_id}"),
                    Err(error) => eprintln!("[EMAIL] failed for {order_id}: {error}"),
                }
            });
        }
        Ok(None) => println!(
            "[EMAIL] ({source}) skipping email for {paypal_order_id}: already sent or no order record"
        ),
        Err(error) => {
            eprintln!("[EMAIL] ({source}) could not claim email for {paypal_order_id}: {error}")
        }
    }
}

// =============================================================
// ENDPOINTS
// =============================================================

/// Temporary checkout path: save contact + cart total to Supabase without PayPal.
/// Use while the Live merchant account is restricted (`PAYEE_ACCOUNT_RESTRICTED`).
#[post("/api/orders/manual")]
pub async fn create_manual_order(
    req: web::Json<CreateOrderRequest>,
    supabase: web::Data<SupabaseClient>,
) -> impl Responder {
    let Some(customer_email) = optional_trimmed(req.email.as_deref()) else {
        return error_response(
            actix_web::http::StatusCode::BAD_REQUEST,
            "Email is required.",
        );
    };
    if !is_valid_email(&customer_email) {
        return error_response(
            actix_web::http::StatusCode::BAD_REQUEST,
            "Please provide a valid email address.",
        );
    }

    let Some(customer_name) = optional_trimmed(req.name.as_deref()) else {
        return error_response(
            actix_web::http::StatusCode::BAD_REQUEST,
            "Name is required.",
        );
    };
    if !(2..=120).contains(&customer_name.chars().count()) {
        return error_response(
            actix_web::http::StatusCode::BAD_REQUEST,
            "name must be between 2 and 120 characters.",
        );
    }

    let Some(customer_phone) = optional_trimmed(req.phone.as_deref()) else {
        return error_response(
            actix_web::http::StatusCode::BAD_REQUEST,
            "Phone is required.",
        );
    };
    if !is_valid_phone(&customer_phone) {
        return error_response(
            actix_web::http::StatusCode::BAD_REQUEST,
            "Please provide a valid phone number.",
        );
    }

    let Some(customer_address) = optional_trimmed(req.address.as_deref()) else {
        return error_response(
            actix_web::http::StatusCode::BAD_REQUEST,
            "Address is required.",
        );
    };
    if !(5..=500).contains(&customer_address.chars().count()) {
        return error_response(
            actix_web::http::StatusCode::BAD_REQUEST,
            "address must be between 5 and 500 characters.",
        );
    }

    let (amount, currency) = match resolve_amount_and_currency(
        req.amount.as_ref(),
        req.currency.as_deref(),
        req.product_id.as_deref(),
    ) {
        Ok(value) => value,
        Err(response) => return response,
    };

    let order_id = new_manual_order_id();

    // Insert core columns first (matches older `orders` tables without contact fields).
    let mut row = OrderInsert {
        paypal_order_id: order_id.clone(),
        customer_email: customer_email.clone(),
        customer_name: None,
        customer_phone: None,
        customer_address: None,
        total_amount: amount,
        currency: currency.clone(),
        status: "PENDING".to_owned(),
    };

    if let Err(error) = supabase.insert_order(&row).await {
        eprintln!("[ORDERS] core insert failed for {order_id}: {error}");
        // Last resort: store the lead in `feedbacks` (known-working path).
        let feedback = crate::supabase_client::FeedbackInsert {
            topic: format!("Order · {amount:.2} {currency}"),
            content: format!(
                "ORDER LEAD\nName: {customer_name}\nEmail: {customer_email}\nPhone: {customer_phone}\nAddress: {customer_address}\nAmount: {amount:.2} {currency}\nOrders insert error: {error}"
            ),
            user_id: None,
        };
        return match supabase.insert_feedback(&feedback).await {
            Ok(feedback_id) => {
                order_id = format!("feedback-{feedback_id}");
                println!(
                    "[ORDERS] MANUAL order stored via feedbacks as {order_id} for {customer_email}"
                );
                HttpResponse::Created().json(ManualOrderResponse {
                    status: "success",
                    message: "Order saved.",
                    order_id,
                })
            }
            Err(feedback_error) => {
                eprintln!(
                    "[ORDERS] feedback fallback also failed for {customer_email}: {feedback_error}"
                );
                error_response(
                    actix_web::http::StatusCode::INTERNAL_SERVER_ERROR,
                    format!("Unable to save order: {error}"),
                )
            }
        };
    }

    // Best-effort: attach contact fields when the columns exist.
    row.customer_name = Some(customer_name);
    row.customer_phone = Some(customer_phone);
    row.customer_address = Some(customer_address);
    if let Err(error) = supabase
        .update_order_contact(
            &order_id,
            row.customer_name.as_deref(),
            row.customer_phone.as_deref(),
            row.customer_address.as_deref(),
        )
        .await
    {
        eprintln!(
            "[ORDERS] contact update skipped for {order_id} (columns may be missing): {error}"
        );
    }

    println!("[ORDERS] MANUAL order {order_id} stored for {customer_email}");
    HttpResponse::Created().json(ManualOrderResponse {
        status: "success",
        message: "Order saved.",
        order_id,
    })
}

#[post("/api/orders/paypal/create")]
pub async fn create_paypal_order(
    req: web::Json<CreateOrderRequest>,
    paypal_client: web::Data<PayPalClient>,
    supabase: web::Data<SupabaseClient>,
) -> impl Responder {
    // 1. Validate customer contact fields (optional individually; checked when present).
    let email = optional_trimmed(req.email.as_deref());
    if let Some(ref customer_email) = email
        && !is_valid_email(customer_email)
    {
        return error_response(
            actix_web::http::StatusCode::BAD_REQUEST,
            "Please provide a valid email address.",
        );
    }

    let customer_name = optional_trimmed(req.name.as_deref());
    if let Some(ref name) = customer_name {
        let len = name.chars().count();
        if len < 2 || len > 120 {
            return error_response(
                actix_web::http::StatusCode::BAD_REQUEST,
                "name must be between 2 and 120 characters.",
            );
        }
    }

    let customer_phone = optional_trimmed(req.phone.as_deref());
    if let Some(ref phone) = customer_phone
        && !is_valid_phone(phone)
    {
        return error_response(
            actix_web::http::StatusCode::BAD_REQUEST,
            "Please provide a valid phone number.",
        );
    }

    let customer_address = optional_trimmed(req.address.as_deref());
    if let Some(ref shipping_address) = customer_address {
        let len = shipping_address.chars().count();
        if len < 5 || len > 500 {
            return error_response(
                actix_web::http::StatusCode::BAD_REQUEST,
                "address must be between 5 and 500 characters.",
            );
        }
    }

    // 2. Resolve the amount: payload wins, legacy product_id falls back to
    //    the old fixed price, otherwise reject.
    let amount = match parse_amount(req.amount.as_ref()) {
        Some(value) if value.is_finite() && value > 0.0 && value <= 9_999.99 => value,
        Some(_) => {
            return error_response(
                actix_web::http::StatusCode::BAD_REQUEST,
                "amount must be greater than 0 and at most 9999.99.",
            );
        }
        // Legacy payload without an amount (matches the $1/box catalog price).
        None if req.product_id.is_some() => 1.00,
        None => {
            return error_response(
                actix_web::http::StatusCode::BAD_REQUEST,
                "amount is required.",
            );
        }
    };

    let currency = req
        .currency
        .as_deref()
        .map(str::trim)
        .unwrap_or("USD")
        .to_ascii_uppercase();
    if currency.len() != 3 {
        return error_response(
            actix_web::http::StatusCode::BAD_REQUEST,
            "currency must be a 3-letter ISO-4217 code.",
        );
    }

    println!("Initiating PayPal checkout: {amount:.2} {currency}");

    // 3. Create the order in PayPal.
    let order_res = match paypal_client.create_order(amount, &currency).await {
        Ok(order) => order,
        Err(error) => {
            eprintln!("PayPal Create Error: {error}");
            return error_response(
                actix_web::http::StatusCode::INTERNAL_SERVER_ERROR,
                "Failed to communicate with PayPal",
            );
        }
    };

    // 4. Store the PENDING order (contact ↔ paypal_order_id) in Supabase.
    //    A failed insert must not block checkout — the webhook path then
    //    simply logs that no record exists.
    if let Some(customer_email) = email {
        let row = OrderInsert {
            paypal_order_id: order_res.id.clone(),
            customer_email: customer_email.clone(),
            customer_name,
            customer_phone,
            customer_address,
            total_amount: amount,
            currency: currency.clone(),
            status: "PENDING".to_owned(),
        };
        match supabase.insert_order(&row).await {
            Ok(()) => println!(
                "[ORDERS] PENDING order {} stored for {customer_email}",
                order_res.id
            ),
            Err(error) => eprintln!(
                "[ORDERS] failed to store PENDING order {}: {error}",
                order_res.id
            ),
        }
    } else {
        println!(
            "[ORDERS] no email provided for {} — post-purchase email will be skipped",
            order_res.id
        );
    }

    // 5. Return the approval URL for the frontend redirect.
    let approve_url = order_res
        .links
        .into_iter()
        .find(|link| link.rel == "approve")
        .map(|link| link.href)
        .unwrap_or_default();

    HttpResponse::Ok().json(CreateOrderResponse {
        paypal_order_id: order_res.id,
        approve_url,
    })
}

#[post("/api/orders/paypal/capture")]
pub async fn capture_paypal_order(
    req: web::Json<CaptureOrderRequest>,
    paypal_client: web::Data<PayPalClient>,
    supabase: web::Data<SupabaseClient>,
    email_config: web::Data<EmailConfig>,
) -> impl Responder {
    match paypal_client.capture_order(&req.paypal_order_id).await {
        Ok(capture_res) if capture_res.status == "COMPLETED" => {
            complete_order_and_queue_email(
                &supabase,
                &email_config,
                &req.paypal_order_id,
                "capture",
            )
            .await;

            HttpResponse::Ok().json(CaptureOrderResponse {
                status: "success",
                message: "Order captured successfully.".to_owned(),
                paypal_order_id: capture_res.id,
            })
        }
        Ok(capture_res) => {
            eprintln!("Order not completed. Status: {}", capture_res.status);
            if capture_res.status == "FAILED" {
                if let Err(error) = supabase
                    .mark_order_status(&req.paypal_order_id, "FAILED")
                    .await
                {
                    eprintln!("[ORDERS] failed to mark FAILED: {error}");
                }
            }
            error_response(
                actix_web::http::StatusCode::BAD_REQUEST,
                format!("Order status is not COMPLETED: {}", capture_res.status),
            )
        }
        Err(error) => {
            eprintln!("PayPal Capture Error: {error}");
            error_response(
                actix_web::http::StatusCode::INTERNAL_SERVER_ERROR,
                "Failed to capture payment via PayPal",
            )
        }
    }
}

/// PayPal webhook receiver: `PAYMENT.CAPTURE.COMPLETED` (and friends).
#[post("/api/webhooks/paypal")]
pub async fn paypal_webhook(
    http_req: HttpRequest,
    paypal_client: web::Data<PayPalClient>,
    supabase: web::Data<SupabaseClient>,
    email_config: web::Data<EmailConfig>,
    settings: web::Data<Settings>,
    // Payload extractor must come last.
    body: web::Bytes,
) -> impl Responder {
    // 1. Parse the raw body, keeping the exact bytes for signature checks.
    let text = match std::str::from_utf8(&body) {
        Ok(text) => text,
        Err(_) => {
            return error_response(
                actix_web::http::StatusCode::BAD_REQUEST,
                "Body must be UTF-8 JSON.",
            );
        }
    };
    let raw_event: &RawValue = match serde_json::from_str(text) {
        Ok(raw) => raw,
        Err(_) => {
            return error_response(
                actix_web::http::StatusCode::BAD_REQUEST,
                "Body must be valid JSON.",
            );
        }
    };
    let event: Value = match serde_json::from_str(text) {
        Ok(value) => value,
        Err(_) => {
            return error_response(
                actix_web::http::StatusCode::BAD_REQUEST,
                "Body must be valid JSON.",
            );
        }
    };

    // 2. Extract the PayPal signature headers.
    let Some(signature_headers) = WebhookHeaders::from_headers(http_req.headers()) else {
        return error_response(
            actix_web::http::StatusCode::BAD_REQUEST,
            "Missing PayPal webhook signature headers.",
        );
    };

    // 3. Verify the signature (mock-accepts while PAYPAL_WEBHOOK_ID is unset).
    match paypal::verify_webhook_signature(&paypal_client, &settings, &signature_headers, raw_event)
        .await
    {
        Ok(true) => {}
        Ok(false) => {
            eprintln!(
                "[WEBHOOK] signature verification FAILED for transmission {}",
                signature_headers.transmission_id
            );
            return error_response(
                actix_web::http::StatusCode::UNAUTHORIZED,
                "Webhook signature verification failed.",
            );
        }
        Err(error) => {
            eprintln!("[WEBHOOK] verification error: {error}");
            return error_response(
                actix_web::http::StatusCode::INTERNAL_SERVER_ERROR,
                "Webhook verification error.",
            );
        }
    }

    // 4. Handle the event type.
    let event_type = event
        .get("event_type")
        .and_then(Value::as_str)
        .unwrap_or_default();

    match event_type {
        "PAYMENT.CAPTURE.COMPLETED" => {
            let order_id = event
                .pointer("/resource/supplementary_data/related_ids/order_id")
                .and_then(Value::as_str);

            match order_id {
                Some(order_id) => {
                    complete_order_and_queue_email(&supabase, &email_config, order_id, "webhook")
                        .await;
                    HttpResponse::Ok().json(json!({
                        "status": "processed",
                        "paypal_order_id": order_id,
                    }))
                }
                None => {
                    println!("[WEBHOOK] capture completed but no related order id — ignored");
                    HttpResponse::Ok().json(json!({ "status": "ignored" }))
                }
            }
        }
        "PAYMENT.CAPTURE.DENIED" | "PAYMENT.CAPTURE.FAILED" => {
            if let Some(order_id) = event
                .pointer("/resource/supplementary_data/related_ids/order_id")
                .and_then(Value::as_str)
            {
                if let Err(error) = supabase.mark_order_status(order_id, "FAILED").await {
                    eprintln!("[ORDERS] webhook failed to mark {order_id} FAILED: {error}");
                }
            }
            HttpResponse::Ok().json(json!({ "status": "processed" }))
        }
        other => {
            println!("[WEBHOOK] ignored event type: {other}");
            HttpResponse::Ok().json(json!({ "status": "ignored" }))
        }
    }
}

// =============================================================
// TESTS
// =============================================================

#[cfg(test)]
mod tests {
    use super::{is_valid_email, parse_amount};
    use serde_json::json;

    #[test]
    fn parses_amount_from_number_and_string() {
        assert_eq!(parse_amount(Some(&json!(29.99))), Some(29.99));
        assert_eq!(parse_amount(Some(&json!("49.99"))), Some(49.99));
        assert_eq!(parse_amount(Some(&json!(" 15 "))), Some(15.0));
        assert_eq!(parse_amount(Some(&json!("abc"))), None);
        assert_eq!(parse_amount(Some(&json!(true))), None);
        assert_eq!(parse_amount(None), None);
    }

    #[test]
    fn validates_email_addresses() {
        assert!(is_valid_email("buyer@example.com"));
        assert!(is_valid_email("first.last@sub.domain.co"));
        assert!(!is_valid_email(""));
        assert!(!is_valid_email("not-an-email"));
        assert!(!is_valid_email("@example.com"));
        assert!(!is_valid_email("buyer@"));
        assert!(!is_valid_email("buyer@example."));
        assert!(!is_valid_email("buyer@.example.com"));
        assert!(!is_valid_email("two@@example.com"));
        assert!(!is_valid_email("space in@example.com"));
    }
}
