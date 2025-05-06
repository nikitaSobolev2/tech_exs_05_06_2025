const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());

// Load items from JSON file
let items = [];
let selectedItemIds = new Set();
let itemOrder = [];

const ITEMS_FILE_PATH = path.join(__dirname, 'items.json');
const ITEMS_PER_PAGE = 20;

try {
    const fileData = fs.readFileSync(ITEMS_FILE_PATH, 'utf-8');

    items = JSON.parse(fileData);
    itemOrder = items.map(item => item.id);

    console.log(`Successfully loaded ${items.length} items from ${ITEMS_FILE_PATH}`);
} catch (error) {
    console.error(`Error loading items from ${ITEMS_FILE_PATH}:`, error);
}



// Get items with pagination, search, order
app.get('/api/items', (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || ITEMS_PER_PAGE;
    const search = req.query.search ? req.query.search.toLowerCase() : '';

    let currentItemMap = new Map(items.map(item => [item.id, item]));
    let validOrderedIds = itemOrder.filter(id => currentItemMap.has(id));
    
    // If itemOrder has missing items, append remaining items not in itemOrder
    const orderedIdSet = new Set(validOrderedIds);
    const remainingItems = items.filter(item => !orderedIdSet.has(item.id)).map(item => item.id);
    let effectiveItemOrder = [...validOrderedIds, ...remainingItems];

    let resultItems = effectiveItemOrder.map(id => currentItemMap.get(id)).filter(Boolean);

    if (search) {
        resultItems = resultItems.filter(item => item.name.toLowerCase().includes(search));
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
        totalItems: totalFilteredItems
    });
});

// Update item order
app.post('/api/items/order', (req, res) => {
    const { newOrder } = req.body; // Expects an array of item IDs
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
app.post('/api/items/selection', (req, res) => {
    const { selectedIds } = req.body; // Expects an array of item IDs

    if (Array.isArray(selectedIds)) {
        selectedItemIds = new Set(selectedIds.filter(id => items.find(item => item.id === id))); // Ensure selected IDs exist

        return res.status(200).json({ message: 'Selection updated successfully' });
    }


    return res.status(400).json({ message: 'Invalid request body: selectedIds must be an array' });
});

// Get current selection and order
app.get('/api/items/state', (req, res) => {
    res.json({
        selectedItemIds: Array.from(selectedItemIds),
        itemOrder: itemOrder.slice(0, ITEMS_PER_PAGE)
    });
});


app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
}); 