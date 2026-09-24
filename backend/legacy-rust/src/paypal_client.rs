use crate::config::Settings;
use reqwest::{Client, header};
use serde::Deserialize;
use serde_json::json;
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::sync::RwLock;

#[derive(Debug, Clone)]
pub struct PayPalClient {
    client: Client,
    base_url: String,
    client_id: String,
    secret: String,
    // Cache: Token and expiration time
    token_cache: Arc<RwLock<Option<(String, Instant)>>>,
}

#[derive(Deserialize)]
struct AuthResponse {
    access_token: String,
    expires_in: u64, // usually seconds, e.g., 32400
}

#[derive(Deserialize)]
pub struct OrderCreateResponse {
    pub id: String,
    pub status: String,
    pub links: Vec<PayPalLink>,
}

#[derive(Deserialize, Clone)]
pub struct PayPalLink {
    pub href: String,
    pub rel: String,
    pub method: String,
}

#[derive(Deserialize)]
pub struct OrderCaptureResponse {
    pub id: String,
    pub status: String,
}

impl PayPalClient {
    pub fn new(settings: &Settings) -> Self {
        let mode = settings.paypal_mode.trim().to_lowercase();
        let base_url = match mode.as_str() {
            "live" | "production" => "https://api-m.paypal.com".to_string(),
            "sandbox" | "test" => "https://api-m.sandbox.paypal.com".to_string(),
            other => panic!("PAYPAL_MODE must be \"live\" or \"sandbox\", got: \"{other}\""),
        };
        println!("PayPal mode: {mode} -> {base_url}");

        let mut headers = header::HeaderMap::new();
        headers.insert(
            header::ACCEPT,
            header::HeaderValue::from_static("application/json"),
        );
        headers.insert(
            header::ACCEPT_LANGUAGE,
            header::HeaderValue::from_static("en_US"),
        );

        let client = Client::builder()
            .default_headers(headers)
            .build()
            .expect("Failed to build reqwest client");

        Self {
            client,
            base_url,
            client_id: settings.paypal_client_id.clone(),
            secret: settings.paypal_secret.clone(),
            token_cache: Arc::new(RwLock::new(None)),
        }
    }

    /// Base URL of the PayPal API for the configured mode.
    pub fn base_url(&self) -> &str {
        &self.base_url
    }

    /// Retrieve the token from cache if valid, otherwise fetch a new one.
    pub(crate) async fn get_access_token(&self) -> Result<String, String> {
        // Read from cache first
        {
            let cache = self.token_cache.read().await;
            if let Some((token, expiry)) = cache.as_ref() {
                // Buffer of 60 seconds to avoid expiration during flight
                if *expiry > Instant::now() + Duration::from_secs(60) {
                    return Ok(token.clone());
                }
            }
        }

        // Fetch a new token
        let auth_url = format!("{}/v1/oauth2/token", self.base_url);

        let response = self
            .client
            .post(&auth_url)
            .basic_auth(&self.client_id, Some(&self.secret))
            .header(header::CONTENT_TYPE, "application/x-www-form-urlencoded")
            .body("grant_type=client_credentials")
            .send()
            .await
            .map_err(|e| format!("Failed to request token: {}", e))?;

        if !response.status().is_success() {
            let error_text = response.text().await.unwrap_or_default();
            return Err(format!("PayPal Auth Error: {}", error_text));
        }

        let auth_res: AuthResponse = response
            .json()
            .await
            .map_err(|e| format!("Failed to parse token response: {}", e))?;

        // Calculate exact expiry
        let expiry = Instant::now() + Duration::from_secs(auth_res.expires_in);
        let token = auth_res.access_token;

        // Write to cache
        {
            let mut cache = self.token_cache.write().await;
            *cache = Some((token.clone(), expiry));
        }

        Ok(token)
    }

    /// Creates an order in PayPal, formatting amount to 2 decimals.
    pub async fn create_order(
        &self,
        amount: f64,
        currency: &str,
    ) -> Result<OrderCreateResponse, String> {
        let token = self.get_access_token().await?;
        let create_url = format!("{}/v2/checkout/orders", self.base_url);

        // Strictly format to 2 decimal places
        let formatted_amount = format!("{:.2}", amount);

        let payload = json!({
            "intent": "CAPTURE",
            "purchase_units": [{
                "amount": {
                    "currency_code": currency,
                    "value": formatted_amount
                }
            }]
        });

        let response = self
            .client
            .post(&create_url)
            .bearer_auth(token)
            .header(header::CONTENT_TYPE, "application/json")
            .json(&payload)
            .send()
            .await
            .map_err(|e| format!("Failed to send create order request: {}", e))?;

        if !response.status().is_success() {
            let error_text = response.text().await.unwrap_or_default();
            return Err(format!("PayPal Create Order Error: {}", error_text));
        }

        let order_res: OrderCreateResponse = response
            .json()
            .await
            .map_err(|e| format!("Failed to parse create order response: {}", e))?;

        Ok(order_res)
    }

    /// Captures a previously approved order
    pub async fn capture_order(
        &self,
        paypal_order_id: &str,
    ) -> Result<OrderCaptureResponse, String> {
        let token = self.get_access_token().await?;
        let capture_url = format!(
            "{}/v2/checkout/orders/{}/capture",
            self.base_url, paypal_order_id
        );

        let response = self
            .client
            .post(&capture_url)
            .bearer_auth(token)
            .header(header::CONTENT_TYPE, "application/json")
            .send()
            .await
            .map_err(|e| format!("Failed to send capture request: {}", e))?;

        if !response.status().is_success() {
            let error_text = response.text().await.unwrap_or_default();
            return Err(format!("PayPal Capture Error: {}", error_text));
        }

        let capture_res: OrderCaptureResponse = response
            .json()
            .await
            .map_err(|e| format!("Failed to parse capture response: {}", e))?;

        Ok(capture_res)
    }
}
