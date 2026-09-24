// =============================================================
// IMPORTS & MODULE LOADING
// =============================================================
use actix_cors::Cors;
use actix_web::{App, HttpResponse, HttpServer, Responder, get, web};
use backend::admin::{admin_login, list_admin_orders};
use backend::config::{Settings, is_placeholder};
use backend::feedback::create_feedback;
use backend::paypal_client::PayPalClient;
use backend::services::email::EmailConfig;
use backend::services::{
    capture_paypal_order, create_manual_order, create_paypal_order, paypal_webhook,
};
use backend::supabase_client::SupabaseClient;

// =============================================================
// CORE LOGIC & FUNCTIONS
// =============================================================
#[get("/")]
async fn check_root() -> impl Responder {
    HttpResponse::Ok().body("Ok!")
}

#[actix_web::main]
async fn main() -> Result<(), std::io::Error> {
    // 1. Initialize Settings from environment
    let settings = Settings::init();
    let port = settings.port;
    let host = settings.host.clone();

    // 2. Instantiate the PayPal Client
    let paypal_client = PayPalClient::new(&settings);
    let paypal_client_data = web::Data::new(paypal_client);

    // 3. Instantiate the Supabase client (used by the feedback endpoint)
    let supabase_client = SupabaseClient::new(&settings);
    let supabase_client_data = web::Data::new(supabase_client);

    // 4. Email sender: real SMTP as soon as SMTP_PASSWORD/SENDER_EMAIL hold
    //    real values, otherwise a [MOCK EMAIL] stdout fallback.
    let email_config = EmailConfig::from_settings(&settings);
    if email_config.is_enabled() {
        println!("Email: Resend API enabled");
    } else {
        println!(
            "[MOCK EMAIL] Resend API not configured \
             (RESEND_API_KEY / SENDER_EMAIL placeholder) — \
             thank-you emails will be logged to stdout"
        );
    }
    let email_config_data = web::Data::new(email_config);

    // 5. Settings as app data (webhook verification reads PAYPAL_WEBHOOK_ID).
    let settings_data = web::Data::new(settings.clone());

    if is_placeholder(&settings.admin_username) || is_placeholder(&settings.admin_password) {
        println!(
            "[ADMIN] ADMIN_USERNAME / ADMIN_PASSWORD not set — /api/admin/login disabled"
        );
    } else {
        println!("[ADMIN] admin login enabled for user '{}'", settings.admin_username);
    }

    println!("Starting Actix-web server on {}:{}", host, port);

    // 6. Configure HTTP Server
    HttpServer::new(move || {
        let cors = Cors::permissive();
        App::new()
            .wrap(cors)
            // Inject PayPal client into application state
            .app_data(paypal_client_data.clone())
            .app_data(supabase_client_data.clone())
            .app_data(email_config_data.clone())
            .app_data(settings_data.clone())
            // Register routes
            .service(check_root)
            .service(admin_login)
            .service(list_admin_orders)
            .service(create_manual_order)
            .service(create_paypal_order)
            .service(capture_paypal_order)
            .service(paypal_webhook)
            .service(create_feedback)
    })
    .bind((host, port))?
    .run()
    .await
}
