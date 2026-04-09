import type { LoaderFunctionArgs } from "react-router";
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
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": reqHeaders,
      "Access-Control-Max-Age": "86400",
      Vary: "Origin, Access-Control-Request-Headers",
    },
  });
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  if (request.method === "OPTIONS") {
    return buildPreflightResponse(request);
  }

  const { cors, sessionToken } =
    await authenticate.public.customerAccount(request);

  try {
    const url = new URL(request.url);
    const orderId = url.searchParams.get("orderId");

    if (!orderId) {
      return cors(
        Response.json({ ok: false, error: "Missing orderId" }, { status: 400 }),
      );
    }

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
      query OrderStatus($id: ID!) {
        order(id: $id) {
          id
          cancelledAt
          displayFulfillmentStatus
          displayFinancialStatus
        }
      }
      `,
      {
        variables: { id: orderId },
      },
    );

    type OrderStatusJson = {
      errors?: Array<{ message?: string }>;
      data?: {
        order?: {
          id?: string;
          cancelledAt?: string | null;
          displayFulfillmentStatus?: string | null;
          displayFinancialStatus?: string | null;
        } | null;
      };
    };

    const result = (await response.json()) as OrderStatusJson;

    // HTTP 200 with GraphQL errors: return 200 + ok:false so the extension can show the button.
    const gqlErrors = Array.isArray(result.errors) ? result.errors : [];
    if (gqlErrors.length > 0) {
      const msg = gqlErrors
        .map((e: { message?: string }) => e.message)
        .filter(Boolean)
        .join("; ");
      return cors(
        Response.json({
          ok: false,
          error: msg || "GraphQL error",
        }),
      );
    }

    const order = result?.data?.order;

    return cors(
      Response.json({
        ok: true,
        order: {
          id: order?.id ?? null,
          cancelledAt: order?.cancelledAt ?? null,
          displayFulfillmentStatus: order?.displayFulfillmentStatus ?? null,
          displayFinancialStatus: order?.displayFinancialStatus ?? null,
        },
      }),
    );
  } catch (error) {
    console.error("order-status loader error:", error);

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