const path = require('path');
// require('dotenv').config({ path: path.resolve(__dirname, '../../.env') }); 

const express = require('express');
const serverless = require('serverless-http');
const cors = require('cors');
const fs = require('fs');

const app = express();

app.use(cors());
app.use(express.json());

let items = [];
let selectedItemIds = new Set();
let itemOrder = [];

const ITEMS_FILE_PATH = path.join(__dirname, 'items.json'); 
const ITEMS_PER_PAGE = 20;

try {
    if (fs.existsSync(ITEMS_FILE_PATH)) {
        const fileData = fs.readFileSync(ITEMS_FILE_PATH, 'utf-8');
        const parsedData = JSON.parse(fileData);
        if (Array.isArray(parsedData)) {
            items = parsedData;
        } else if (parsedData && Array.isArray(parsedData.items)) {
            items = parsedData.items;
        }
        itemOrder = items.map(item => item.id);
        console.log(`Successfully loaded ${items.length} items from ${ITEMS_FILE_PATH}`);
    } else {
        console.warn(`Items file not found at ${ITEMS_FILE_PATH}. Starting with empty items array.`);
        items = []; 
        itemOrder = [];
    }
} catch (error) {
    console.error(`Error loading or parsing items from ${ITEMS_FILE_PATH}:`, error);
    items = []; // Fallback to empty array on error
    itemOrder = [];
}

const router = express.Router();

// Get items with pagination, search, order
router.get('/items', (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || ITEMS_PER_PAGE;
    const search = req.query.search ? req.query.search.toLowerCase() : '';

    let currentItemMap = new Map(items.map(item => [item.id, item]));
    let validOrderedIds = itemOrder.filter(id => currentItemMap.has(id));
    
    const orderedIdSet = new Set(validOrderedIds);
    const remainingItems = items.filter(item => !orderedIdSet.has(item.id)).map(item => item.id);
    let effectiveItemOrder = [...validOrderedIds, ...remainingItems];

    let resultItems = effectiveItemOrder.map(id => currentItemMap.get(id)).filter(Boolean);

    if (search) {
        resultItems = resultItems.filter(item => item.name && item.name.toLowerCase().includes(search));
    }

    const startIndex = (page - 1) * limit;
    const endIndex = page * limit;

    const paginatedItems = resultItems.slice(startIndex, endIndex);
    const totalFilteredItems = resultItems.length;

    res.json({
        items: paginatedItems.map(item => ({ 
            id: item.id, 
            value: item.name,
            isSelected: selectedItemIds.has(item.id) 
        })),
        totalPages: Math.ceil(totalFilteredItems / limit),
        currentPage: page,
        totalItems: totalFilteredItems,
    });
});

// Update item order
router.post('/items/order', (req, res) => {
    const { newOrder } = req.body; 
    if (Array.isArray(newOrder)) {
        const currentItemIdsSet = new Set(items.map(item => item.id));
        const newOrderIsValid = newOrder.every(id => currentItemIdsSet.has(id));

        if (newOrderIsValid) {
            const newOrderSet = new Set(newOrder);
            const remainingItemIds = itemOrder.filter(id => currentItemIdsSet.has(id) && !newOrderSet.has(id));
            itemOrder = [...newOrder, ...remainingItemIds];
            return res.status(200).json({ message: 'Order updated successfully' });
        }
        return res.status(400).json({ message: 'Invalid order data provided or item IDs do not exist' });
    }
    return res.status(400).json({ message: 'Invalid request body: newOrder must be an array' });
});

// Update item selection
router.post('/items/selection', (req, res) => {
    const { selectedIds } = req.body; 
    if (Array.isArray(selectedIds)) {
        selectedItemIds = new Set(selectedIds.filter(id => items.find(item => item.id === id)));
        return res.status(200).json({ message: 'Selection updated successfully' });
    }
    return res.status(400).json({ message: 'Invalid request body: selectedIds must be an array' });
});

// Get current selection and order
router.get('/items/state', (req, res) => {
    res.json({
        selectedItemIds: Array.from(selectedItemIds),
        itemOrder: itemOrder.slice(0, ITEMS_PER_PAGE) 
    });
});

app.use('/api', router);

module.exports.handler = serverless(app); 