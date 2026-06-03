# Petpooja DineIn API Reference

> All requests use **POST** method with `Content-Type: application/json`.

## Table of Contents

1. [Authentication Fields](#authentication-fields)
2. [Get Areas and Tables](#1-get-areas-and-tables)
3. [Get DineIn Menu](#2-get-dinein-menu)
4. [Register Customer](#3-register-customer)
5. [Validate PIN](#4-validate-pin)
6. [Save KOT](#5-save-kot)
7. [Request Bill](#6-request-bill)
8. [Check Bill](#7-check-bill)
9. [Get Bill](#8-get-bill)
10. [Success Payment](#9-success-payment)
11. [Billing Flow](#billing-flow)

---

## Authentication Fields

All APIs require the following fields in the request body:

| Field          | Type   | Length | Description                                              |
| -------------- | ------ | ------ | -------------------------------------------------------- |
| `app_key`      | string | 32     | Unique code to track and identify application            |
| `app_secret`   | string | 40     | Unique code for transferring secret data                 |
| `access_token` | string | 40     | Unique code for third-party API user/consumer            |
| `restID`       | string | —      | Unique Petpooja Restaurant ID                            |

---

## 1. Get Areas and Tables

Fetch all areas and tables created in an outlet. The endpoint is shared with [Get DineIn Menu](#2-get-dinein-menu) — pass `tableNo` as blank to get areas/tables only.

**Staging Endpoint:**
```
POST https://vv3hiv00yk.execute-api.ap-southeast-1.amazonaws.com/V1/thirdparty_fetch_dinein_qr_menu
```

### Request

```json
{
  "app_key": "xxxxxxx",
  "app_secret": "xxxxxxxx",
  "access_token": "xxx",
  "restID": "xxxxxx",
  "tableNo": ""
}
```

| Field          | Type   | Required | Description                        |
| -------------- | ------ | -------- | ---------------------------------- |
| `app_key`      | string | yes      | See [auth fields](#authentication-fields) |
| `app_secret`   | string | yes      | See [auth fields](#authentication-fields) |
| `access_token` | string | yes      | See [auth fields](#authentication-fields) |
| `restID`       | string | yes      | Petpooja Restaurant ID             |
| `tableNo`      | string | yes      | Pass **blank** to fetch areas/tables |

### Response — 200 OK

```json
{
  "success": "1",
  "message": "Menu items are successfully listed.",
  "restaurants": [
    {
      "active": "1",
      "details": {
        "restaurantname": "FFFF",
        "country": "India",
        "images": [],
        "address": "CORPORATE AVENUE BUILDING GROUND FLOOR PRAHLAD NAGAR - 321005",
        "contact": "9999999999",
        "latitude": "1",
        "longitude": "1",
        "cuisines": "",
        "landmark": "",
        "city": "Ahmedabad",
        "state": "Gujarat"
      }
    }
  ],
  "areas": [
    { "restaurantareaid": "7",  "areaid": "1",  "displayname": "AC",             "active": "1", "rank": "1" },
    { "restaurantareaid": "8",  "areaid": "2",  "displayname": "Garden",          "active": "1", "rank": "1" },
    { "restaurantareaid": "16", "areaid": "3",  "displayname": "Non AC",          "active": "1", "rank": "1" },
    { "restaurantareaid": "17", "areaid": "6",  "displayname": "Family",          "active": "1", "rank": "1" },
    { "restaurantareaid": "18", "areaid": "12", "displayname": "Dining",          "active": "1", "rank": "1" },
    { "restaurantareaid": "19", "areaid": "8",  "displayname": "AC Smoking",      "active": "1", "rank": "1" },
    { "restaurantareaid": "20", "areaid": "9",  "displayname": "Non-AC Smoking",  "active": "1", "rank": "1" },
    { "restaurantareaid": "21", "areaid": "22", "displayname": "Banquet",         "active": "1", "rank": "1" }
  ],
  "tables": [
    { "id": "70", "restaurantareaid": "7", "table_no": "T-01", "active": "1", "rank": "0" },
    { "id": "71", "restaurantareaid": "8", "table_no": "T-02", "active": "1", "rank": "0" },
    { "id": "72", "restaurantareaid": "0", "table_no": "T-03", "active": "1", "rank": "0" },
    { "id": "73", "restaurantareaid": "0", "table_no": "T-04", "active": "1", "rank": "0" },
    { "id": "74", "restaurantareaid": "0", "table_no": "T-05", "active": "1", "rank": "0" },
    { "id": "75", "restaurantareaid": "0", "table_no": "T-06", "active": "1", "rank": "0" },
    { "id": "76", "restaurantareaid": "0", "table_no": "T-07", "active": "1", "rank": "0" },
    { "id": "77", "restaurantareaid": "0", "table_no": "T-08", "active": "1", "rank": "0" },
    { "id": "78", "restaurantareaid": "0", "table_no": "T-09", "active": "1", "rank": "0" },
    { "id": "79", "restaurantareaid": "0", "table_no": "T-10", "active": "1", "rank": "0" },
    { "id": "80", "restaurantareaid": "0", "table_no": "T-11", "active": "1", "rank": "0" },
    { "id": "81", "restaurantareaid": "0", "table_no": "T-12", "active": "1", "rank": "0" },
    { "id": "82", "restaurantareaid": "0", "table_no": "T-13", "active": "1", "rank": "0" },
    { "id": "83", "restaurantareaid": "0", "table_no": "T-14", "active": "1", "rank": "0" }
  ]
}
```

#### Response Fields

| Field            | Type   | Required | Description                          |
| ---------------- | ------ | -------- | ------------------------------------ |
| `success`        | string | yes      | `"1"` = success, `"0"` = error       |
| `message`        | string | no       | Human-readable API response message  |
| `restaurants`    | object | no       | Restaurant details                   |
| `areas`          | object | no       | Array of area objects                |
| `tables`         | object | no       | Array of table objects               |

**`restaurants[].details` fields:** `restaurantname`, `country`, `images`, `address`, `contact`, `latitude`, `longitude`, `cuisines`, `landmark`, `city`, `state`

**`areas[]` fields:** `restaurantareaid`, `areaid`, `displayname`, `active`, `rank`

**`tables[]` fields:** `id`, `restaurantareaid`, `table_no`, `active`, `rank`

---

## 2. Get DineIn Menu

Fetch menu for a specific table. If the table belongs to an area with a custom menu, that area's menu is returned. Uses the same endpoint as Get Areas and Tables — pass `tableNo` to differentiate.

**Staging Endpoint:**
```
POST https://vv3hiv00yk.execute-api.ap-southeast-1.amazonaws.com/V1/thirdparty_fetch_dinein_qr_menu
```

### Request

```json
{
  "app_key": "xxxxxxx",
  "app_secret": "xxxxxxxx",
  "access_token": "xxx",
  "restID": "xxxxxx",
  "tableNo": "x1x"
}
```

| Field          | Type   | Required | Description                                           |
| -------------- | ------ | -------- | ----------------------------------------------------- |
| `app_key`      | string | yes      | See [auth fields](#authentication-fields)             |
| `app_secret`   | string | yes      | See [auth fields](#authentication-fields)             |
| `access_token` | string | yes      | See [auth fields](#authentication-fields)             |
| `restID`       | string | yes      | Petpooja Restaurant ID                                |
| `tableNo`      | string | yes      | Table number to fetch menu for (e.g. `"T-01"`)        |

### Response — 200 OK

```json
{
  "success": "1",
  "message": "Menu items are successfully listed.",
  "restaurants": [
    {
      "active": "1",
      "details": {
        "restaurantname": "FFFF",
        "country": "India",
        "images": [],
        "address": "CORPORATE AVENUE BUILDING GROUND FLOOR PRAHLAD NAGAR - 321005",
        "contact": "9999999999",
        "latitude": "1",
        "longitude": "1",
        "cuisines": "",
        "landmark": "",
        "city": "Ahmedabad",
        "state": "Gujarat"
      }
    }
  ],
  "categories": [
    {
      "categoryid": "500773",
      "active": "1",
      "categoryrank": "16",
      "parent_category_id": "0",
      "categoryname": "Pizzaandsides",
      "categorytimings": "",
      "category_image_url": "",
      "restarant_ids": "19349",
      "group_category_id": "98"
    },
    {
      "categoryid": "500774",
      "active": "1",
      "categoryrank": "17",
      "parent_category_id": "0",
      "categoryname": "Cakes",
      "categorytimings": "",
      "category_image_url": "",
      "restarant_ids": "19349",
      "group_category_id": "99"
    }
  ],
  "parentcategories": [
    {
      "name": "Colddrinks",
      "id": "610854",
      "online_display_name": "",
      "rank": "1",
      "image_url": "",
      "status": "1"
    }
  ],
  "group_categories": [
    { "id": "98", "name": "Italian", "status": "1", "rank": "2" },
    { "id": "99", "name": "Bakery",  "status": "1", "rank": "1" }
  ],
  "items": [
    {
      "itemid": "59000970",
      "itemallowvariation": "0",
      "itemname": "Way Free Way Pancakes",
      "itemrank": "1",
      "item_categoryid": "395971",
      "price": "149",
      "active": "1",
      "item_favorite": "0",
      "itemallowaddon": "1",
      "itemaddonbasedon": "0",
      "instock": "2",
      "attributes": "1",
      "days": "-1",
      "variation": [],
      "addon": [
        {
          "addon_group_id": "70650",
          "addon_item_selection": "M",
          "addon_item_selection_min": "0",
          "addon_item_selection_max": "3"
        }
      ],
      "item_attributeid": "1",
      "itemdescription": "",
      "minimumpreparationtime": "",
      "item_image_url": ""
    },
    {
      "itemid": "6242592",
      "itemallowvariation": "0",
      "itemname": "8\" Cheese Shot Nacho Pizza",
      "itemrank": "1",
      "item_categoryid": "395961",
      "price": "209",
      "active": "1",
      "item_favorite": "0",
      "itemallowaddon": "0",
      "itemaddonbasedon": "0",
      "instock": "2",
      "attributes": "1",
      "days": "-1",
      "variation": [],
      "addon": [],
      "item_attributeid": "1",
      "itemdescription": "Cheese shots loaded with crisps cheese and sauces.",
      "minimumpreparationtime": "",
      "item_image_url": ""
    },
    {
      "itemid": "5941846",
      "itemallowvariation": "1",
      "itemname": "Americana Corn Pizza",
      "itemrank": "1",
      "item_categoryid": "395960",
      "price": "0",
      "active": "1",
      "item_favorite": "0",
      "itemallowaddon": "1",
      "itemaddonbasedon": "1",
      "instock": "2",
      "attributes": "1",
      "days": "-1",
      "variation": [
        {
          "id": "5942006",
          "variationid": "67788",
          "name": "Medium",
          "price": "159",
          "active": "1",
          "addon": [
            { "addon_group_id": "70650", "addon_item_selection": "M", "addon_item_selection_min": "0", "addon_item_selection_max": "3" },
            { "addon_group_id": "70653", "addon_item_selection": "M", "addon_item_selection_min": "0", "addon_item_selection_max": "1" }
          ],
          "variationallowaddon": "1"
        },
        {
          "id": "5942007",
          "variationid": "67789",
          "name": "Large",
          "price": "239",
          "active": "1",
          "addon": [
            { "addon_group_id": "70650", "addon_item_selection": "M", "addon_item_selection_min": "0", "addon_item_selection_max": "3" },
            { "addon_group_id": "70653", "addon_item_selection": "M", "addon_item_selection_min": "0", "addon_item_selection_max": "1" }
          ],
          "variationallowaddon": "1"
        }
      ],
      "addon": [],
      "item_attributeid": "1",
      "itemdescription": "",
      "minimumpreparationtime": "",
      "item_image_url": ""
    }
  ],
  "addongroups": [
    {
      "addongroupid": "66",
      "addongroup_restaurantid": "366",
      "addongroup_name": "Pizza Addons",
      "addongroup_rank": "2",
      "active": "1",
      "addongroupitems": [
        { "addonitemid": "11", "addonitem_name": "Onion",    "addonitem_price": "20", "active": "1" },
        { "addonitemid": "12", "addonitem_name": "Paneer",   "addonitem_price": "35", "active": "1" },
        { "addonitemid": "13", "addonitem_name": "Tomato",   "addonitem_price": "30", "active": "1" },
        { "addonitemid": "14", "addonitem_name": "Capsicum", "addonitem_price": "35", "active": "1" },
        { "addonitemid": "15", "addonitem_name": "Corn",     "addonitem_price": "33", "active": "1" }
      ]
    }
  ],
  "itemspecialnotes": [],
  "serverdatetime": "2019-11-12 18:24:03"
}
```

#### Response Fields

| Field               | Type   | Description                                                            |
| ------------------- | ------ | ---------------------------------------------------------------------- |
| `success`           | string | `"1"` = success, `"0"` = error                                         |
| `message`           | string | Human-readable API response message                                    |
| `restaurants`       | object | Restaurant details (same shape as Get Areas and Tables)                |
| `categories`        | object | Array of menu categories                                               |
| `parentcategories`  | object | Array of top-level parent categories                                   |
| `group_categories`  | object | Array of group categories (e.g. Italian, Bakery)                       |
| `items`             | object | Array of menu items (see item fields below)                            |
| `addongroups`       | object | Array of addon groups with their items                                 |
| `itemspecialnotes`  | object | Any specific notes for items                                           |
| `serverdatetime`    | string | Server timestamp                                                       |

**`items[]` fields:**

| Field                    | Description                                                                    |
| ------------------------ | ------------------------------------------------------------------------------ |
| `itemid`                 | Unique item ID                                                                 |
| `itemname`               | Item name                                                                      |
| `itemallowvariation`     | `"1"` if item has variations                                                   |
| `itemrank`               | Display order rank                                                             |
| `item_categoryid`        | Category the item belongs to                                                   |
| `price`                  | Item price (will be `"0"` if variations exist; use variation price instead)    |
| `active`                 | `"1"` = active                                                                 |
| `item_favorite`          | `"1"` if marked as favorite                                                    |
| `itemallowaddon`         | `"1"` if addons are allowed                                                    |
| `itemaddonbasedon`       | `"0"` = item-level addons, `"1"` = addons are per variation                   |
| `instock`                | Stock status                                                                   |
| `attributes`             | Food type attribute (e.g. `"1"` = veg)                                         |
| `item_attributeid`       | Attribute ID                                                                   |
| `days`                   | Available days (`"-1"` = always available)                                     |
| `variation`              | Array of variation objects (empty if no variations)                            |
| `addon`                  | Array of addon group references at item level                                  |
| `itemdescription`        | Item description                                                               |
| `minimumpreparationtime` | Minimum prep time                                                              |
| `item_image_url`         | Image URL (may be empty)                                                       |

**`variation[]` fields:** `id`, `variationid`, `name`, `price`, `active`, `addon[]`, `variationallowaddon`

**`addon[]` (on item or variation):** `addon_group_id`, `addon_item_selection` (`"M"` = multiple), `addon_item_selection_min`, `addon_item_selection_max`

**`addongroups[]` fields:** `addongroupid`, `addongroup_restaurantid`, `addongroup_name`, `addongroup_rank`, `active`, `addongroupitems[]`

**`addongroupitems[]` fields:** `addonitemid`, `addonitem_name`, `addonitem_price`, `active`

---

## 3. Register Customer

Register a customer's phone number to open a session for DineIn QR ordering. The phone number acts as the customer's PIN for all subsequent APIs (validate pin, request bill, etc.). The session remains valid until the invoice is generated or for a few hours — after that, re-registration is required.

**Staging Endpoint:**
```
POST http://52.76.48.26:4524/petpoojabilling_api/V1/captainorders/save_menu_qr_customer_information/
```

### Request

```json
{
  "app_key": "xxx",
  "app_secret": "xxx",
  "access_token": "xxx",
  "restID": "xxxxxx",
  "phone": "xxxxxx",
  "name": "xxxxx"
}
```

| Field          | Type   | Required | Description                                           |
| -------------- | ------ | -------- | ----------------------------------------------------- |
| `app_key`      | string | yes      | See [auth fields](#authentication-fields)             |
| `app_secret`   | string | yes      | See [auth fields](#authentication-fields)             |
| `access_token` | string | yes      | See [auth fields](#authentication-fields)             |
| `restID`       | string | yes      | Unique mapped ID for third-party restaurant           |
| `phone`        | string | yes      | Customer phone number — used as PIN for other APIs    |
| `name`         | string | no       | Customer name                                         |

### Response — 200 OK

```json
{
  "success": "1",
  "message": "Customer information save successfully."
}
```

| Field     | Type   | Description                              |
| --------- | ------ | ---------------------------------------- |
| `success` | string | API response status                      |
| `message` | string | API response message                     |

---

## 4. Validate PIN

After a customer scans the QR code on their table, they must enter a PIN to confirm their presence. The captain generates and provides the PIN, which is valid until invoice generation.

**Staging Endpoint:**
```
POST http://52.76.48.26:4524/petpoojabilling_api/V1/captainorders/validate_pin_qr/
```

### Request

```json
{
  "app_key": "xxx",
  "app_secret": "xxx",
  "access_token": "xxx",
  "restID": "xxxxxx",
  "pin": "xxxxxx"
}
```

| Field          | Type   | Required | Description                                           |
| -------------- | ------ | -------- | ----------------------------------------------------- |
| `app_key`      | string | yes      | See [auth fields](#authentication-fields)             |
| `app_secret`   | string | yes      | See [auth fields](#authentication-fields)             |
| `access_token` | string | yes      | See [auth fields](#authentication-fields)             |
| `restID`       | string | yes      | Unique mapped ID for third-party restaurant           |
| `pin`          | string | yes      | PIN given by captain to customer at table             |

### Response — 200 OK

```json
{
  "success": "1",
  "message": "Pin is valid.",
  "table_no": "21"
}
```

| Field      | Type   | Description                                              |
| ---------- | ------ | -------------------------------------------------------- |
| `success`  | string | API response status                                      |
| `message`  | string | API response message                                     |
| `table_no` | string | Table number associated with the PIN (if PIN is valid)   |

---

## 5. Save KOT

Push a customer's order from Petpooja Cloud to Petpooja POS as a KOT (Kitchen Order Token). This automatically prints the KOT to assigned kitchen printers and activates the table for billing in the normal POS billing flow.

**Staging Endpoint:**
```
POST http://52.76.48.26:4524/petpoojabilling_api/V1/captainorders/save_kot_qr_order/
```

### Request

```json
{
  "app_key": "xxx",
  "app_secret": "xxx",
  "access_token": "xxx",
  "restID": "xxxxxx",
  "kotinfo": {
    "Restaurant": {
      "restID": "xxxxxx"
    },
    "Customer": {
      "name": "",
      "mobile": "",
      "address": ""
    },
    "Kot": {
      "uniqueID": "1",
      "order_type": "D",
      "table_no": "A1",
      "no_of_persons": "",
      "created_on": "2019-11-11 18:53:50",
      "callback_url": ""
    },
    "KotItem": [
      {
        "name": "Chinese Soup (1/4)",
        "quantity": 1,
        "specialnotes": "Less Spicy,Without Onion",
        "id": "753218",
        "AddonItem": "[{\"group_id\":\"337\",\"group_name\":\"Test_Addon_Group\",\"id\":\"1648\",\"name\":\"Test Addon 6\",\"price\":\"1\",\"quantity\":1}]",
        "fixed_per": "0"
      },
      {
        "name": "Chiken Kima",
        "quantity": 1,
        "specialnotes": "Less Spicy,Without Onion",
        "id": "755872",
        "AddonItem": "",
        "fixed_per": "0"
      },
      {
        "name": "Item With Addon & Variation (1/2)",
        "quantity": 1,
        "specialnotes": "",
        "id": "754987",
        "AddonItem": "[{\"group_id\":\"342\",\"group_name\":\"Choice Of Sauces\",\"id\":\"1643\",\"name\":\"Tomato Sauce\",\"price\":\"1.2\",\"quantity\":1},{\"group_id\":\"341\",\"group_name\":\"Pizza Additional Topping\",\"id\":\"1637\",\"name\":\"Extra Cheese Medium Topping\",\"price\":\"55\",\"quantity\":1}]",
        "fixed_per": "0"
      },
      {
        "name": "Chocolate Ice-cream",
        "quantity": 1,
        "specialnotes": "",
        "id": "755878",
        "AddonItem": "",
        "fixed_per": "0"
      },
      {
        "name": "Item With Combo",
        "quantity": 1,
        "specialnotes": "",
        "id": "754979",
        "AddonItem": "",
        "fixed_per": "0"
      },
      {
        "name": "Item With Variation (Medium)",
        "quantity": 1,
        "specialnotes": "",
        "id": "754984",
        "AddonItem": "",
        "fixed_per": "0"
      }
    ]
  }
}
```

#### Request Field Details

**Top-level fields:**

| Field          | Type   | Required | Description                                           |
| -------------- | ------ | -------- | ----------------------------------------------------- |
| `app_key`      | string | yes      | See [auth fields](#authentication-fields)             |
| `app_secret`   | string | yes      | See [auth fields](#authentication-fields)             |
| `access_token` | string | yes      | See [auth fields](#authentication-fields)             |
| `restID`       | string | yes      | Unique mapped ID for third-party restaurant           |
| `kotinfo`      | object | yes      | KOT details object (see below)                        |

**`kotinfo.Kot` fields:**

| Field           | Type   | Description                                                                 |
| --------------- | ------ | --------------------------------------------------------------------------- |
| `uniqueID`      | string | Unique order ID from third party                                            |
| `order_type`    | string | `"D"` = Dine In, `"H"` = Home delivery, `"P"` = Parcel                     |
| `table_no`      | string | **Required** when `order_type = "D"`                                        |
| `no_of_persons` | string | Number of guests (optional)                                                 |
| `created_on`    | string | Order creation timestamp (`"YYYY-MM-DD HH:MM:SS"`)                          |
| `callback_url`  | string | Callback URL for order status updates                                       |

**`kotinfo.KotItem[]` fields:**

| Field          | Type   | Description                                                                                         |
| -------------- | ------ | --------------------------------------------------------------------------------------------------- |
| `name`         | string | Item name. **For variation items:** format is `"Item Name (Variation Name)"` (e.g. `"Soup (1/4)"`) |
| `quantity`     | number | Quantity ordered                                                                                    |
| `specialnotes` | string | Kitchen instructions (e.g. `"Less Spicy,Without Onion"`)                                           |
| `id`           | string | **Simple item:** item ID. **Variation item:** variation item ID (the `id` from `variation[]`)       |
| `AddonItem`    | string | **JSON-encoded string** (not an object) — array of addon objects, or `""` if none                  |
| `fixed_per`    | string | Pass `"0"` (reserved for future use)                                                                |

**`AddonItem` string structure** (each element in the stringified array):

| Field        | Type   | Description              |
| ------------ | ------ | ------------------------ |
| `group_id`   | string | Addon group ID           |
| `group_name` | string | Addon group name         |
| `id`         | string | Addon item ID            |
| `name`       | string | Addon item name          |
| `price`      | string | Addon item price         |
| `quantity`   | number | Quantity of this addon   |

### Response — 200 OK

```json
{
  "success": "1",
  "message": "KOT save successfully.",
  "errorCode": ""
}
```

| Field       | Type   | Description                              |
| ----------- | ------ | ---------------------------------------- |
| `success`   | string | `"1"` = success, `"0"` = error          |
| `message`   | string | API response message                     |
| `errorCode` | string | Error code if applicable                 |

---

## 6. Request Bill

Notify the POS to generate a bill for a table. The POS will generate the bill if the table has active KOTs, then push bill information to Petpooja Cloud.

**Staging Endpoint:**
```
POST http://52.76.48.26:4524/petpoojabilling_api/V1/captainorders/request_bill/
```

### Request

```json
{
  "app_key": "xxx",
  "app_secret": "xxx",
  "access_token": "xxx",
  "restID": "xxxxxx",
  "pin": "xxxxxx",
  "tableNo": "xxxxx"
}
```

| Field          | Type   | Required | Description                                              |
| -------------- | ------ | -------- | -------------------------------------------------------- |
| `app_key`      | string | yes      | See [auth fields](#authentication-fields)                |
| `app_secret`   | string | yes      | See [auth fields](#authentication-fields)                |
| `access_token` | string | yes      | See [auth fields](#authentication-fields)                |
| `restID`       | string | yes      | Unique mapped ID for third-party restaurant              |
| `pin`          | string | yes      | Customer phone number (used as PIN)                      |
| `tableNo`      | string | yes      | Table number to request bill for                         |
| `name`         | string | no       | Customer name                                            |

### Response — 200 OK

```json
{
  "success": "1",
  "request_id": "123456",
  "bill_request_id": "987912345"
}
```

| Field             | Type   | Description                                                                                    |
| ----------------- | ------ | ---------------------------------------------------------------------------------------------- |
| `success`         | string | API response status                                                                            |
| `message`         | string | API response message                                                                           |
| `request_id`      | string | If returned → call [Check Bill](#7-check-bill) to poll until bill is ready                     |
| `bill_request_id` | string | If returned → call [Get Bill](#8-get-bill) directly without polling                            |

> **Note:** Only one of `request_id` or `bill_request_id` will be returned. See [Billing Flow](#billing-flow) for the complete decision tree.

---

## 7. Check Bill

Poll whether the POS has finished generating the bill. Call this when [Request Bill](#6-request-bill) returns a `request_id` (not a `bill_request_id`). Retry every 5+ seconds until you get a non-zero `bill_request_id`.

**Staging Endpoint:**
```
POST http://52.76.48.26:4524/petpoojabilling_api/V1/captainorders/check_bill/
```

### Request

```json
{
  "app_key": "xxx",
  "app_secret": "xxx",
  "access_token": "xxx",
  "restID": "xxxxxx",
  "request_id": "xxxxxx"
}
```

| Field          | Type   | Required | Description                                           |
| -------------- | ------ | -------- | ----------------------------------------------------- |
| `app_key`      | string | yes      | See [auth fields](#authentication-fields)             |
| `app_secret`   | string | yes      | See [auth fields](#authentication-fields)             |
| `access_token` | string | yes      | See [auth fields](#authentication-fields)             |
| `restID`       | string | yes      | Unique mapped ID for third-party restaurant           |
| `request_id`   | string | yes      | Request ID obtained from [Request Bill](#6-request-bill) |

### Response — 200 OK

```json
{
  "success": "1",
  "bill_request_id": "987912345"
}
```

| Field             | Type   | Description                                                                                    |
| ----------------- | ------ | ---------------------------------------------------------------------------------------------- |
| `success`         | string | API response status                                                                            |
| `message`         | string | API response message                                                                           |
| `bill_request_id` | string | `"0"` = bill not ready yet (wait ≥5s and retry) · `"-1"` = error/no active table (stop) · `>0` = ready, call Get Bill |

---

## 8. Get Bill

Retrieve full bill details including items, discounts, and taxes.

**Staging Endpoint:**
```
POST http://52.76.48.26:4524/petpoojabilling_api/V1/captainorders/get_bill/
```

### Request

```json
{
  "app_key": "xxx",
  "app_secret": "xxx",
  "access_token": "xxx",
  "restID": "xxxxxx",
  "bill_request_id": "xxxxxx"
}
```

| Field             | Type   | Required | Description                                              |
| ----------------- | ------ | -------- | -------------------------------------------------------- |
| `app_key`         | string | yes      | See [auth fields](#authentication-fields)                |
| `app_secret`      | string | yes      | See [auth fields](#authentication-fields)                |
| `access_token`    | string | yes      | See [auth fields](#authentication-fields)                |
| `restID`          | string | yes      | Unique mapped ID for third-party restaurant              |
| `bill_request_id` | string | yes      | Bill request ID from [Request Bill](#6-request-bill) or [Check Bill](#7-check-bill) |

### Response — 200 OK

```json
{
  "success": "1",
  "order_data": {
    "id": 994405,
    "restaurant_id": 251,
    "invoice_id": 127,
    "billing_user_id": 233,
    "billing_user_name": "1",
    "billing_user_original_name": "biller",
    "order_type": 3,
    "payment_type": 1,
    "core_price": 660,
    "discount": 14,
    "tax": 103.36,
    "total": 814,
    "settle_total": null,
    "customer_id": 0,
    "customer_phone": "",
    "customer_name": "",
    "customer_address": "",
    "table_no": "8",
    "status": 1,
    "printed": 1,
    "created": "2022-06-15 18:17:08",
    "modified": "2022-06-15 18:17:08",
    "sync": 1,
    "new_added": 1,
    "old_customer_id": 0,
    "cancel_order_description": null,
    "web_id": 0,
    "payment_confirmation": 0,
    "roundoff": "+0.04",
    "custom_payment_type": "",
    "desc_payment_type": "",
    "no_of_persons": 0,
    "finalized": 0,
    "print_count": 1,
    "amount_paid": 0,
    "order_edit_flag": 1,
    "facilitator_id": 233,
    "restaurant_area_id": 10,
    "payment_collection_date": "2022-06-15 18:17:08",
    "change_after_print": 0,
    "delivery_charge": 0,
    "pending_order_id": 0,
    "old_pending_order_id": 0,
    "coupon_code": "",
    "delivery_distance": "",
    "packing_charge": 64.6,
    "packing_charge_calculation": 0,
    "description": "",
    "bill_paid": 0,
    "gst_no": "",
    "customer_locality": "",
    "tip": 0,
    "created_date": "2022-06-15",
    "extra_data": "{\"packing_charge_user_input\":64.6,\"delivery_charge_user_input\":0,\"service_charge\":0,\"s_c_user_input\":0,\"s_c_calcualtion\":\"1\",\"print_split_bill\":\"\",\"g_id\":\"7,8\",\"g_name\":\"Food, Sandwich\",\"currency_amount\":\"\",\"currency_to\":\"\",\"fa_name\":\"biller\",\"fa_type\":1,\"fa_phone\":\"\",\"area_name\":\"Garden 2\",\"s_o_name\":\"Garden 2\",\"s_ver\":\"99.0.3\",\"c_ver\":\"\",\"t_a_time\":0}",
    "from_where": 2,
    "old_total": null,
    "delivery_status": 10,
    "final_invoice": "127",
    "pending_order_user_id": 0,
    "client_identifier": "",
    "counter_name": "Captain",
    "advance_order_flag": 0,
    "advance_order_date": "",
    "sub_order_type_id": 4,
    "service_charge": 0
  },
  "items_data": [
    {
      "id": 2954448,
      "order_id": 994405,
      "item_id": 89717,
      "restaurant_id": 251,
      "type": 1,
      "quantity": 2,
      "price": 70,
      "total": 140,
      "name": "Vegetable Sandwich",
      "unit": "",
      "fixed_per": null,
      "created": "2022-06-15 18:17:08",
      "modified": "2022-06-15 18:17:08",
      "changed": 0,
      "old_item_id": 89717,
      "web_id": 0,
      "special_notes": "Less Spicy",
      "group_category_id": 8,
      "category_wise_taxes": "152,123,122",
      "discount_id": 46,
      "discount_total": 14,
      "discount_details": "{\"id\":46,\"title\":\"Percentage\",\"type\":1,\"core_or_total\":2,\"price\":10,\"order_type\":\"1,3\",\"max_allowed_discount\":\"\",\"lower_limit_total\":\"\",\"upper_limit_total\":\"\",\"applicable_on\":1,\"category_item_ids\":\"303,304,305,...\",\"get_applicable_on\":-1,\"get_category_item_ids\":\"\",\"deal_type\":1,\"extra_info\":\"\",\"from_time\":\"\",\"to_time\":\"\",\"ignore_taxes\":\"0\",\"ignore_discounts\":\"0\",\"hsn_code\":\"12345\",\"is_consumed\":\"1\",\"nc_flag\":\"0\",\"nc_flag_d\":{},\"is_treat_item\":0,\"is_open_item\":0,\"is_combo_item\":0,\"desc\":\"\",\"e_desc\":\"\",\"bogo_id\":0,\"bogo_price\":0,\"tax\":{\"122\":3.15,\"123\":3.15,\"152\":12.6},\"tax_i\":{\"122\":3.46,\"123\":3.46,\"152\":12.6},\"total_tax_i\":19.52}",
      "addons": "",
      "packing_charge": 0,
      "original_price": 70,
      "total_discount": 14,
      "total_tax": 18.9,
      "item_extra_data": "{\"i_s_name\":\"34\",\"sap\":\"127853as\",\"c_id\":333,\"c_name\":\"PLAIN SANDWICHES\",\"v_id\":0,\"v_name\":\"\",\"g_name\":\"Sandwich\",\"i_ho\":\"\",\"c_ho\":\"\",\"v_ho\":\"\",\"p_id\":0,\"comm_type\":\"12%\",\"commission\":\"16.80\"}"
    },
    {
      "id": 2954449,
      "order_id": 994405,
      "item_id": 89910,
      "restaurant_id": 251,
      "type": 1,
      "quantity": 1,
      "price": 160,
      "total": 160,
      "name": "Paneer Pizza (Small)",
      "unit": "",
      "fixed_per": null,
      "created": "2022-06-15 18:17:08",
      "modified": "2022-06-15 18:17:08",
      "changed": 0,
      "old_item_id": 89910,
      "web_id": 0,
      "special_notes": "",
      "group_category_id": 7,
      "category_wise_taxes": "152,123,122",
      "discount_id": 0,
      "discount_total": 0,
      "discount_details": "{\"ignore_taxes\":\"0\",\"ignore_discounts\":\"0\",\"hsn_code\":\"\",\"is_consumed\":\"1\",\"nc_flag\":\"0\",\"nc_flag_d\":{},\"is_treat_item\":0,\"is_open_item\":0,\"is_combo_item\":0,\"desc\":\"\",\"e_desc\":\"\",\"bogo_id\":0,\"bogo_price\":0,\"tax\":{\"122\":4,\"123\":4,\"152\":16},\"tax_i\":{\"122\":4.4,\"123\":4.4,\"152\":16},\"total_tax_i\":24.8}",
      "addons": "[{\"id\":\"13\",\"name\":\"Cheese Burst\",\"group_name\":\"Base\",\"group_id\":\"4\",\"price\":50,\"quantity\":\"1\",\"sap_code\":\"\"}]",
      "packing_charge": 0,
      "original_price": 160,
      "total_discount": 0,
      "total_tax": 24,
      "item_extra_data": "{\"i_s_name\":\"1p\",\"sap\":\"\",\"c_id\":329,\"c_name\":\"PIZZA-CHOICE'S REGULAR\",\"v_id\":12,\"v_name\":\"Small\",\"g_name\":\"Food\",\"i_ho\":\"\",\"c_ho\":\"\",\"v_ho\":\"\",\"p_id\":89908}"
    },
    {
      "id": 2954450,
      "order_id": 994405,
      "item_id": 89916,
      "restaurant_id": 251,
      "type": 1,
      "quantity": 1,
      "price": 360,
      "total": 360,
      "name": "Panner Regular Pizza",
      "unit": "645",
      "fixed_per": null,
      "created": "2022-06-15 18:17:08",
      "modified": "2022-06-15 18:17:08",
      "changed": 0,
      "old_item_id": 89916,
      "web_id": 0,
      "special_notes": "",
      "group_category_id": 7,
      "category_wise_taxes": "152,123,122",
      "discount_id": 0,
      "discount_total": 0,
      "discount_details": "{\"ignore_taxes\":\"0\",\"ignore_discounts\":\"0\",\"hsn_code\":\"\",\"is_consumed\":\"1\",\"nc_flag\":\"0\",\"nc_flag_d\":{},\"is_treat_item\":0,\"is_open_item\":0,\"is_combo_item\":0,\"desc\":\"\",\"e_desc\":\"\",\"bogo_id\":0,\"bogo_price\":0,\"tax\":{\"122\":9,\"123\":9,\"152\":36},\"tax_i\":{\"122\":9.9,\"123\":9.9,\"152\":36},\"total_tax_i\":55.8}",
      "addons": "[{\"id\":\"15\",\"name\":\"Olives\",\"group_name\":\"Toppings123\",\"group_id\":\"5\",\"price\":30,\"quantity\":\"1\",\"sap_code\":\"\"},{\"id\":\"16\",\"name\":\"Red Pepper\",\"group_name\":\"Toppings123\",\"group_id\":\"5\",\"price\":30,\"quantity\":\"1\",\"sap_code\":\"\"},{\"id\":\"13\",\"name\":\"Cheese Burst\",\"group_name\":\"Base\",\"group_id\":\"4\",\"price\":50,\"quantity\":\"1\",\"sap_code\":\"\"}]",
      "packing_charge": 20,
      "original_price": 360,
      "total_discount": 0,
      "total_tax": 54,
      "item_extra_data": "{\"i_s_name\":\"3p\",\"sap\":\"\",\"c_id\":329,\"c_name\":\"PIZZA-CHOICE'S REGULAR\",\"v_id\":0,\"v_name\":\"\",\"g_name\":\"Food\",\"i_ho\":\"\",\"c_ho\":\"\",\"v_ho\":\"\",\"p_id\":0}"
    },
    {
      "id": 2954451,
      "order_id": 994405,
      "item_id": 152,
      "restaurant_id": 251,
      "type": 5,
      "quantity": 2,
      "price": 10,
      "total": 64.6,
      "name": "Service Charge",
      "unit": "",
      "fixed_per": 1,
      "created": "2022-06-15 18:17:08",
      "modified": "2022-06-15 18:17:08",
      "changed": 0,
      "old_item_id": 0,
      "web_id": 0,
      "special_notes": "1",
      "group_category_id": 0,
      "category_wise_taxes": "0",
      "discount_id": 0,
      "discount_total": 646,
      "discount_details": "",
      "addons": null,
      "packing_charge": 0,
      "original_price": null,
      "total_discount": null,
      "total_tax": 0,
      "item_extra_data": null
    },
    {
      "id": 2954452,
      "order_id": 994405,
      "item_id": 123,
      "restaurant_id": 251,
      "type": 5,
      "quantity": 2,
      "price": 2.5,
      "total": 19.38,
      "name": "SGST@2.5",
      "unit": "",
      "fixed_per": 1,
      "created": "2022-06-15 18:17:08",
      "modified": "2022-06-15 18:17:08",
      "changed": 0,
      "old_item_id": 0,
      "web_id": 0,
      "special_notes": "0",
      "group_category_id": 0,
      "category_wise_taxes": "0",
      "discount_id": 0,
      "discount_total": 775.2,
      "discount_details": "",
      "addons": null,
      "packing_charge": 0,
      "original_price": null,
      "total_discount": null,
      "total_tax": 0,
      "item_extra_data": null
    },
    {
      "id": 2954453,
      "order_id": 994405,
      "item_id": 122,
      "restaurant_id": 251,
      "type": 5,
      "quantity": 2,
      "price": 2.5,
      "total": 19.38,
      "name": "CGST@2.5",
      "unit": "",
      "fixed_per": 1,
      "created": "2022-06-15 18:17:08",
      "modified": "2022-06-15 18:17:08",
      "changed": 0,
      "old_item_id": 0,
      "web_id": 0,
      "special_notes": "0",
      "group_category_id": 0,
      "category_wise_taxes": "0",
      "discount_id": 0,
      "discount_total": 775.2,
      "discount_details": "",
      "addons": null,
      "packing_charge": 0,
      "original_price": null,
      "total_discount": null,
      "total_tax": 0,
      "item_extra_data": null
    }
  ]
}
```

#### Response Fields

| Field        | Type   | Description                                                         |
| ------------ | ------ | ------------------------------------------------------------------- |
| `success`    | string | API response status                                                 |
| `message`    | string | API response message                                                |
| `order_data` | object | Order-level summary: totals, discounts, taxes, customer info, etc.  |
| `items_data` | array  | Per-item breakdown including discounts, taxes, and addon details    |

**Key `order_data` fields:**

| Field          | Description                          |
| -------------- | ------------------------------------ |
| `core_price`   | Subtotal before discounts and taxes  |
| `discount`     | Total discount applied               |
| `tax`          | Total tax applied                    |
| `total`        | Final total (rounded)                |
| `packing_charge` | Packing charge applied             |
| `roundoff`     | Rounding adjustment (e.g. `"+0.04"`) |
| `bill_paid`    | `0` = unpaid, `1` = paid             |
| `table_no`     | Table number                         |
| `extra_data`   | JSON-encoded supplemental data       |

**Key `items_data[]` fields:**

| Field              | Description                                                                   |
| ------------------ | ----------------------------------------------------------------------------- |
| `item_id`          | POS item ID                                                                   |
| `type`             | `1` = regular item, `5` = charge/tax line (e.g. service charge, GST)         |
| `name`             | Item or charge name                                                           |
| `quantity`         | Quantity                                                                      |
| `price`            | Unit price                                                                    |
| `total`            | Line total                                                                    |
| `special_notes`    | Kitchen notes for the item                                                    |
| `discount_total`   | Discount applied to this line                                                 |
| `total_tax`        | Tax applied to this line                                                      |
| `addons`           | JSON-encoded string of addons applied (or `""`)                               |
| `discount_details` | JSON-encoded string with full discount breakdown                              |
| `item_extra_data`  | JSON-encoded string with supplemental item metadata                           |
| `packing_charge`   | Packing charge for this line item                                             |

---

## 9. Success Payment

Notify the POS that payment has been collected externally. This marks the bill as paid in the POS system.

**Staging Endpoint:**
```
POST http://52.76.48.26:4524/petpoojabilling_api/V1/captainorders/success_payment/
```

### Request

```json
{
  "app_key": "xxx",
  "app_secret": "xxx",
  "access_token": "xxx",
  "restID": "xxxxxx",
  "bill_request_id": "xxxxxx",
  "amount_paid": "xxxx",
  "pin": "xxxx"
}
```

| Field             | Type   | Required | Description                                              |
| ----------------- | ------ | -------- | -------------------------------------------------------- |
| `app_key`         | string | yes      | See [auth fields](#authentication-fields)                |
| `app_secret`      | string | yes      | See [auth fields](#authentication-fields)                |
| `access_token`    | string | yes      | See [auth fields](#authentication-fields)                |
| `restID`          | string | yes      | Unique mapped ID for third-party restaurant              |
| `bill_request_id` | string | yes      | Bill request ID from [Check Bill](#7-check-bill) or [Request Bill](#6-request-bill) |
| `amount_paid`     | number | yes      | Amount paid by customer                                  |
| `pin`             | string | yes      | Customer phone number (used as PIN)                      |

### Response — 200 OK

```json
{
  "success": "1"
}
```

| Field     | Type   | Description          |
| --------- | ------ | -------------------- |
| `success` | string | API response status  |
| `message` | string | API response message |

---

## Billing Flow

The bill request flow has two paths depending on what [Request Bill](#6-request-bill) returns:

```
POST /request_bill
        |
        ├── returns `bill_request_id` ──────────────────────────────────────┐
        │                                                                    ↓
        └── returns `request_id`                                    POST /get_bill
                    |
                    ↓
            POST /check_bill  (poll every ≥5 seconds)
                    |
                    ├── bill_request_id = "0"   → not ready yet, retry
                    ├── bill_request_id = "-1"  → error / no active table, stop
                    └── bill_request_id > "0"   ────────────────────────────┘
                                                                    ↓
                                                            POST /get_bill
                                                                    |
                                                                    ↓
                                                        (optional) POST /success_payment
```

**Summary of `bill_request_id` values from Check Bill:**

| Value    | Meaning                                       | Action                           |
| -------- | --------------------------------------------- | -------------------------------- |
| `"0"`    | Bill not generated yet                        | Wait ≥5 seconds and retry        |
| `"-1"`   | Error — no active KOTs/table found            | Stop, show error to customer     |
| `> "0"`  | Bill ready                                    | Call Get Bill with this ID       |
