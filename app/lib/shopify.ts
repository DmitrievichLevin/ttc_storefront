import { IShopifyUser } from '../schema/user.schema';
import validate from '../utils/validate';

const shopifyDomain = process.env.SHOPIFY_STORE_DOMAIN;
const shopifyToken = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;

if (!shopifyDomain || !shopifyToken) {
    throw new Error('FATAL: Shopify Environment Variables are missing. Check SHOPIFY_STORE_DOMAIN and SHOPIFY_ADMIN_ACCESS_TOKEN.');
}

// Add this near the top of your shopify.ts file
class FatalShopifyError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "FatalShopifyError";
    }
}

// 2. Use GraphQL Fragments instead of string concatenation
const UserFieldsFragment = `
  fragment UserFields on Customer {
    id
    firstName
    lastName
    phone
    fuid: metafield(namespace: "custom", key: "fuid") {
      value
    }
    defaultAddress {
      id
      address1
      address2
      city
      countryCodeV2
      zip
      province
      provinceCode
    }
    lastOrder {
      id
      name
      createdAt
      totalPriceSet {
        presentmentMoney {
          amount
          currencyCode
        }
      }
      lineItems(first: 50) {
        edges {
          node {
            id
            title
            quantity
            variant {
              id
              sku
            }
          }
        }
      }
    }
    createdAt
    updatedAt
  }
`;

// 3. Define complete queries utilizing variables and the fragment
const QUERIES = {
    BY_ID: `
        query CustomerById($id: ID!) {
            customer(id: $id) {
                ...UserFields
            }
        }
        ${UserFieldsFragment}
    `,
    BY_PHONE: `
        query CustomerByPhone($phone: String!) {
            customer: customerByIdentifier(identifier: { phoneNumber: $phone }) {
                ...UserFields
            }
        }
        ${UserFieldsFragment}
    `,
    BY_FUID: `
        query CustomerByFuid($fuid: String!) {
            customer: customerByIdentifier(
                identifier: { customId: { namespace: "custom", key: "fuid", value: $fuid } }
            ) {
                ...UserFields
            }
        }
        ${UserFieldsFragment}
    `
};

// 1. Add a simple delay utility at the top of your file
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));


// 4. Harden the Fetch Wrapper
export async function shopifyFetch<T>({
    query,
    variables = {},
    maxRetries = 3,
    baseDelayMs = 1000
}: {
    query: string;
    variables?: Record<string, any>;
    maxRetries?: number;
    baseDelayMs?: number;
}): Promise<T> {
    // Note: Consider moving the API version to an env var or config
    const endpoint = shopifyDomain!;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            const response = await fetch(endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Shopify-Access-Token': shopifyToken!,
                },
                body: JSON.stringify({ query, variables }),
            });

            // --- RATE LIMIT HANDLING (HTTP 429) ---
            if (response.status === 429) {
                if (attempt === maxRetries) {
                    throw new Error(`Shopify API Rate Limit Exceeded after ${maxRetries} retries.`);
                }

                // Shopify often provides a Retry-After header (in seconds). Respect it if present.
                const retryAfterHeader = response.headers.get('Retry-After');

                // Exponential calculation: baseDelay * 2^attempt
                const calculatedBackoff = baseDelayMs * Math.pow(2, attempt);

                const retryAfterMs = retryAfterHeader
                    ? parseFloat(retryAfterHeader) * 1000
                    : calculatedBackoff;

                // Add Jitter (0-500ms) to prevent the "thundering herd" problem
                const waitTime = retryAfterMs + (Math.random() * 500);

                console.warn(`[Shopify 429]: Rate limit hit. Retrying in ${Math.round(waitTime)}ms (Attempt ${attempt + 1} of ${maxRetries})`);
                await delay(waitTime);
                continue; // Loop back and try again
            }

            // --- STANDARD HTTP ERRORS ---
            if (!response.ok) {
                // If the server is temporarily down (50x), we should also retry
                if (response.status >= 500 && attempt < maxRetries) {
                    const waitTime = (baseDelayMs * Math.pow(2, attempt)) + (Math.random() * 500);
                    console.warn(`[Shopify 50x]: Server error. Retrying in ${Math.round(waitTime)}ms (Attempt ${attempt + 1})`);
                    await delay(waitTime);
                    continue;
                }
                throw new Error(`Shopify API Network Error: ${response.status} ${response.statusText}`);
            }

            const result = await response.json();

            // --- GRAPHQL SPECIFIC ERRORS ---
            if (result.errors) {
                // Shopify sometimes returns a 200 OK but includes a THROTTLED error in the payload
                const isThrottled = result.errors.some((e: any) => e.extensions?.code === 'THROTTLED');

                if (isThrottled && attempt < maxRetries) {
                    const waitTime = (baseDelayMs * Math.pow(2, attempt)) + (Math.random() * 500);
                    console.warn(`[Shopify GraphQL Throttled]: Cost limit exceeded. Retrying in ${Math.round(waitTime)}ms (Attempt ${attempt + 1})`);
                    await delay(waitTime);
                    continue;
                }

                console.error('[Shopify GraphQL Error]:', JSON.stringify(result.errors, null, 2));
                // FIX: Throw the custom Fatal error instead of a generic Error
                throw new FatalShopifyError('Failed to execute Shopify GraphQL query due to schema or syntax errors.');
            }

            return result;
        } catch (error: any) {
            // FIX: Immediately break the retry loop if the error is explicitly marked as Fatal
            if (error instanceof FatalShopifyError) {
                throw error;
            }
            // Catch unexpected network failures (e.g., DNS resolution failed, socket hang up)
            if (attempt === maxRetries) {
                throw error; // Bubble up if we're out of retries
            }
            const waitTime = (baseDelayMs * Math.pow(2, attempt)) + (Math.random() * 500);
            console.warn(`[Network/Fetch Error]: ${error.message}. Retrying in ${Math.round(waitTime)}ms`);
            await delay(waitTime);
        }
    }

    throw new Error("Shopify fetch failed unexpectedly."); // Fallback safety net
}


interface UserQueryInterface {
    // Overload 2: Specifically for the UsPhoneNumber
    (phone: UsPhoneNumber): Promise<IShopifyUser | null>;
    // Overload 3: Specifically for the ShopifyCustomerId
    (id: ShopifyCustomerId): Promise<IShopifyUser | null>;
    // Overload 4: Specifically for the FirebaseUid
    (uid: FirebaseUid): Promise<IShopifyUser | null>;
}

// 6. The Execution Logic
const UserQueryBase = (async (data: string): Promise<IShopifyUser | null> => {
    let query: string;
    let variables: Record<string, string>;

    // Type Guards routing to proper variables
    if (validate.isUsPhoneNumber(data)) {
        query = QUERIES.BY_PHONE;
        variables = { phone: data };
    }
    else if (validate.isShopifyCustomerId(data)) {
        query = QUERIES.BY_ID;
        variables = { id: data };
    }
    else if (validate.isFirebaseUid(data)) {
        query = QUERIES.BY_FUID;
        variables = { fuid: data };
    }
    else {
        throw new Error("[User Query Utility]: Input is neither a valid UsPhoneNumber, ShopifyCustomerId, nor FirebaseUid.");
    }

    // Execute the fetch
    // We expect { customer: IShopifyUser } from our defined queries
    const response = await shopifyFetch<{ customer: IShopifyUser | null }>({
        query,
        variables
    });

    // Return just the user object (or null if not found)
    return response.customer || null;

}) as UserQueryInterface;

export const UserQuery = Object.assign(UserQueryBase, {});

export interface IUserLoginData {
    // "FirstName[Space]LastName"
    fullName: string;
    phone: UsPhoneNumber;
    address?: IAddress;
}

export interface IUserCreateData extends IUserLoginData {
    fuid: FirebaseUid;
}


// The mutation string defined in the previous step
const CREATE_USER_MUTATION = `
  mutation CreateUser($input: CustomerInput!) {
    customerCreate(input: $input) {
      customer {
        id
        firstName
        lastName
        phone
        fuid: metafield(namespace: "custom", key: "fuid") {
          value
        }
        defaultAddress {
          id
          address1
          address2
          city
          countryCodeV2
          zip
          province
          provinceCode
        }
      }
      userErrors {
        field
        message
      }
    }
  }
`;



export const CreateUserBase = async (
    {
        fullName, phone, fuid,
        address
    }: IUserCreateData
): Promise<IShopifyUser | null> => {

    const nameParts = fullName.trim().split(/\s+/);
    const firstName = nameParts[0] || '';
    const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : '—'; // Shopify often requires a lastName
    // 1. Build the base input
    const input: any = {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        phone: phone.trim(),
        metafields: [
            {
                namespace: "custom",
                key: "fuid",
                value: fuid,
                type: "single_line_text_field"
            }
        ]
    };

    // 2. Conditionally add address if provided
    // Shopify expects an array of addresses; we'll map your IAddress to their format
    if (address) {
        input.addresses = [
            {
                address1: address.street,
                address2: address.secondary_address,
                city: address.place,
                provinceCode: address.region_code,
                zip: address.postcode,
                countryCode: address.country_code
            }
        ];
    }

    // 3. Execute via your hardened fetch wrapper
    const response = await shopifyFetch<{
        customerCreate: {
            customer: IShopifyUser | null,
            userErrors: Array<{ field: string[], message: string }>
        }
    }>({
        query: CREATE_USER_MUTATION,
        variables: { input }
    });

    // 4. Detailed Error Reporting
    if (response?.customerCreate?.userErrors) {
        if (response.customerCreate.userErrors.length > 0) {
            const errorList = response.customerCreate.userErrors
                .map(e => `[${e.field.join('.')}] ${e.message}`)
                .join(', ');

            // Log the full error for debugging, but throw a clean message
            console.error(`Shopify CreateUser Failed: ${errorList}`);
            throw new Error(`Registration failed: ${response.customerCreate.userErrors[0].message}`);
        }
    }
    console.log("Create response", response, response?.customerCreate, response?.customerCreate?.customer);
    return response.customerCreate?.customer;

};
