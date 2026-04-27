import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';

// Define the expected structure of the Shopify order webhook payload
interface NoteAttribute {
  name: string;
  value: string;
}

interface ShopifyCustomer {
  id: number;
  email?: string;
  phone?: string;
}

interface ShopifyOrder {
  id: number;
  note_attributes: NoteAttribute[];
  customer?: ShopifyCustomer;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const bodyText = await req.text();
  const hmacHeader = req.headers.get('x-shopify-hmac-sha256');

  // Guard clause for the environment variable
  if (!process.env.SHOPIFY_WEBHOOK_SECRET) {
    console.error('SHOPIFY_WEBHOOK_SECRET is not defined');
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 },
    );
  }

  // 1. Verify Webhook Authenticity
  const hash = crypto
    .createHmac('sha256', process.env.SHOPIFY_WEBHOOK_SECRET)
    .update(bodyText, 'utf8')
    .digest('base64');

  if (hash !== hmacHeader) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Parse the body and cast it to our ShopifyOrder interface
  const order = JSON.parse(bodyText) as ShopifyOrder;

  // Safely access note_attributes using optional chaining in case it's undefined
  const uidAttribute = order.note_attributes?.find(
    (attr) => attr.name === 'firebase_uid',
  );

  if (uidAttribute) {
    const firebaseUid: string = uidAttribute.value;
    const checkoutCustomerId: number | undefined = order.customer?.id;

    if (!checkoutCustomerId) {
      // Order was placed entirely as a guest with no customer record created
      return NextResponse.json(
        { success: true, message: 'No customer to merge' },
        { status: 200 },
      );
    }

    const shopifyDomain = process.env.SHOPIFY_STORE_DOMAIN;
    const shopifyToken = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;

    if (!shopifyDomain || !shopifyToken) {
      console.error('Missing Shopify environment variables');
      return NextResponse.json(
        { error: 'Internal Server Error' },
        { status: 500 },
      );
    }

    const graphqlEndpoint = shopifyDomain;

    // 2. Find the REAL customer ID using the firebaseUid Metafield via Admin API
    // Note: To query by metafield, the definition must have "Storefront and admin search" enabled in Shopify Admin.
    const findCustomerQuery = `
      query findCustomer($query: String!) {
        customers(first: 1, query: $query) {
          edges {
            node {
              id
            }
          }
        }
      }
    `;

    const findRes = await fetch(graphqlEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': shopifyToken,
      },
      body: JSON.stringify({
        query: findCustomerQuery,
        variables: {
          query: `metafields.auth.firebase_uid:${firebaseUid}`,
        },
      }),
    });

    const findData = await findRes.json();
    const realCustomerNode = findData?.data?.customers?.edges?.[0]?.node;

    if (realCustomerNode) {
      const realCustomerIdGid: string = realCustomerNode.id;

      // Webhooks return raw integer IDs, but GraphQL requires Global IDs (gid)
      const checkoutCustomerIdGid = `gid://shopify/Customer/${checkoutCustomerId}`;

      // 3. If realCustomerId !== checkoutCustomerId, use the Customer Merge API
      if (realCustomerIdGid !== checkoutCustomerIdGid) {
        const mergeMutation = `
          mutation customerMerge($customerToKeepId: ID!, $customerToMergeId: ID!) {
            customerMerge(customerToKeepId: $customerToKeepId, customerToMergeId: $customerToMergeId) {
              job {
                id
              }
              userErrors {
                field
                message
              }
            }
          }
        `;

        const mergeRes = await fetch(graphqlEndpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Shopify-Access-Token': shopifyToken,
          },
          body: JSON.stringify({
            query: mergeMutation,
            variables: {
              customerToKeepId: realCustomerIdGid, // The authenticated Firebase profile
              customerToMergeId: checkoutCustomerIdGid, // The duplicate guest profile from checkout
            },
          }),
        });

        const mergeData = await mergeRes.json();
        const errors = mergeData?.data?.customerMerge?.userErrors;

        if (errors && errors.length > 0) {
          console.error('Shopify Customer Merge Error:', errors);
          // Note: We still let the function proceed to return 200.
          // If we return 500, Shopify will aggressively retry the webhook for 48 hours.
        } else {
          console.log(
            `Successfully queued merge for ${checkoutCustomerIdGid} into ${realCustomerIdGid}`,
          );
        }
      }
    } else {
      console.warn(`No real customer found for Firebase UID: ${firebaseUid}`);
    }
  }

  return NextResponse.json({ success: true }, { status: 200 });
}
