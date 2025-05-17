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
  const { movedItemId, itemBeforeId, itemAfterId } = req.body;

  if (typeof movedItemId !== 'number') {
    return res.status(400).json({ message: "Invalid request body: movedItemId must be a number." });
  }
  if (itemBeforeId !== null && typeof itemBeforeId !== 'number') {
    return res.status(400).json({ message: "Invalid request body: itemBeforeId must be a number or null." });
  }
  if (itemAfterId !== null && typeof itemAfterId !== 'number') {
    return res.status(400).json({ message: "Invalid request body: itemAfterId must be a number or null." });
  }

  if (!currentItemIdsSet.has(movedItemId)) {
    return res.status(400).json({ message: "movedItemId does not exist." });
  }
  if (itemBeforeId !== null && !currentItemIdsSet.has(itemBeforeId)) {
    return res.status(400).json({ message: "itemBeforeId does not exist." });
  }
  if (itemAfterId !== null && !currentItemIdsSet.has(itemAfterId)) {
    return res.status(400).json({ message: "itemAfterId does not exist." });
  }
  if (itemBeforeId === movedItemId && itemBeforeId !== null) {
    return res.status(400).json({ message: "itemBeforeId cannot be the same as movedItemId." });
  }
  if (itemAfterId === movedItemId && itemAfterId !== null) {
    return res.status(400).json({ message: "itemAfterId cannot be the same as movedItemId." });
  }

  let tempOrder = itemOrder.filter(id => id !== movedItemId);

  if (itemAfterId !== null) {
    const targetIndex = tempOrder.indexOf(itemAfterId);
    if (targetIndex !== -1) {
      tempOrder.splice(targetIndex, 0, movedItemId);
    } else {
      console.warn(`itemAfterId (${itemAfterId}) not found in tempOrder. movedItemId (${movedItemId}) will be appended.`);
      tempOrder.push(movedItemId);
    }
  } else if (itemBeforeId !== null) {
    const targetIndex = tempOrder.indexOf(itemBeforeId);
    if (targetIndex !== -1) {
      tempOrder.splice(targetIndex + 1, 0, movedItemId);
    } else {
      console.warn(`itemBeforeId (${itemBeforeId}) not found in tempOrder. movedItemId (${movedItemId}) will be prepended.`);
      tempOrder.unshift(movedItemId); 
    }
  } else {
    tempOrder.unshift(movedItemId);
  }

  itemOrder = tempOrder;

  validOrderedIds = [...itemOrder];
  const allItemIdsInUpdatedOrder = new Set(itemOrder);
  remainingItems = items 
    .filter((item) => !allItemIdsInUpdatedOrder.has(item.id))
    .map((item) => item.id);
  effectiveItemOrder = [...validOrderedIds, ...remainingItems];

  return res.status(200).json({ message: "Order updated successfully" });
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
