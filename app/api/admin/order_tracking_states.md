# Order Tracking States

### Delivery Tracks

* **Self-Delivery:** `delivery-pending` → `delivery-packaged` → `delivery-out-for-delivery` → `delivery-fulfilled`
* **Carrier/Shipped:** `delivery-pending` → `delivery-packaged` → `delivery-shipped` → `delivery-fulfilled`

### Pickup Track

1. `pickup-pending` → `pickup-packaged`
2. `pickup-packaged` → `pickup-ready`
3. `pickup-ready` → `pickup-fulfilled` *(Trigger: on fulfillment)*
4. `pickup-ready` → `pickup-missed-pickup` *(Trigger: manual override/customer no-show)*

To implement the tracking states from your documentation on Shopify Basic, you will use **Shopify Flow** to handle automatic tagging and **Saved Views** to create the physical "production line" in your admin interface.

### **1. Automate Initial Entry (Shopify Flow)**

You need to automatically categorize orders as they come in. Since you are selling baked goods, this ensures the kitchen knows the "Delivery" vs "Pickup" priority immediately.

* **Trigger:** `Order Paid`
* **Condition:** `Order / ShippingAddress / name` is empty (for Pickup) OR `Order / ShippingLine / title` contains "Pickup".
* **Action:** * If **Pickup**: Add tag `pickup-pending`.
  * If **Delivery**: Add tag `delivery-pending`.

### **2. Create the "Production Line" (Saved Views)**

This is the most critical step for your staff. You will create tabs at the top of the **Orders** page that act as your manufacturing stages.

1. Go to **Orders** in Shopify Admin.
2. Click the **Search & Filter** icon.
3. Add a filter: **Tag** is `pickup-pending`.
4. Click **Save as** and name it `1. Pickup: Pending`.
5. **Repeat** this for every state in your document (e.g., `2. Pickup: Packaged`, `3. Ready: Pickup`).

**Result:** Your staff can now move an order through the process by simply changing a tag, and the order will physically "jump" from one tab to the next.

### **3. Automate State Transitions**

To scale, you want Flow to handle the "cleanup" so your staff doesn't have to manually delete old tags.

**Example: Moving from Packaged to Ready (Pickup)**

* **Trigger:** `Order tags added`
* **Condition:** `Added tag` contains `pickup-ready`.
* **Action:** `Remove order tags` -> `pickup-packaged`.

**Example: The Fulfillment Trigger (Ready to Fulfilled)**

* **Trigger:** `Fulfillment created`
* **Condition:** `Order / tags` contains `pickup-ready`.
* **Action:** 1.  Add tag `pickup-fulfilled`.
    2.  Remove tag `pickup-ready`.

### **4. Setup the "Feedback Loop" (Webhooks)**

To keep your custom Firebase dashboard in sync with Shopify:

1. Go to **Settings > Notifications > Webhooks**.
2. Click **Create Webhook**.
3. **Event:** `Order updated` (this triggers whenever a tag is changed).
4. **Format:** JSON.
5. **URL:** Your Firebase Cloud Function URL (e.g., `https://api.mysite.com/webhooks/shopify-sync`).
6. **Secret:** Copy the "Header Secret" provided by Shopify. Your Cloud Function must use this to verify the request is authentic.

### **5. The "Missed Pickup" Logic**

Since "Missed Pickup" is a manual override, you don't need a Flow for the transition. Your staff will simply:

1. Open the order in the `3. Ready: Pickup` tab.
2. Manually add the tag `pickup-missed-pickup`.
3. Your **Order Updated** webhook will fire, and your Firebase backend can then trigger a specific "Sorry we missed you" email or notification via your custom API.

### **Pro-Tip: Bulk Processing**

In the Shopify Admin, your staff can select 20 orders at once in the `pickup-pending` tab, click **"More Actions" > "Add tags"**, and type `pickup-packaged`. Your Flow automations will then instantly strip the `pending` tags and move all 20 orders into the next tab.
