import { useState, type FormEvent } from "react";
import { money } from "../lib/format";
import { icon, payment } from "../lib/icons";
import type { CartLine } from "../types/product";
import {
  createCheckoutOrder,
  PayPalCheckoutButton,
  SKIP_PAYPAL_CHECKOUT,
} from "./PayPalCheckoutButton";

const CART_PAYMENTS: Array<[string, string]> = [
  ["amex", "American Express"],
  ["apple", "Apple Pay"],
  ["discover", "Discover"],
  ["gpay", "Google Pay"],
  ["mastercard", "Mastercard"],
  ["shop", "Shop Pay"],
  ["visa", "Visa"],
];

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_PATTERN = /^[+]?[\d\s().-]{8,20}$/;

interface CheckoutForm {
  email: string;
  name: string;
  phone: string;
  address: string;
}

const EMPTY_FORM: CheckoutForm = {
  email: "",
  name: "",
  phone: "",
  address: "",
};

interface CartDrawerProps {
  open: boolean;
  lines: CartLine[];
  onClose: () => void;
  onQty: (key: string, delta: number) => void;
  onRemove: (key: string) => void;
  onClear: () => void;
}

export function CartDrawer({ open, lines, onClose, onQty, onRemove, onClear }: CartDrawerProps) {
  const [showPayment, setShowPayment] = useState(false);
  const [form, setForm] = useState<CheckoutForm>(EMPTY_FORM);
  const [touched, setTouched] = useState(false);
  const [orderReady, setOrderReady] = useState(false);
  const [paypalOrderId, setPaypalOrderId] = useState("");
  const [isOrdering, setIsOrdering] = useState(false);
  const [orderError, setOrderError] = useState("");

  const email = form.email.trim();
  const name = form.name.trim();
  const phone = form.phone.trim();
  const address = form.address.trim();

  const errors = {
    email: !EMAIL_PATTERN.test(email) ? "Please enter a valid email." : "",
    name: name.length < 2 ? "Please enter your name." : "",
    phone: !PHONE_PATTERN.test(phone) ? "Please enter a valid phone number." : "",
    address: address.length < 5 ? "Please enter your address." : "",
  };
  const formValid = !errors.email && !errors.name && !errors.phone && !errors.address;

  const subtotal = lines.reduce((sum, line) => sum + line.price * line.qty, 0);
  const savings = lines.reduce((sum, line) => sum + (line.regular - line.price) * line.qty, 0);
  const count = lines.reduce((sum, line) => sum + line.qty, 0);

  const updateField = (field: keyof CheckoutForm, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setOrderReady(false);
    setPaypalOrderId("");
    setOrderError("");
  };

  const handleOrder = async (event: FormEvent) => {
    event.preventDefault();
    setTouched(true);
    setOrderError("");
    if (!formValid) return;

    setIsOrdering(true);
    try {
      const orderId = await createCheckoutOrder(
        { email, name, phone, address },
        Number(subtotal.toFixed(2)),
        "USD",
      );
      setPaypalOrderId(orderId);
      setOrderReady(true);

      // Temporary: PayPal Live is restricted — order data is already in Supabase.
      if (SKIP_PAYPAL_CHECKOUT) {
        alert("Order saved! We received your details.");
        onClear();
        resetCheckout();
        onClose();
      }
    } catch (error) {
      setOrderError(
        error instanceof Error
          ? error.message
          : "Couldn't save your order right now.",
      );
    } finally {
      setIsOrdering(false);
    }
  };

  const resetCheckout = () => {
    setShowPayment(false);
    setOrderReady(false);
    setTouched(false);
    setForm(EMPTY_FORM);
    setPaypalOrderId("");
    setOrderError("");
  };

  return (
    <>
      <div className="cart-backdrop" hidden={!open} onClick={onClose} />
      <aside
        className={`cart-drawer${open ? " is-open" : ""}`}
        role="dialog"
        aria-label="Your cart"
        aria-hidden={!open}
      >
        <div className="cart-head">
          <h2>
            Cart · <span className="cart-item-count">{count} items</span>
          </h2>
          <button
            className="cart-close icon-button"
            type="button"
            aria-label="Close"
            onClick={onClose}
            dangerouslySetInnerHTML={{ __html: icon("close") }}
          />
        </div>
        <div className="cart-reserved">
          Cart reserved for <strong>04:57</strong>
        </div>

        <div className="cart-items" id="cart-items">
          {lines.length === 0 && <p className="cart-empty">Your cart is empty.</p>}
          {lines.map((line) => (
            <div className="cart-item" key={line.key}>
              <img src={line.image} alt="" />
              <div className="cart-item-copy">
                <h3>{line.name}</h3>
                <div className="cart-item-prices">
                  {line.regular > line.price && <del>{money(line.regular)}</del>}
                  <strong>{money(line.price)}</strong>
                  <span className="cart-tag">{line.tag}</span>
                </div>
                <div className="cart-item-actions">
                  <div className="qty">
                    <button
                      type="button"
                      aria-label={`Decrease quantity for ${line.name}`}
                      onClick={() => onQty(line.key, -1)}
                      dangerouslySetInnerHTML={{ __html: icon("minus") }}
                    />
                    <input
                      value={line.qty}
                      aria-label={`Quantity for ${line.name}`}
                      readOnly
                    />
                    <button
                      type="button"
                      aria-label={`Increase quantity for ${line.name}`}
                      onClick={() => onQty(line.key, 1)}
                      dangerouslySetInnerHTML={{ __html: icon("plus") }}
                    />
                  </div>
                  <button
                    className="remove-item"
                    type="button"
                    aria-label={`Remove ${line.name}`}
                    onClick={() => onRemove(line.key)}
                    dangerouslySetInnerHTML={{ __html: icon("trash") }}
                  />
                  {line.regular > line.price && (
                    <span className="cart-save">
                      {money((line.regular - line.price) * line.qty)} saved
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="cart-summary">
          <p>
            <strong>Savings</strong>
            <strong className="cart-savings">{savings ? `-${money(savings)}` : money(0)}</strong>
          </p>
          <p>
            <strong>Subtotal</strong>
            <strong className="cart-subtotal">{money(subtotal)}</strong>
          </p>
          {showPayment && lines.length > 0 ? (
            <div className="cart-checkout">
              <form className="checkout-form" onSubmit={handleOrder} noValidate>
                <label htmlFor="checkout-name">Name</label>
                <input
                  id="checkout-name"
                  type="text"
                  autoComplete="name"
                  placeholder="Your full name"
                  value={form.name}
                  onChange={(event) => updateField("name", event.target.value)}
                  aria-invalid={touched && !!errors.name}
                  required
                />
                {touched && errors.name && (
                  <p className="checkout-email-error">{errors.name}</p>
                )}

                <label htmlFor="checkout-email-input">Email</label>
                <input
                  id="checkout-email-input"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  placeholder="you@example.com"
                  value={form.email}
                  onChange={(event) => updateField("email", event.target.value)}
                  aria-invalid={touched && !!errors.email}
                  required
                />
                {touched && errors.email && (
                  <p className="checkout-email-error">{errors.email}</p>
                )}

                <label htmlFor="checkout-phone">Phone</label>
                <input
                  id="checkout-phone"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  placeholder="+84 ..."
                  value={form.phone}
                  onChange={(event) => updateField("phone", event.target.value)}
                  aria-invalid={touched && !!errors.phone}
                  required
                />
                {touched && errors.phone && (
                  <p className="checkout-email-error">{errors.phone}</p>
                )}

                <label htmlFor="checkout-address">Address</label>
                <textarea
                  id="checkout-address"
                  autoComplete="street-address"
                  placeholder="Street, district, city"
                  rows={3}
                  value={form.address}
                  onChange={(event) => updateField("address", event.target.value)}
                  aria-invalid={touched && !!errors.address}
                  required
                />
                {touched && errors.address && (
                  <p className="checkout-email-error">{errors.address}</p>
                )}

                {!orderReady && (
                  <>
                    <p className="checkout-email-note">
                      Fill in your details, then press Order — your order is saved right away.
                    </p>
                    {orderError && (
                      <p className="checkout-email-error" role="alert">
                        {orderError}
                      </p>
                    )}
                    <button
                      type="submit"
                      className="checkout-order-btn"
                      disabled={isOrdering}
                    >
                      {isOrdering
                        ? "Saving order… (server may take ~30s to wake)"
                        : "Order"}
                    </button>
                  </>
                )}
              </form>

              {orderReady && formValid && paypalOrderId && !SKIP_PAYPAL_CHECKOUT && (
                <>
                  <p className="checkout-email-note">
                    Order saved. Complete payment with PayPal below.
                  </p>
                  <PayPalCheckoutButton
                    email={email}
                    name={name}
                    phone={phone}
                    address={address}
                    paypalOrderId={paypalOrderId}
                    amount={Number(subtotal.toFixed(2))}
                    currency="USD"
                    onSuccess={() => {
                      alert(
                        "Payment successful! A confirmation email is on its way.",
                      );
                      onClear();
                      resetCheckout();
                      onClose();
                    }}
                    onError={() => {
                      alert("Payment failed, please try again later.");
                    }}
                  />
                </>
              )}
            </div>
          ) : (
            <button
              type="button"
              disabled={lines.length === 0}
              onClick={() => setShowPayment(true)}
            >
              Check out
            </button>
          )}
          <div className="cart-payments">
            {CART_PAYMENTS.map(([className, name]) => (
              <span
                key={className}
                className={`payment ${className}`}
                dangerouslySetInnerHTML={{ __html: payment(name) }}
              />
            ))}
          </div>
        </div>
      </aside>
    </>
  );
}
