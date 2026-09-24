// =============================================================
// PURPOSE: MIDDLEWARE
// =============================================================
// IMPORTS & MODULE LOADING
// =============================================================
use actix_web::{dev::Payload, error::ErrorUnauthorized, error::ErrorForbidden, FromRequest, HttpRequest, Error as ActixError};
use futures::future::{ready, Ready};
use jsonwebtoken::{decode, DecodingKey, Validation, Algorithm};
use serde::{Deserialize, Serialize};
use std::env;

#[derive(Debug, Serialize, Deserialize)]
pub struct Claims {
    pub sub: String, // buyer_id or buyer_email
    pub role: String,
    pub exp: usize,
}

// =============================================================
// CORE LOGIC & FUNCTIONS
// =============================================================
pub struct User {
    pub id: String,
    pub role: String,
}

impl FromRequest for User {
    type Error = ActixError;
    type Future = Ready<Result<Self, Self::Error>>;

    fn from_request(req: &HttpRequest, _payload: &mut Payload) -> Self::Future {
        let auth_header = match req.headers().get("Authorization") {
            Some(header) => header,
            None => return ready(Err(ErrorUnauthorized("No Authorization header"))),
        };

        let auth_str = match auth_header.to_str() {
            Ok(s) => s,
            Err(_) => return ready(Err(ErrorUnauthorized("Invalid Authorization header"))),
        };

        if !auth_str.starts_with("Bearer ") {
            return ready(Err(ErrorUnauthorized("Invalid Authorization format")));
        }

        let token = &auth_str[7..];
        
        // In a real app, it's better to pass Settings via actix web Data, 
        // but getting from env is a simple workaround for the extractor.
        let jwt_secret = env::var("JWT_SECRET").unwrap_or_else(|_| "secret".to_string());

        let validation = Validation::new(Algorithm::HS256);
        match decode::<Claims>(token, &DecodingKey::from_secret(jwt_secret.as_bytes()), &validation) {
            Ok(token_data) => {
                ready(Ok(User {
                    id: token_data.claims.sub,
                    role: token_data.claims.role,
                }))
            },
            Err(_) => ready(Err(ErrorUnauthorized("Invalid Token"))),
        }
    }
}

// Extractor specifically for Admin role
pub struct Admin {
    pub id: String,
}

impl FromRequest for Admin {
    type Error = ActixError;
    type Future = Ready<Result<Self, Self::Error>>;

    fn from_request(req: &HttpRequest, payload: &mut Payload) -> Self::Future {
        let user_result = User::from_request(req, payload).into_inner();
        
        match user_result {
            Ok(user) => {
                if user.role == "Admin" {
                    ready(Ok(Admin { id: user.id }))
                } else {
                    ready(Err(ErrorForbidden("Require Admin role")))
                }
            },
            Err(e) => ready(Err(e)),
        }
    }
}
