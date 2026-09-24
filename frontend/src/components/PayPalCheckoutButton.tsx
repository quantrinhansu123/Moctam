import { PayPalButtons } from "@paypal/react-paypal-js";
import { apiPost, wakeApi } from "../lib/api";

/** Temporary: skip PayPal Live (account restricted) and only persist order data. */
export const SKIP_PAYPAL_CHECKOUT = true;

export interface CheckoutCustomer {
  email: string;
  name: string;
  phone: string;
  address: string;
}

interface PayPalCheckoutButtonProps extends CheckoutCustomer {
  /** Cart total in the given currency. */
  amount: number;
  currency?: string;
  /** When set, Order was already created (and stored in Supabase) — reuse it. */
  paypalOrderId?: string;
  onSuccess?: () => void;
  onError?: (err: unknown) => void;
}

/** Fallback when `orders` insert fails — feedbacks already works in production. */
async function saveOrderViaFeedback(
  customer: CheckoutCustomer,
  amount: number,
  currency: string,
): Promise<string> {
  const content = [
    "ORDER LEAD (auto-saved because /orders insert failed)",
    `Name: ${customer.name}`,
    `Email: ${customer.email}`,
    `Phone: ${customer.phone}`,
    `Address: ${customer.address}`,
    `Amount: ${amount.toFixed(2)} ${currency}`,
  ].join("\n");

  const result = await apiPost<{
    data?: { feedback_id?: string };
    feedback_id?: string;
  }>("/api/feedback", {
    topic: `Order · ${amount.toFixed(2)} ${currency}`,
    content,
  });

  const feedbackId =
    result.data?.feedback_id ?? result.feedback_id ?? `feedback-${Date.now()}`;
  return `feedback-${feedbackId}`;
}

/** Save contact + amount to Supabase without calling PayPal. */
export async function saveManualOrder(
  customer: CheckoutCustomer,
  amount: number,
  currency = "USD",
): Promise<string> {
  await wakeApi();

  try {
    const orderData = await apiPost<{ order_id?: string; status?: string }>(
      "/api/orders/manual",
      {
        email: customer.email,
        name: customer.name,
        phone: customer.phone,
        address: customer.address,
        amount,
        currency,
      },
    );

    if (orderData?.order_id) {
      return orderData.order_id;
    }
    throw new Error(
      orderData ? JSON.stringify(orderData) : "Missing order_id",
    );
  } catch (error) {
    console.warn(
      "orders insert failed — falling back to feedbacks table",
      error,
    );
    return saveOrderViaFeedback(customer, amount, currency);
  }
}

export async function createCheckoutOrder(
  customer: CheckoutCustomer,
  amount: number,
  currency = "USD",
): Promise<string> {
  if (SKIP_PAYPAL_CHECKOUT) {
    return saveManualOrder(customer, amount, currency);
  }

  await wakeApi();

  const orderData = await apiPost<{ paypal_order_id?: string }>(
    "/api/orders/paypal/create",
    {
      email: customer.email,
      name: customer.name,
      phone: customer.phone,
      address: customer.address,
      amount,
      currency,
    },
  );

  if (orderData?.paypal_order_id) {
    return orderData.paypal_order_id;
  }
  throw new Error(
    orderData ? JSON.stringify(orderData) : "Missing paypal_order_id",
  );
}

export function PayPalCheckoutButton({
  email,
  name,
  phone,
  address,
  amount,
  currency = "USD",
  paypalOrderId,
  onSuccess,
  onError,
}: PayPalCheckoutButtonProps) {
  return (
    <PayPalButtons
      fundingSource="paypal"
      style={{ layout: "vertical", label: "paypal" }}
      createOrder={async () => {
        try {
          if (paypalOrderId) {
            return paypalOrderId;
          }
          return await createCheckoutOrder(
            { email, name, phone, address },
            amount,
            currency,
          );
        } catch (error) {
          console.error("Error creating PayPal order:", error);
          onError?.(error);
          throw error;
        }
      }}
      onApprove={async (data) => {
        try {
          await apiPost("/api/orders/paypal/capture", {
            paypal_order_id: data.orderID,
          });

          console.log("Payment captured and confirmed by the server.");
          onSuccess?.();
        } catch (error) {
          console.error("Error capturing PayPal order:", error);
          onError?.(error);
          throw error;
        }
      }}
    />
  );
}
