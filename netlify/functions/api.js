const path = require("path");
// require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const express = require("express");
const serverless = require("serverless-http");
const cors = require("cors");
const fs = require("fs");

const app = express();

app.use(cors());
app.use(express.json());

let items = [];
let selectedItemIds = new Set();
let itemOrder = [];
let currentItemMap = new Map();
let currentItemIdsSet = new Set();
let itemIdSet = new Set();
let validOrderedIds = [];
let remainingItems = [];
let effectiveItemOrder = [];

const ITEMS_FILE_PATH = path.join(__dirname, "items.json");
const ITEMS_PER_PAGE = 20;

try {
  if (fs.existsSync(ITEMS_FILE_PATH)) {
    const fileData = fs.readFileSync(ITEMS_FILE_PATH, "utf-8");
    const parsedData = JSON.parse(fileData);

    if (Array.isArray(parsedData)) {
      items = parsedData;
    } else if (parsedData && Array.isArray(parsedData.items)) {
      items = parsedData.items;
    }

    itemOrder = items.map((item) => item.id);
    currentItemMap = new Map(items.map((item) => [item.id, item]));
    currentItemIdsSet = new Set(items.map((item) => item.id));
    itemIdSet = new Set(items.map((item) => item.id));
    validOrderedIds = itemOrder.filter((id) => itemIdSet.has(id));
    const validOrderedIdSet = new Set(validOrderedIds);

    remainingItems = items
      .filter((item) => !validOrderedIdSet.has(item.id))
      .map((item) => item.id);
    effectiveItemOrder = [...validOrderedIds, ...remainingItems];

    console.log(
      `Successfully loaded ${items.length} items from ${ITEMS_FILE_PATH}`
    );
  } else {
    console.warn(
      `Items file not found at ${ITEMS_FILE_PATH}. Starting with empty items array.`
    );
    items = [];
    itemOrder = [];
  }
} catch (error) {
  console.error(
    `Error loading or parsing items from ${ITEMS_FILE_PATH}:`,
    error
  );
  items = []; // Fallback to empty array on error
  itemOrder = [];
  currentItemMap = new Map();
}

const router = express.Router();

// Get items with pagination, search, order
router.get("/items", (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || ITEMS_PER_PAGE;
  const search = req.query.search ? req.query.search.toLowerCase() : "";

  let resultIds = effectiveItemOrder;
  if (search) {
    resultIds = resultIds.filter((id) => {
      const item = currentItemMap.get(id);
      return item && item.name && item.name.toLowerCase().includes(search);
    });
  }

  const totalFilteredItems = resultIds.length;
  const startIndex = (page - 1) * limit;
  const endIndex = page * limit;
  const paginatedIds = resultIds.slice(startIndex, endIndex);

  const paginatedItems = paginatedIds.map((id) => {
    const item = currentItemMap.get(id);
    return {
      id: item.id,
      value: item.name,
      isSelected: selectedItemIds.has(item.id),
    };
  });

  res.json({
    items: paginatedItems,
    totalPages: Math.ceil(totalFilteredItems / limit),
    currentPage: page,
    totalItems: totalFilteredItems,
  });
});

// Update item order
router.post("/items/order", (req, res) => {
  const { newOrder } = req.body;
  if (Array.isArray(newOrder)) {
    const newOrderIsValid = newOrder.every((id) => currentItemIdsSet.has(id));

    if (newOrderIsValid) {
      // Integrate reordered subset into global order
      const itemsToReorderSet = new Set(newOrder);
      const updatedGlobalOrder = [];
      const subOrderItemsIterator = newOrder[Symbol.iterator]();

      for (const currentItemId of itemOrder) {
        if (itemsToReorderSet.has(currentItemId)) {
          const nextItemFromSubOrder = subOrderItemsIterator.next();
          if (!nextItemFromSubOrder.done) {
            updatedGlobalOrder.push(nextItemFromSubOrder.value);
          } else {
            // Fallback: should not happen
            updatedGlobalOrder.push(currentItemId);
          }
        } else {
          updatedGlobalOrder.push(currentItemId);
        }
      }
      itemOrder = updatedGlobalOrder;

      // Update cached order arrays
      validOrderedIds = [...itemOrder];
      const allItemIdsInUpdatedOrder = new Set(itemOrder);
      remainingItems = items
        .filter((item) => !allItemIdsInUpdatedOrder.has(item.id))
        .map((item) => item.id);
      effectiveItemOrder = [...validOrderedIds, ...remainingItems];

      return res.status(200).json({ message: "Order updated successfully" });
    }
    return res
      .status(400)
      .json({
        message: "Invalid order data provided or item IDs do not exist",
      });
  }
  return res
    .status(400)
    .json({ message: "Invalid request body: newOrder must be an array" });
});

// Update item selection
router.post("/items/selection", (req, res) => {
  const { selectedIds } = req.body;

  if (Array.isArray(selectedIds)) {
    selectedItemIds = new Set(
      selectedIds.filter((id) => currentItemIdsSet.has(id))
    );

    return res.status(200).json({ message: "Selection updated successfully" });
  }

  return res
    .status(400)
    .json({ message: "Invalid request body: selectedIds must be an array" });
});

// Get current selection and order
router.get("/items/state", (req, res) => {
  res.json({
    selectedItemIds: Array.from(selectedItemIds),
    itemOrder: itemOrder.slice(0, ITEMS_PER_PAGE),
  });
});

app.use("/api", router);

module.exports.handler = serverless(app);
