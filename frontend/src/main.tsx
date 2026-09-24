import { PayPalScriptProvider } from "@paypal/react-paypal-js";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { ProductProvider } from "./products/ProductProvider";

const paypalClientId = import.meta.env.VITE_PAYPAL_CLIENT_ID;
if (!paypalClientId) {
    // Fail loudly instead of silently falling back to PayPal's "test" client id,
    // which would make checkout appear broken in live mode.
    throw new Error(
        "VITE_PAYPAL_CLIENT_ID is not set — check the env vars in Vercel (or frontend/.env for local dev).",
    );
}

const paypalOptions = {
    clientId: paypalClientId,
    currency: "USD",
    intent: "capture",
    // Hide PayPal's "Debit or Credit Card" funding button — checkout uses our Order form instead.
    disableFunding: "card",
};

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <PayPalScriptProvider options={paypalOptions}>
      <ProductProvider>
        <App />
      </ProductProvider>
    </PayPalScriptProvider>
  </StrictMode>,
);
