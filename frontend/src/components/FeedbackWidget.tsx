import { useEffect, useRef, useState, type FormEvent } from "react";
import { apiPost } from "../lib/api";
import { icon } from "../lib/icons";

const MAX_TOPIC_LENGTH = 100;
const MAX_CONTENT_LENGTH = 5_000;

interface FeedbackApiResponse {
  status: "success";
  message: string;
  data: {
    feedback_id: string;
  };
}

interface FeedbackErrorResponse {
  status?: "error";
  message?: string;
}

interface FeedbackWidgetProps {
  cartCount?: number;
  onOpenCart?: () => void;
}

export function FeedbackWidget({
  cartCount = 0,
  onOpenCart,
}: FeedbackWidgetProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="float-dock" aria-label="Quick actions">
      {onOpenCart && (
        <button
          className="float-cart"
          type="button"
          onClick={onOpenCart}
          aria-label={`Cart ${cartCount} items`}
        >
          <span
            className="float-cart-icon"
            aria-hidden="true"
            dangerouslySetInnerHTML={{ __html: icon("cart") }}
          />
          <span className="float-cart-count">{cartCount}</span>
        </button>
      )}
      <button
        className="feedback-trigger"
        type="button"
        onClick={() => setIsOpen(true)}
        aria-haspopup="dialog"
      >
        <span
          className="chat-icon"
          aria-hidden="true"
          dangerouslySetInnerHTML={{ __html: icon("chat") }}
        />
        Feedback
      </button>
      {isOpen && <FeedbackModal onClose={() => setIsOpen(false)} />}
    </div>
  );
}

function FeedbackModal({ onClose }: { onClose: () => void }) {
  const [topic, setTopic] = useState("");
  const [content, setContent] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const topicInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    topicInput.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  const submitFeedback = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage("");
    setIsSubmitting(true);

    try {
      const result = await apiPost<FeedbackApiResponse | FeedbackErrorResponse>(
        "/api/feedback",
        { topic, content },
      );

      if (result.status !== "success") {
        throw new Error(result.message ?? "Couldn't send your feedback right now.");
      }

      setSuccessMessage(result.message);
      setTopic("");
      setContent("");
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Couldn't send your feedback right now.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="feedback-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="feedback-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="feedback-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="feedback-modal-head">
          <div>
            <p>Share your thoughts with Mộc Tâm</p>
            <h2 id="feedback-title">Feedback</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close feedback form">
            ×
          </button>
        </div>

        {successMessage ? (
          <div className="feedback-success" role="status">
            <span aria-hidden="true">✓</span>
            <h3>{successMessage}</h3>
            <p>Your feedback helps Mộc Tâm serve you better every day.</p>
            <button type="button" onClick={onClose}>
              Close
            </button>
          </div>
        ) : (
          <form onSubmit={submitFeedback}>
            <label htmlFor="feedback-topic">Topic</label>
            <p className="field-note">A short topic helps us route your feedback.</p>
            <input
              ref={topicInput}
              id="feedback-topic"
              value={topic}
              onChange={(event) => setTopic(event.target.value)}
              maxLength={MAX_TOPIC_LENGTH}
              placeholder="e.g. Shopping experience"
              required
            />

            <div className="feedback-content-label">
              <label htmlFor="feedback-content">Content</label>
              <span aria-live="polite">
                {content.length} / {MAX_CONTENT_LENGTH}
              </span>
            </div>
            <textarea
              id="feedback-content"
              value={content}
              onChange={(event) => setContent(event.target.value)}
              maxLength={MAX_CONTENT_LENGTH}
              rows={7}
              placeholder="Tell us what you liked or what you'd like Mộc Tâm to improve..."
              required
            />

            {errorMessage && (
              <p className="feedback-error" role="alert">
                {errorMessage}
              </p>
            )}

            <div className="feedback-actions">
              <button type="button" onClick={onClose}>
                Cancel
              </button>
              <button type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Sending..." : "Send feedback"}
              </button>
            </div>
          </form>
        )}
      </section>
    </div>
  );
}
