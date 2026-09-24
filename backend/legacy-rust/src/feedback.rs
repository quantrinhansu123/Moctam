use actix_web::{HttpResponse, Responder, post, web};
use serde::{Deserialize, Serialize};

use crate::middleware::User;
use crate::supabase_client::{FeedbackInsert, SupabaseClient};

const MAX_TOPIC_LENGTH: usize = 100;
const MAX_CONTENT_LENGTH: usize = 5_000;

#[derive(Debug, Deserialize)]
pub struct CreateFeedbackRequest {
    pub topic: String,
    pub content: String,
}

#[derive(Debug, Serialize)]
pub struct CreateFeedbackResponse {
    pub status: &'static str,
    pub message: &'static str,
    pub data: CreateFeedbackResponseData,
}

#[derive(Debug, Serialize)]
pub struct CreateFeedbackResponseData {
    pub feedback_id: String,
}

#[derive(Debug, Serialize)]
struct ErrorResponse {
    status: &'static str,
    message: String,
}

fn validate_and_normalize(
    request: &CreateFeedbackRequest,
) -> Result<(String, String), &'static str> {
    let topic = request.topic.trim();
    let content = request.content.trim();

    if topic.is_empty() {
        return Err("Topic is required.");
    }
    if topic.chars().count() > MAX_TOPIC_LENGTH {
        return Err("Topic must not exceed 100 characters.");
    }
    if content.is_empty() {
        return Err("Content is required.");
    }
    if content.chars().count() > MAX_CONTENT_LENGTH {
        return Err("Content must not exceed 5000 characters.");
    }

    Ok((topic.to_owned(), content.to_owned()))
}

/// The `user_id` column is a UUID, but JWT `sub` claims may be emails or other
/// identifiers, so only pass the value through when it is a valid UUID.
fn to_uuid_or_none(user_id: Option<String>) -> Option<String> {
    user_id.and_then(|value| {
        let is_uuid = value.len() == 36
            && value.bytes().enumerate().all(|(index, byte)| match index {
                8 | 13 | 18 | 23 => byte == b'-',
                _ => byte.is_ascii_hexdigit(),
            });
        if is_uuid {
            Some(value)
        } else {
            None
        }
    })
}

#[post("/api/feedback")]
pub async fn create_feedback(
    request: web::Json<CreateFeedbackRequest>,
    user: Option<User>,
    supabase: web::Data<SupabaseClient>,
) -> impl Responder {
    let (topic, content) = match validate_and_normalize(&request) {
        Ok(feedback) => feedback,
        Err(message) => {
            return HttpResponse::BadRequest().json(ErrorResponse {
                status: "error",
                message: message.to_owned(),
            });
        }
    };

    let row = FeedbackInsert {
        topic,
        content,
        user_id: to_uuid_or_none(user.map(|user| user.id)),
    };

    match supabase.insert_feedback(&row).await {
        Ok(feedback_id) => HttpResponse::Created().json(CreateFeedbackResponse {
            status: "success",
            message: "Thank you for your feedback!",
            data: CreateFeedbackResponseData { feedback_id },
        }),
        Err(error) => {
            eprintln!("Failed to save feedback: {error}");
            HttpResponse::InternalServerError().json(ErrorResponse {
                status: "error",
                message: "Unable to save feedback right now.".to_owned(),
            })
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn request(topic: String, content: String) -> CreateFeedbackRequest {
        CreateFeedbackRequest { topic, content }
    }

    #[test]
    fn accepts_values_at_character_limits() {
        let request = request("a".repeat(MAX_TOPIC_LENGTH), "b".repeat(MAX_CONTENT_LENGTH));

        assert!(validate_and_normalize(&request).is_ok());
    }

    #[test]
    fn rejects_blank_values() {
        assert_eq!(
            validate_and_normalize(&request("   ".to_owned(), "content".to_owned())),
            Err("Topic is required.")
        );
        assert_eq!(
            validate_and_normalize(&request("topic".to_owned(), "\n\t".to_owned())),
            Err("Content is required.")
        );
    }

    #[test]
    fn rejects_values_over_character_limits() {
        assert_eq!(
            validate_and_normalize(&request(
                "a".repeat(MAX_TOPIC_LENGTH + 1),
                "content".to_owned(),
            )),
            Err("Topic must not exceed 100 characters.")
        );
        assert_eq!(
            validate_and_normalize(&request(
                "topic".to_owned(),
                "b".repeat(MAX_CONTENT_LENGTH + 1),
            )),
            Err("Content must not exceed 5000 characters.")
        );
    }

    #[test]
    fn counts_unicode_characters_instead_of_bytes() {
        let request = request("u".repeat(MAX_TOPIC_LENGTH), "é".repeat(MAX_CONTENT_LENGTH));

        assert!(validate_and_normalize(&request).is_ok());
    }

    #[test]
    fn trims_values_before_saving() {
        let request = request("  Feature Request  ".to_owned(), "  Dark mode  ".to_owned());

        assert_eq!(
            validate_and_normalize(&request),
            Ok(("Feature Request".to_owned(), "Dark mode".to_owned()))
        );
    }

    #[test]
    fn keeps_valid_uuid_user_ids() {
        let uuid = "123e4567-e89b-12d3-a456-426614174000".to_owned();

        assert_eq!(to_uuid_or_none(Some(uuid.clone())), Some(uuid));
    }

    #[test]
    fn drops_non_uuid_user_ids() {
        assert_eq!(to_uuid_or_none(Some("buyer@example.com".to_owned())), None);
        assert_eq!(to_uuid_or_none(Some("not-a-uuid".to_owned())), None);
        assert_eq!(to_uuid_or_none(None), None);
    }
}
