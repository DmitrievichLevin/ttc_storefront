import { z } from 'zod';
// Saving for later
// export interface OrderOptions {
//     fulfillment_type: 'pickup' | 'delivery' | 'catering',
//     scheduled_at?: ISO8601,          // Critical for bakery freshness/planning
//     delivery_address?: IAddress,
//     pickup_location?: IAddress,
//     is_gift: boolean,             // Enhances UX for gifting
//     gift_message: string,
//     order_note: string,
// }

/**
 * 1. Raw Payload Validation
 * These schemas strictly validate the incoming Shopify GraphQL data to ensure 
 * your frontend doesn't crash from unexpected nulls or malformed strings.
 */
const ShopifyMoneySchema = z.object({
    amount: z.string().trim().regex(/^\d+(\.\d{1,2})?$/, "Invalid price format"),
    currencyCode: z.string().trim().length(3, "Must be a 3-letter currency code")
});

const ShopifyLineItemSchema = z.object({
    id: z.string().trim().min(1, "Item ID is required"),
    title: z.string().trim().min(1, "Item title is required"),
    quantity: z.number().int().positive("Quantity must be greater than 0"),
    variant: z.object({
        id: z.string().trim().min(1),
        sku: z.string().trim().nullable()
    }).optional()
});

/**
 * 2. The Main Pipeline & Transformer
 * This validates the root object and immediately flattens it into exactly 
 * what the UI needs to render the receipt.
 */
export const OrderSchema = z.object({
    id: z.string().trim().min(1),
    name: z.string().trim().min(1),
    createdAt: z.string().datetime("Must be a valid ISO8601 date string"),
    totalPriceSet: z.object({
        presentmentMoney: ShopifyMoneySchema
    }),
    lineItems: z.object({
        edges: z.array(
            z.object({ node: ShopifyLineItemSchema })
        )
    })
}).transform((order) => {
    // Return a sanitized, flattened object tailored for the customer UI
    return {
        // We keep the raw ID for API calls, but use 'name' (e.g., #1001) for the UI
        id: order.id,
        orderNumber: order.name,

        // Convert ISO string directly to a usable Date object for the UI
        purchaseDate: new Date(order.createdAt),

        // Flatten the pricing and cast the amount to an actual number
        totalAmount: parseFloat(order.totalPriceSet.presentmentMoney.amount),
        currency: order.totalPriceSet.presentmentMoney.currencyCode,

        // Strip away the GraphQL 'edges' and 'nodes' boilerplate
        items: order.lineItems.edges.map(({ node }) => ({
            id: node.id,
            title: node.title,
            quantity: node.quantity,
            sku: node.variant?.sku || null // Safely surface the SKU or null
        }))
    };
});

/**
 * 3. The Clean Frontend Interface
 * TypeScript will automatically infer the *output* of the transform function,
 * giving your UI components a perfectly typed prop interface.
 */
export type IOrder = z.infer<typeof OrderSchema>;

/*
  Inferred type resolves to:
  {
      id: string;
      orderNumber: string;
      purchaseDate: Date;
      totalAmount: number;
      currency: string;
      items: {
          id: string;
          title: string;
          quantity: number;
          sku: string | null;
      }[];
  }
*/



