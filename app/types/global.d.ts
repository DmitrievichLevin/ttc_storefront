
/** 
 * Represents a validated ISO 8601 string (YYYY-MM-DDTHH:mm:ss.sssZ).
 * It is physically a string, but unique in the type system.
 */
type ISO8601 = string & { readonly __brand: unique symbol };

interface IAddress {
    street: string;
    secondary_address: string;
    postcode: string;
    place: string; // City
    region: string;
    region_code: string;
    country: 'United States';
    country_code: 'US';
    // Label
    label: string;
    // MapBox Id
    value: string;
};

interface IShopifyAddress {
    id: string;
    address1: string;
    address2?: string;
    city: string;
    countryCodeV2: string; // Use this for ISO codes
    province: string; // State or province
    provinceCode: string;
    zip: string; // Postal code
}

type FirebaseIdToken = string & { readonly __brand: "FirebaseIdToken" };

type UsPhoneNumber = string & { readonly __brand: "UsPhoneNumber" };


/** Unique identifier for a Shopify Customer */
type ShopifyCustomerId = string & { readonly __brand: "ShopifyCustomerId" };

/** Unique identifier for a Firebase User */
type FirebaseUid = string & { readonly __brand: "FirebaseUid" };