import "@shopify/ui-extensions/preact";
import { render } from "preact";
import { useEffect, useState } from "preact/hooks";
import { APP_BASE_URL, ORDER_CANCEL_BROADCAST_CHANNEL } from "./appBaseUrl.js";

export default async () => {
  render(<MenuActionExtension />, document.body);
};

function MenuActionExtension() {
  const [loading, setLoading] = useState(true);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadOrderStatus() {
      try {
        // Some targets expose `order`; typings may not include it on this target.
        const ext = /** @type {{ order?: { cancelledAt?: string } }} */ (shopify);
        if (ext.order?.cancelledAt) {
          if (!cancelled) setVisible(false);
          return;
        }

        const token = await shopify.sessionToken.get();
        const orderId = shopify.orderId;

        const response = await fetch(
          `${APP_BASE_URL}/api/order-status?orderId=${encodeURIComponent(orderId)}`,
          {
            method: "GET",
            headers: {
              Authorization: `Bearer ${token}`,
            },
          },
        );

        const result = await response.json().catch(() => null);

        if (!response.ok) {
          throw new Error(result?.error || "Failed to load order status");
        }

        // 200 + ok:false (e.g. GraphQL permission): cannot determine → show button per spec.
        if (result && result.ok === false) {
          if (!cancelled) setVisible(true);
          return;
        }

        const isCancelled = Boolean(result?.order?.cancelledAt);

        if (!cancelled) {
          setVisible(!isCancelled);
        }
      } catch {
        // protected customer data / network: show button; cancel route is idempotent.
        if (!cancelled) {
          setVisible(true);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadOrderStatus();
    return () => {
      cancelled = true;
    };
  }, []);

  // After successful cancel in the modal target, hide this menu item when BroadcastChannel works.
  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return undefined;
    const ch = new BroadcastChannel(ORDER_CANCEL_BROADCAST_CHANNEL);
    ch.onmessage = (ev) => {
      if (ev?.data?.type === "order-cancelled") {
        setVisible(false);
      }
    };
    return () => ch.close();
  }, []);

  const onClick = () => {
    // modal target の id と合わせる（modal は action target 側の API）
    try {
      // @ts-expect-error modal is available when paired with customer-account.order.action.render
      shopify.modal?.show?.("order-cancel-confirm");
    } catch {
      shopify.toast.show("Unable to open confirmation");
    }
  };

  if (loading) return null;
  if (!visible) return null;

  return (
    <s-button tone="critical" onClick={onClick}>
      Cancel order
    </s-button>
  );
}