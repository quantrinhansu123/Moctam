// =============================================================
// PURPOSE: Admin login + protected order list
// =============================================================
use actix_web::{HttpResponse, Responder, get, post, web};
use jsonwebtoken::{EncodingKey, Header, encode};
use serde::{Deserialize, Serialize};

use crate::config::{Settings, is_placeholder};
use crate::middleware::{Admin, Claims};
use crate::supabase_client::SupabaseClient;

#[derive(Debug, Deserialize)]
pub struct AdminLoginRequest {
    pub username: String,
    pub password: String,
}

#[derive(Debug, Serialize)]
pub struct AdminLoginResponse {
    pub status: &'static str,
    pub token: String,
}

#[derive(Debug, Serialize)]
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

#[post("/api/admin/login")]
pub async fn admin_login(
    req: web::Json<AdminLoginRequest>,
    settings: web::Data<Settings>,
) -> impl Responder {
    if is_placeholder(&settings.admin_username) || is_placeholder(&settings.admin_password) {
        return error_response(
            actix_web::http::StatusCode::SERVICE_UNAVAILABLE,
            "Admin login is not configured. Set ADMIN_USERNAME and ADMIN_PASSWORD.",
        );
    }

    let username = req.username.trim();
    let password = req.password.trim();

    if username != settings.admin_username || password != settings.admin_password {
        return error_response(
            actix_web::http::StatusCode::UNAUTHORIZED,
            "Invalid username or password.",
        );
    }

    let exp = chrono::Utc::now().timestamp() as usize + 60 * 60 * 24;
    let claims = Claims {
        sub: username.to_owned(),
        role: "Admin".to_owned(),
        exp,
    };

    match encode(
        &Header::default(),
        &claims,
        &EncodingKey::from_secret(settings.jwt_secret.as_bytes()),
    ) {
        Ok(token) => HttpResponse::Ok().json(AdminLoginResponse {
            status: "success",
            token,
        }),
        Err(error) => {
            eprintln!("[ADMIN] failed to issue JWT: {error}");
            error_response(
                actix_web::http::StatusCode::INTERNAL_SERVER_ERROR,
                "Unable to create session.",
            )
        }
    }
}

#[get("/api/admin/orders")]
pub async fn list_admin_orders(
    _admin: Admin,
    supabase: web::Data<SupabaseClient>,
) -> impl Responder {
    match supabase.list_orders(100).await {
        Ok(orders) => HttpResponse::Ok().json(orders),
        Err(error) => {
            eprintln!("[ADMIN] list orders failed: {error}");
            error_response(
                actix_web::http::StatusCode::INTERNAL_SERVER_ERROR,
                "Unable to load orders right now.",
            )
        }
    }
}
