// =============================================================
// PURPOSE: SETTINGS
// =============================================================
// IMPORTS & MODULE LOADING
// =============================================================
use dotenvy::dotenv;
use std::env;

#[derive(Debug, Clone)]
pub struct Settings {
    pub paypal_client_id: String,
    pub paypal_secret: String,
    pub paypal_mode: String,
    pub host: String,
    pub port: u16,
    pub supabase_url: String,
    pub supabase_key: String,
    // --- Post-purchase email (SMTP / Resend) ---
    pub smtp_server: String,
    pub smtp_port: u16,
    pub smtp_username: String,
    /// May be empty or a placeholder — the email module degrades to a mock.
    pub smtp_password: String,
    pub sender_email: String,
    pub resend_api_key: String,
    // --- PayPal webhooks ---
    /// May be empty or a placeholder — webhook verification degrades to a mock.
    pub paypal_webhook_id: String,
    // --- Admin panel ---
    pub admin_username: String,
    pub admin_password: String,
    pub jwt_secret: String,
}

/// True when an env value is missing or still an untouched placeholder such as
/// `your_api_key_here` / `noreply@yourdomain.com`.
pub fn is_placeholder(value: &str) -> bool {
    let normalized = value.trim().to_lowercase();
    normalized.is_empty()
        || normalized.starts_with("your_")
        || normalized.contains("yourdomain.com")
        || normalized.contains("placeholder")
        || normalized == "changeme"
}

// =============================================================
// CORE LOGIC & FUNCTIONS
// =============================================================

impl Settings {
    pub fn init() -> Self {
        // Load the .env file if present
        dotenv().ok();

        Self {
            paypal_client_id: env::var("PAYPAL_CLIENT_ID").expect("PAYPAL_CLIENT_ID must be set"),
            paypal_secret: env::var("PAYPAL_CLIENT_SECRET")
                .expect("PAYPAL_CLIENT_SECRET must be set"),
            paypal_mode: env::var("PAYPAL_MODE").expect("PAYPAL_MODE must be set"),
            host: env::var("HOST").expect("HOST must be set"),
            port: env::var("PORT")
                .expect("PORT must be set")
                .parse()
                .expect("PORT must be a valid number"),
            supabase_url: env::var("SUPABASE_URL").expect("SUPABASE_URL must be set"),
            supabase_key: env::var("SUPABASE_SERVICE_KEY")
                .or_else(|_| env::var("SUPABASE_ANON_KEY"))
                .expect("SUPABASE_SERVICE_KEY or SUPABASE_ANON_KEY must be set"),
            // Email + webhook settings degrade gracefully: never panic, the
            // services log a [MOCK ...] fallback until real values arrive.
            smtp_server: env::var("SMTP_SERVER").unwrap_or_else(|_| "smtp.resend.com".to_owned()),
            smtp_port: env::var("SMTP_PORT")
                .ok()
                .and_then(|value| value.trim().parse().ok())
                .unwrap_or(587),
            smtp_username: env::var("SMTP_USERNAME").unwrap_or_else(|_| "resend".to_owned()),
            smtp_password: env::var("SMTP_PASSWORD").unwrap_or_default(),
            sender_email: env::var("SENDER_EMAIL").unwrap_or_default(),
            resend_api_key: env::var("RESEND_API_KEY").unwrap_or_default(),
            paypal_webhook_id: env::var("PAYPAL_WEBHOOK_ID").unwrap_or_default(),
            admin_username: env::var("ADMIN_USERNAME").unwrap_or_default(),
            admin_password: env::var("ADMIN_PASSWORD").unwrap_or_default(),
            jwt_secret: env::var("JWT_SECRET").unwrap_or_else(|_| "secret".to_owned()),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::is_placeholder;

    #[test]
    fn detects_missing_and_placeholder_values() {
        assert!(is_placeholder(""));
        assert!(is_placeholder("   "));
        assert!(is_placeholder("your_api_key_here"));
        assert!(is_placeholder("YOUR_PAYPAL_WEBHOOK_ID_HERE"));
        assert!(is_placeholder("noreply@yourdomain.com"));
        assert!(is_placeholder("placeholder"));
        assert!(is_placeholder("changeme"));
    }

    #[test]
    fn accepts_real_credentials() {
        assert!(!is_placeholder("re_abc123XYZ"));
        assert!(!is_placeholder("orders@moc-tam.com"));
    }
}
