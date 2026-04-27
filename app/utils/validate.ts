export default {
    // Type Guard to help the implementation distinguish at runtime
    isFirebaseIdToken: (val: string): val is FirebaseIdToken => {
        // Basic JWT check: tokens have two dots
        return val.split('.').length === 3;
    },

    isUsPhoneNumber: (phone: string): phone is UsPhoneNumber => {
        // Regex: Starts with +1, followed by exactly 10 digits
        return /^\+1\d{10}$/.test(phone);
    },

    isShopifyCustomerId: (id: string): id is ShopifyCustomerId => {
        // Checks for GraphQL format OR raw numeric string
        return id.startsWith('gid://shopify/Customer/') || /^\d+$/.test(id);
    },

    isFirebaseUid: (id: string): id is FirebaseUid => {
        // Firebase UIDs are alphanumeric, no special chars, usually 28 chars
        return /^[a-zA-Z0-9]{28}$/.test(id);
    }
}