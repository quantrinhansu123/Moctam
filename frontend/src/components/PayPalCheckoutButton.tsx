import { PayPalButtons } from "@paypal/react-paypal-js";
import { apiPost, wakeApi } from "../lib/api";

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

export async function createCheckoutOrder(
  customer: CheckoutCustomer,
  amount: number,
  currency = "USD",
): Promise<string> {
  // Free-tier Render can sleep — wake it first so Order doesn't feel stuck.
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
