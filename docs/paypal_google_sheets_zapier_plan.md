# PayPal Payment → Google Sheets → Zapier → Gmail

## Objective

After a customer successfully completes a PayPal payment, the Node.js backend must record the payment information in Google Sheets.

Zapier will monitor the Google Sheet for a new row and automatically send a confirmation email through Gmail.

The target flow is:

```text
Customer
   ↓
PayPal Checkout
   ↓
PayPal Payment / Capture
   ↓
PayPal Webhook
   ↓
Node.js Backend
   ↓
Verify + Deduplicate Payment
   ↓
Google Sheets
   ↓
Zapier: New Spreadsheet Row
   ↓
Gmail: Send Email
   ↓
Customer
```

---

## 1. Technology

Backend:

- Node.js
- TypeScript
- Existing PayPal integration
- Google Sheets API

Automation:

- Zapier
- Gmail

Database / existing infrastructure:

- Keep the existing backend infrastructure unchanged unless required.

---

## 2. Google Sheet Structure

Create a Google Spreadsheet with a worksheet named:

```text
Payments
```

Use the following columns:

| Column | Description |
|---|---|
| `payment_id` | Unique PayPal payment/order/capture ID |
| `email` | Customer email address |
| `name` | Customer name |
| `address` | Customer address |
| `created_at` | Timestamp when the payment record was created |

Example:

| payment_id | email | name | address | created_at |
|---|---|---|---|---|
| PAY-123456 | customer@gmail.com | Nguyen Van A | Hanoi, Vietnam | 2026-09-24T18:30:00Z |

`payment_id` must be unique.

Do not generate a random payment ID if PayPal already provides a suitable unique payment/order/capture ID.

---

## 3. Node.js Payment Flow

The backend should process successful PayPal payments through the existing PayPal flow.

The production flow should be:

```text
PayPal
   ↓
Webhook
   ↓
Node.js
   ↓
Verify PayPal event/payment
   ↓
Check whether payment_id was already processed
   ↓
If already processed:
    return success
   ↓
If not processed:
    append payment to Google Sheets
   ↓
Return successful webhook response
```

The webhook must not blindly trust an incoming request.

The backend must verify that the PayPal event represents a valid successful payment before writing the payment to Google Sheets.

---

## 4. Payment Data Model

Before writing to Google Sheets, normalize the payment data into a structure similar to:

```ts
interface PaymentRecord {
  paymentId: string;
  email: string;
  name: string;
  address: string;
  createdAt: string;
}
```

Then convert it to the Google Sheets row:

```text
payment_id
email
name
address
created_at
```

---

## 5. Google Sheets Service

Create a dedicated Google Sheets integration/service.

Suggested location:

```text
src/integrations/google-sheets/
```

or, if the existing backend architecture uses services:

```text
src/services/googleSheets.ts
```

The service should expose a small API, for example:

```ts
appendPayment(record: PaymentRecord)
```

Responsibilities:

1. Authenticate with Google.
2. Open the configured spreadsheet.
3. Select the `Payments` worksheet.
4. Append one row.
5. Return success/failure.
6. Never expose Google credentials in logs or API responses.

The PayPal webhook handler should not contain raw Google Sheets API code.

Use:

```text
Webhook Controller
        ↓
Payment Service
        ↓
Google Sheets Service
```

---

## 6. Idempotency / Duplicate Protection

This is critical.

PayPal webhooks can be delivered more than once.

The backend must prevent the same payment from creating multiple Google Sheet rows.

Expected behavior:

```text
Webhook received
      ↓
payment_id already processed?
      ├── YES → do nothing → return success
      │
      └── NO
           ↓
       verify payment
           ↓
       append row
```

Example:

First webhook:

```text
PAY-123456
```

creates:

```text
PAY-123456 | customer@gmail.com | Nguyen Van A | Hanoi | ...
```

If PayPal sends the same webhook again:

```text
PAY-123456
```

the backend must NOT append another row.

The implementation should use a reliable source of truth for idempotency.

If the existing database is available, prefer storing the processed payment ID there rather than using Google Sheets as the only idempotency store.

Google Sheets should primarily be an automation/data-export destination, not the authoritative payment database.

---

## 7. Zapier Configuration

Zapier should use Google Sheets as the trigger.

### Trigger

```text
App:
Google Sheets

Event:
New Spreadsheet Row
```

Select:

```text
Spreadsheet:
<your payment spreadsheet>

Worksheet:
Payments
```

When the Node.js backend appends:

```text
PAY-123456 | customer@gmail.com | Nguyen Van A | Hanoi | ...
```

Zapier receives the new row.

---

## 8. Gmail Configuration

Zapier action:

```text
App:
Gmail

Event:
Send Email
```

Configure:

### To

Use:

```text
Google Sheets → email
```

### CC

Leave empty unless an internal recipient is required.

### BCC

Optionally use an internal/admin email address if a copy of every confirmation is required.

### From

Use the connected Gmail account.

### From Name

```text
Mộc Tâm
```

### Subject

```text
Payment Confirmation - Mộc Tâm
```

The email body can use fields from the Google Sheet:

```html
<p>Dear {{name}},</p>

<p>Thank you for your payment.</p>

<p>Your payment has been successfully received.</p>

<p>Payment ID: {{payment_id}}</p>

<p>Best regards,<br>
Mộc Tâm</p>
```

---

## 9. Address Requirement

The backend must not invent or infer the customer's address.

The address must come from an actual PayPal/customer data source.

Before implementation, inspect the current PayPal payment and webhook payloads and determine whether the current checkout flow provides:

- customer email
- customer name
- customer address
- payment/order/capture ID

If the current PayPal flow does not collect an address, the checkout flow must be changed if the address is required.

Do not populate the address with guessed data.

---

## 10. Error Handling

Payment processing and Google Sheets synchronization must be handled carefully.

A Google Sheets failure should not cause an already successful PayPal payment to be treated as a failed payment.

For example:

```text
PayPal payment successful
        ↓
Database payment status = successful
        ↓
Google Sheets write fails
        ↓
Payment remains successful
        ↓
Log synchronization failure
        ↓
Retry/recovery mechanism can process the missing Sheet record
```

Do not return a payment failure to the customer merely because Google Sheets is temporarily unavailable.

---

## 11. Logging

Log enough information to diagnose problems.

Example:

```text
PayPal webhook received
Payment ID: PAY-123456
Payment status: COMPLETED
Google Sheets sync: SUCCESS
```

For errors:

```text
PayPal webhook received
Payment ID: PAY-123456
Google Sheets sync: FAILED
Error: <safe error message>
```

Never log:

- PayPal Client Secret
- Google service-account private key
- access tokens
- passwords
- sensitive customer information unnecessarily

---

## 12. Environment Variables

Use environment variables for Google configuration.

For example:

```env
GOOGLE_SHEETS_SPREADSHEET_ID=
GOOGLE_SHEETS_WORKSHEET=Payments
```

If using a Google service account, keep its credentials server-side and never expose them to the frontend.

Do not commit credentials to Git.

Update `.env.example` with variable names only.

---

## 13. Testing Plan

### Test 1 — Successful Payment

Perform a PayPal Sandbox payment.

Expected:

```text
PayPal payment
    ↓
Webhook
    ↓
Node.js
    ↓
Google Sheet
```

Exactly one new row should appear.

---

### Test 2 — Verify Row Data

The row should contain:

```text
payment_id
email
name
address
created_at
```

All required values must be correct.

---

### Test 3 — Zapier

After the new row appears:

```text
Google Sheet
    ↓
Zapier
    ↓
Gmail
```

The customer should receive the confirmation email.

---

### Test 4 — Duplicate Webhook

Send/process the same PayPal webhook more than once.

Expected:

```text
Google Sheet:
1 row
```

Not:

```text
2 rows
3 rows
...
```

---

### Test 5 — Google Sheets Failure

Temporarily make Google Sheets unavailable or cause an API failure.

Expected:

- PayPal payment remains successful.
- Payment is not marked as failed.
- Error is logged.
- The failed synchronization can be recovered.

---

## 14. Final Production Flow

The completed architecture should be:

```text
                    ┌──────────────┐
                    │    PayPal    │
                    └──────┬───────┘
                           │
                     Payment Webhook
                           │
                           ▼
                  ┌─────────────────┐
                  │    Node.js      │
                  │    Backend      │
                  └────────┬────────┘
                           │
                 Verify + Idempotency
                           │
                           ▼
                  ┌─────────────────┐
                  │    Database     │
                  │ Payment Record  │
                  └────────┬────────┘
                           │
                           ▼
                  ┌─────────────────┐
                  │ Google Sheets   │
                  │    Payments     │
                  └────────┬────────┘
                           │
                    New Row Trigger
                           │
                           ▼
                     ┌──────────┐
                     │  Zapier  │
                     └────┬─────┘
                          │
                          ▼
                     ┌──────────┐
                     │  Gmail   │
                     └────┬─────┘
                          │
                          ▼
                      Customer
```

---

## 15. Implementation Order

Implement in this order:

### Phase 1 — Google Sheet

Create:

```text
Payments
```

with:

```text
payment_id
email
name
address
created_at
```

### Phase 2 — Google Authentication

Configure server-side Google Sheets API authentication.

### Phase 3 — Google Sheets Service

Implement:

```text
appendPayment()
```

### Phase 4 — PayPal Webhook

Connect the existing PayPal webhook to the Node.js payment service.

### Phase 5 — Payment Verification

Verify the PayPal event and determine the successful payment ID and customer information.

### Phase 6 — Idempotency

Prevent duplicate payment records.

### Phase 7 — Google Sheets Synchronization

Write one successful payment to one new Google Sheet row.

### Phase 8 — Zapier

Configure:

```text
Google Sheets
→ New Spreadsheet Row
→ Gmail
→ Send Email
```

### Phase 9 — End-to-End Testing

Test:

```text
PayPal
→ Webhook
→ Node.js
→ Google Sheets
→ Zapier
→ Gmail
```

using PayPal Sandbox before production.

---

## Success Criteria

The implementation is considered complete when:

1. A successful PayPal payment creates exactly one payment record.
2. The payment record contains:
   - payment ID
   - customer email
   - customer name
   - customer address
   - creation timestamp
3. Duplicate PayPal webhook delivery does not create duplicate records.
4. Zapier detects the new Google Sheet row.
5. Gmail sends the confirmation email to the email stored in the row.
6. Google Sheets failures do not incorrectly mark the PayPal payment as failed.
7. No secrets are exposed to the frontend or logs.
8. The complete flow works in PayPal Sandbox.
9. The same architecture can be switched to PayPal Live after production verification.
