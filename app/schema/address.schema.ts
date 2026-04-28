import { z } from 'zod';
import { cottageFoodRefinement } from './validation';

// Production schema: Enforces UTC (Z) and provides the branded type
export const ISO8601Schema = z
    .string()
    .datetime({ message: "Invalid ISO 8601 timestamp; expected UTC format (Z)." })
    .transform((val) => val as ISO8601);


/**
 * 1. The Hardened Schema
 * Extracted outside the object to prevent 'this' binding issues 
 * and allow for clean type inference.
 */
export const AddressSchema = z.object({
    // .trim() prevents whitespace-only bypasses
    // .max() prevents malicious massive string payloads
    street: z.string().trim().min(1, "Street is required").max(150),
    secondary_address: z.string().trim().max(150).optional().default(''),

    // Enforce US Zip Code formats (5 digits, or 9 digit Zip+4)
    postcode: z.string().trim().regex(/(^\d{5}$)|(^\d{5}-\d{4}$)/, "Invalid US Zip Code"),

    place: z.string().trim().min(1, "City is required").max(100),
    region: z.string().trim().min(1, "State is required").max(50),

    // Enforce 2-letter uppercase state codes
    region_code: z.string().trim().length(2, "Must be a 2-letter state code").toUpperCase(),

    country: z.literal("United States"),
    country_code: z.literal("US"),
    label: z.string().trim().min(1, "Label is required").max(250),
    value: z.string().trim().min(1, "Mapbox ID is required").max(100),
}).strict() // Optional: Uncomment to strip out/reject any unrecognized fields
    .superRefine(cottageFoodRefinement);

export const AddressesV2 = z.object({ edges: z.array(AddressSchema) });

/**
 * 2. Single Source of Truth for Types
 * Automatically infer the interface from the schema.
 */
export type IAddress = z.infer<typeof AddressSchema>;

/**
 * 3. The Utility Namespace
 */
interface AddressInterface {
    (data: IAddress): Partial<IShopifyAddress>;
    (data: IShopifyAddress): IAddress;
    schema: typeof AddressSchema;
    safeParse: (data: unknown) => ReturnType<typeof AddressSchema.safeParse>;
}

const AddressBase = ((data: unknown): any => {
    // 1. HARDENING: Prevent Null/Undefined/Non-object crashes
    if (!data || typeof data !== 'object') {
        throw new Error("[Address Utility]: Input must be a valid object.");
    }

    // 2. DISCRIMINATION: Check for identifying keys for BOTH types
    const isInternal = 'street' in data;
    const isShopify = 'address1' in data;

    // Logic for Internal -> Shopify
    if (isInternal) {
        const validated = AddressSchema.parse(data);
        return {
            address1: validated.street,
            address2: validated.secondary_address,
            city: validated.place,
            zip: validated.postcode,
            province: validated.region,
            provinceCode: validated.region_code,
            countryCodeV2: validated.country_code,
        };
    }

    // Logic for Shopify -> Internal
    if (isShopify) {
        const s = data as IShopifyAddress;
        return AddressSchema.parse({
            street: s.address1 || '',
            secondary_address: s.address2 || '',
            postcode: s.zip || '',
            place: s.city || '',
            region: s.province || '',
            region_code: s.provinceCode || '',
            country: 'United States',
            country_code: 'US',
            label: s.address1 ? `${s.address1}, ${s.city}` : 'Unknown Address',
            // Hardening: If Shopify ID is missing, we use a fallback or 
            // let Zod throw a clear 'value is required' error.
            value: s.id || 'temp_id',
        });
    }

    // 3. FALLBACK: Throw a clear error if the object matches neither
    throw new Error("[Address Utility]: Object is neither a valid IAddress nor IShopifyAddress.");
}) as AddressInterface;

export const Address = Object.assign(AddressBase, {
    schema: AddressSchema,
    safeParse: (data: unknown) => AddressSchema.safeParse(data),
});



// Shopify Schema (Internal/Target)
export const ShopifyAddressSchema = z.object({
    id: z.string().optional(),
    address1: z.string(),
    address2: z.string().optional(),
    city: z.string(),
    countryCodeV2: z.string().length(2).optional(),
    zip: z.string(),
    province: z.string().optional(),
    provinceCode: z.string().optional(),
});



