import { shopifyFetch } from '@/app/lib/shopify';
import { NextResponse } from 'next/server';

/**
 * Represents a standard Shopify MoneyV2 object.
 */
export interface MoneyV2 {
  /** The decimal money amount (e.g., "50.0") */
  amount: string;
  /** The 3-letter currency code (e.g., "USD") */
  currencyCode: string;
}

/**
 * The conditions required for the discount to apply.
 * Shopify returns this as a union, so fields are optional depending on the setup.
 */
export interface DiscountMinimumRequirement {
  /** Present if the discount requires a minimum cart subtotal */
  greaterThanOrEqualToSubtotal?: MoneyV2;
  /** Present if the discount requires a minimum quantity of items (as a stringified number) */
  greaterThanOrEqualToQuantity?: string;
}

/**
 * The core data for an Automatic Free Shipping discount.
 */
export interface DiscountAutomaticFreeShipping {
  /** The internal title of the discount (e.g., "Free Shipping over $50") */
  title: string;
  /** The current status of the discount */
  status: 'ACTIVE' | 'EXPIRED' | 'SCHEDULED';
  /** ISO 8601 date string for when the discount started */
  startsAt: string;
  /** ISO 8601 date string for when the discount ends, or null if it runs indefinitely */
  endsAt: string | null;
  /** The threshold required to trigger the discount */
  minimumRequirement: DiscountMinimumRequirement;
}

/**
 * The top-level response structure from the Shopify GraphQL API
 * when querying `automaticDiscountNodes`.
 */
export interface ShopifyFreeShippingResponse {
  data?: {
    automaticDiscountNodes: {
      edges: Array<{
        node: {
          /** The global ID of the discount node */
          id: string;
          /** The specific free shipping discount details */
          automaticDiscount: DiscountAutomaticFreeShipping;
        };
      }>;
    };
  };
  extensions?: {
    cost: {
      requestedQueryCost: number;
      actualQueryCost: number;
      throttleStatus: {
        maximumAvailable: number;
        currentlyAvailable: number;
        restoreRate: number;
      };
    };
  };
}

/**
 * The successful response structure sent to the frontend.
 */
export interface FrontendDiscountSuccessResponse {
  success: true;
  discount: {
    /** The title of the discount (e.g., "Free Shipping over $50") */
    title: string;
    /** The threshold required to trigger the discount */
    minimumRequirement: DiscountMinimumRequirement;
  };
}

/**
 * The error response structure sent to the frontend.
 */
export interface FrontendDiscountErrorResponse {
  success: false;
  /** A user-friendly or debugging error message */
  error: string;
}

/**
 * A union type representing the possible responses to the frontend.
 * Frontend code should check the `success` boolean to narrow the type.
 */
export type FrontendDiscountResponse =
  | FrontendDiscountSuccessResponse
  | FrontendDiscountErrorResponse;

const GET_DISCOUNTS_QUERY = `
  query GetFreeShippingDiscounts {
    automaticDiscountNodes(first: 10, query: "type:free_shipping") {
      edges {
        node {
          id
          automaticDiscount {
            ... on DiscountAutomaticFreeShipping {
              title
              status
              startsAt
              endsAt
              minimumRequirement {
                ... on DiscountMinimumSubtotal {
                  greaterThanOrEqualToSubtotal {
                    amount
                    currencyCode
                  }
                }
                ... on DiscountMinimumQuantity {
                  greaterThanOrEqualToQuantity
                }
              }
            }
          }
        }
      }
    }
  }
`;

export async function GET(
  req: Request,
): Promise<NextResponse<FrontendDiscountResponse>> {
  try {
    // 1. Apply the Shopify type to the fetch request
    const response = await shopifyFetch<ShopifyFreeShippingResponse>({
      query: GET_DISCOUNTS_QUERY,
    });

    const nodes = response.data?.automaticDiscountNodes?.edges || [];

    const freeShippingNode = nodes.find(({ node }) => {
      const discount = node.automaticDiscount;
      if (!discount) return false;

      const isActive = discount.status === 'ACTIVE';
      const title = discount.title?.toLowerCase() || '';
      return (
        isActive &&
        (title.includes('free shipping') || title.includes('freedelivery'))
      );
    });

    if (!freeShippingNode) {
      // 2. Typescript will ensure this matches FrontendDiscountErrorResponse
      return NextResponse.json(
        {
          success: false,
          error: 'Active free shipping discount not currently found.',
        },
        { status: 404 },
      );
    }

    const discountData = freeShippingNode.node.automaticDiscount;

    // 3. Typescript will ensure this matches FrontendDiscountSuccessResponse
    return NextResponse.json(
      {
        success: true,
        discount: {
          title: discountData.title,
          minimumRequirement: discountData.minimumRequirement,
        },
      },
      { status: 200 },
    );
  } catch (error: any) {
    console.error('[DISCOUNT_API_ERROR]:', error.message);
    return NextResponse.json(
      { success: false, error: 'Failed to retrieve discount information.' },
      { status: 500 },
    );
  }
}
