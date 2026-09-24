// =============================================================
// PURPOSE: SUPABASE (PostgREST) CLIENT
// =============================================================
use crate::config::Settings;
use reqwest::{Client, header};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};

#[derive(Debug, Clone)]
pub struct SupabaseClient {
    client: Client,
    base_url: String,
    key: String,
}

#[derive(Debug, Serialize)]
pub struct FeedbackInsert {
    pub topic: String,
    pub content: String,
    /// Nullable UUID matching Supabase `auth.users.id`.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub user_id: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct FeedbackRow {
    pub id: String,
}

/// A row of the `orders` table (see docs/ORDERS_TABLE.sql).
#[derive(Debug, Serialize)]
pub struct OrderInsert {
    pub paypal_order_id: String,
    pub customer_email: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub customer_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub customer_phone: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub customer_address: Option<String>,
    pub total_amount: f64,
    pub currency: String,
    pub status: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct OrderRow {
    pub paypal_order_id: String,
    pub customer_email: String,
    pub total_amount: f64,
    pub currency: Option<String>,
    pub status: Option<String>,
    pub email_sent: Option<bool>,
}

/// Columns needed by the email dispatch flow.
const ORDER_COLUMNS: &str = "paypal_order_id,customer_email,total_amount,currency,status,email_sent";

fn now_timestamp() -> String {
    chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Secs, true)
}

impl SupabaseClient {
    pub fn new(settings: &Settings) -> Self {
        let mut headers = header::HeaderMap::new();
        headers.insert(
            header::ACCEPT,
            header::HeaderValue::from_static("application/json"),
        );
        headers.insert(
            header::CONTENT_TYPE,
            header::HeaderValue::from_static("application/json"),
        );
        headers.insert(
            "apikey",
            header::HeaderValue::from_str(&settings.supabase_key)
                .expect("SUPABASE key must be a valid header value"),
        );

        let client = Client::builder()
            .default_headers(headers)
            .build()
            .expect("Failed to build Supabase reqwest client");

        Self {
            client,
            base_url: settings.supabase_url.trim_end_matches('/').to_owned(),
            key: settings.supabase_key.clone(),
        }
    }

    /// Insert a row into the `feedbacks` table via PostgREST and return the
    /// server-generated UUID of the new row.
    pub async fn insert_feedback(&self, row: &FeedbackInsert) -> Result<String, String> {
        let url = format!("{}/rest/v1/feedbacks", self.base_url);

        let response = self
            .client
            .post(&url)
            .bearer_auth(&self.key)
            // Ask PostgREST to return the inserted row so we can read its id.
            .header("Prefer", "return=representation")
            .json(row)
            .send()
            .await
            .map_err(|error| format!("Failed to reach Supabase: {error}"))?;

        if !response.status().is_success() {
            let status = response.status();
            let error_text = response.text().await.unwrap_or_default();
            return Err(format!("Supabase insert failed ({status}): {error_text}"));
        }

        let rows: Vec<FeedbackRow> = response
            .json()
            .await
            .map_err(|error| format!("Failed to parse Supabase response: {error}"))?;

        rows.into_iter()
            .next()
            .map(|row| row.id)
            .ok_or_else(|| "Supabase returned no row for the inserted feedback.".to_owned())
    }

    // ------------------------------------------------------------------
    // Orders (PostgREST)
    // ------------------------------------------------------------------

    /// Store the initial PENDING order that links the customer email to the
    /// PayPal order id.
    pub async fn insert_order(&self, row: &OrderInsert) -> Result<(), String> {
        let url = format!("{}/rest/v1/orders", self.base_url);

        let response = self
            .client
            .post(&url)
            .bearer_auth(&self.key)
            .header("Prefer", "return=minimal")
            .json(row)
            .send()
            .await
            .map_err(|error| format!("Failed to reach Supabase: {error}"))?;

        if !response.status().is_success() {
            let status = response.status();
            let error_text = response.text().await.unwrap_or_default();
            return Err(format!("Supabase order insert failed ({status}): {error_text}"));
        }

        Ok(())
    }

    /// Update `status` (+ `updated_at`) for an order. Returns how many rows
    /// were affected (0 means no matching order record).
    pub async fn mark_order_status(
        &self,
        paypal_order_id: &str,
        status: &str,
    ) -> Result<usize, String> {
        let url = format!(
            "{}/rest/v1/orders?paypal_order_id=eq.{}",
            self.base_url, paypal_order_id
        );
        let body = json!({ "status": status, "updated_at": now_timestamp() });

        let response = self
            .client
            .patch(&url)
            .bearer_auth(&self.key)
            .header("Prefer", "return=representation")
            .json(&body)
            .send()
            .await
            .map_err(|error| format!("Failed to reach Supabase: {error}"))?;

        if !response.status().is_success() {
            let status_code = response.status();
            let error_text = response.text().await.unwrap_or_default();
            return Err(format!(
                "Supabase order update failed ({status_code}): {error_text}"
            ));
        }

        let rows: Vec<Value> = response
            .json()
            .await
            .map_err(|error| format!("Failed to parse Supabase response: {error}"))?;

        Ok(rows.len())
    }

    /// Idempotency guard: flips `email_sent` from false to true and returns the
    /// order row only for the caller that won the flip. Returns `None` when the
    /// email was already sent (or no order record exists).
    pub async fn claim_email_send(&self, paypal_order_id: &str) -> Result<Option<OrderRow>, String> {
        let url = format!(
            "{}/rest/v1/orders?paypal_order_id=eq.{}&email_sent=eq.false&select={}",
            self.base_url, paypal_order_id, ORDER_COLUMNS
        );
        let body = json!({ "email_sent": true, "updated_at": now_timestamp() });

        let response = self
            .client
            .patch(&url)
            .bearer_auth(&self.key)
            .header("Prefer", "return=representation")
            .json(&body)
            .send()
            .await
            .map_err(|error| format!("Failed to reach Supabase: {error}"))?;

        if !response.status().is_success() {
            let status_code = response.status();
            let error_text = response.text().await.unwrap_or_default();
            return Err(format!(
                "Supabase email claim failed ({status_code}): {error_text}"
            ));
        }

        let rows: Vec<OrderRow> = response
            .json()
            .await
            .map_err(|error| format!("Failed to parse Supabase response: {error}"))?;

        Ok(rows.into_iter().next())
    }
}
