import "@shopify/ui-extensions/preact";
import { render } from "preact";
import { useState } from "preact/hooks";
import { APP_BASE_URL, ORDER_CANCEL_BROADCAST_CHANNEL } from "./appBaseUrl.js";

export default async () => {
  render(<MenuActionModalExtension />, document.body);
};

function MenuActionModalExtension() {
  const [submitting, setSubmitting] = useState(false);

  const onConfirm = async () => {
    if (submitting) return;

    setSubmitting(true);
    try {
      const token = await shopify.sessionToken.get();
      const orderId = shopify.orderId;

      const res = await fetch(`${APP_BASE_URL}/api/order-cancel`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ orderId }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok || !data?.ok) {
        const msg = data?.error || "Failed to cancel order";
        shopify.toast.show(msg);
        return;
      }

      if (data?.alreadyCancelled) {
        shopify.toast.show("Order was already cancelled");
      } else {
        shopify.toast.show("Order cancelled");
      }

      try {
        if (typeof BroadcastChannel !== "undefined") {
          const ch = new BroadcastChannel(ORDER_CANCEL_BROADCAST_CHANNEL);
          ch.postMessage({ type: "order-cancelled" });
          ch.close();
        }
      } catch {
        // no-op if BroadcastChannel is unavailable in this runtime
      }

      shopify.close();
    } catch (e) {
      shopify.toast.show(
        e instanceof Error ? e.message : "Network error cancelling order",
      );
    } finally {
      setSubmitting(false);
    }
  };

  // Root must be s-customer-account-action for customer-account.order.action.render (not s-modal).
  return (
    <s-customer-account-action heading="Cancel order">
      <s-paragraph>
        Are you sure you want to cancel this order?
      </s-paragraph>
      <s-button
        slot="primary-action"
        variant="primary"
        tone="critical"
        loading={submitting}
        disabled={submitting}
        onClick={onConfirm}
      >
        Confirm
      </s-button>
      <s-button
        slot="secondary-actions"
        variant="secondary"
        disabled={submitting}
        onClick={() => shopify.close()}
      >
        Close
      </s-button>
    </s-customer-account-action>
  );
}
