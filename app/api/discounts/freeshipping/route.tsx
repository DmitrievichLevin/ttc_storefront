// We enhanced your query slightly to include DiscountCodeFreeShipping,

import { shopifyFetch } from '@/app/lib/shopify';

// as Shopify handles Free Shipping under a different fragment than Basic discounts.
const GET_DISCOUNTS_QUERY = `
  query getActiveDiscounts {
    codeDiscountNodes(first: 10, query: "status:ACTIVE") {
      edges {
        node {
          id
          codeDiscount {
            ... on DiscountCodeBasic {
              title
              summary
              codes(first: 1) {
                nodes {
                  code
                }
              }
            }
            ... on DiscountCodeFreeShipping {
              title
              summary
              codes(first: 1) {
                nodes {
                  code
                }
              }
            }
          }
        }
      }
    }
  }
`;

export async function GET(req: Request) {
  try {
    const response = await shopifyFetch<any>({
      query: GET_DISCOUNTS_QUERY,
    });

    const nodes = response.data?.codeDiscountNodes?.edges || [];

    // Filter through the active discounts to find your specific Free Shipping code.
    // Adjust the .includes() string to match whatever you named the discount in Shopify admin.
    const freeShippingNode = nodes.find(({ node }: any) => {
      const title = node.codeDiscount?.title?.toLowerCase() || '';
      return title.includes('free shipping') || title.includes('freedelivery');
    });

    if (!freeShippingNode) {
      return Response.json(
        {
          success: false,
          error: 'Free shipping discount not currently active.',
        },
        { status: 404 },
      );
    }

    const discountData = freeShippingNode.node.codeDiscount;
    const actualCode = discountData.codes.nodes[0]?.code;

    return Response.json(
      {
        success: true,
        discount: {
          code: actualCode,
          title: discountData.title,
          summary: discountData.summary,
        },
      },
      { status: 200 },
    );
  } catch (error: any) {
    console.error('[DISCOUNT_API_ERROR]:', error.message);
    return Response.json(
      { success: false, error: 'Failed to retrieve discount code.' },
      { status: 500 },
    );
  }
}
