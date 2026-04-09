import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { authenticate, unauthenticated } from "../shopify.server";

function buildPreflightResponse(request: Request) {
  const origin = request.headers.get("Origin") ?? "*";
  const reqHeaders =
    request.headers.get("Access-Control-Request-Headers") ??
    "Content-Type, Authorization";

  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": reqHeaders,
      "Access-Control-Max-Age": "86400",
      Vary: "Origin, Access-Control-Request-Headers",
    },
  });
}

type OrderCancelPayload = {
  orderCancelUserErrors?: Array<{
    field?: string[] | null;
    message?: string | null;
    code?: string | null;
  }>;
};

type NormalizedCancelError = {
  field: string[] | null;
  message: string;
  code: string | null;
};

function normalizeErrors(payload: unknown): NormalizedCancelError[] {
  const p = payload as OrderCancelPayload | null | undefined;
  const a = Array.isArray(p?.orderCancelUserErrors)
    ? p.orderCancelUserErrors
    : [];
  return a
    .map((e) => ({
      field: (e?.field as string[] | null | undefined) ?? null,
      message: String(e?.message ?? ""),
      code: e?.code != null ? String(e.code) : null,
    }))
    .filter((e) => e.message);
}

function looksAlreadyCancelled(errors: NormalizedCancelError[]) {
  return errors.some((e) => {
    const m = String(e.message ?? "").toLowerCase();
    const c = (e.code ?? "").toUpperCase();
    // Avoid false positives: only treat explicit "already cancelled" cases as success.
    return (
      c.includes("ALREADY_CANCELLED") ||
      c.includes("ORDER_ALREADY_CANCELLED") ||
      m.includes("already been cancelled") ||
      m.includes("already been canceled") ||
      m.includes("already cancelled") ||
      m.includes("already canceled")
    );
  });
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  if (request.method === "OPTIONS") return buildPreflightResponse(request);

  const { cors } = await authenticate.public.customerAccount(request);
  return cors(new Response(null, { status: 204 }));
};

export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method === "OPTIONS") return buildPreflightResponse(request);

  const { cors, sessionToken } =
    await authenticate.public.customerAccount(request);

  try {
    if (request.method !== "POST") {
      return cors(
        Response.json(
          { ok: false, error: "Method not allowed" },
          { status: 405 },
        ),
      );
    }

    const body = await request.json().catch(() => null);
    const orderId = body?.orderId;

    if (!orderId || typeof orderId !== "string") {
      return cors(
        Response.json({ ok: false, error: "Missing orderId" }, { status: 400 }),
      );
    }

    // Customer Account extension からは gid 形式が来る前提
    if (!orderId.startsWith("gid://shopify/Order/")) {
      return cors(
        Response.json(
          { ok: false, error: "Invalid orderId format" },
          { status: 400 },
        ),
      );
    }

    const shop = sessionToken.dest;
    const { admin } = await unauthenticated.admin(shop);

    const response = await admin.graphql(
      `#graphql
      mutation CancelOrder($orderId: ID!) {
        orderCancel(
          orderId: $orderId
          reason: CUSTOMER
          restock: true
          refundMethod: { originalPaymentMethodsRefund: true }
          notifyCustomer: true
        ) {
          job { id done }
          orderCancelUserErrors { field message code }
        }
      }`,
      { variables: { orderId } },
    );

    const result = await response.json();
    const payload = result?.data?.orderCancel;
    const errors = normalizeErrors(payload);

    if (errors.length > 0) {
      // idempotent: 既キャンセルっぽい場合は成功扱い寄りにする
      if (looksAlreadyCancelled(errors)) {
        return cors(
          Response.json({
            ok: true,
            alreadyCancelled: true,
            message: "Order is already cancelled",
            job: payload?.job ?? null,
            errors,
          }),
        );
      }

      return cors(
        Response.json(
          { ok: false, error: errors[0].message, errors },
          { status: 400 },
        ),
      );
    }

    return cors(
      Response.json({
        ok: true,
        alreadyCancelled: false,
        job: payload?.job ?? null,
      }),
    );
  } catch (error) {
    return cors(
      Response.json(
        {
          ok: false,
          error: error instanceof Error ? error.message : "Unknown server error",
        },
        { status: 500 },
      ),
    );
  }
};