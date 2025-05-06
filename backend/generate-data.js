const fs = require('fs');
const path = require('path');

const NUM_ITEMS = 1000000;
const FILE_PATH = path.join(__dirname, 'items.json');

console.log(`Generating ${NUM_ITEMS} items...`);

const stream = fs.createWriteStream(FILE_PATH);

stream.on('error', (err) => {
    console.error('Error writing to file:', err);
});

stream.write('[\n');

for (let i = 0; i < NUM_ITEMS; i++) {
    const item = {
        id: i + 1,
        name: `Item ${i + 1}`
    };

    stream.write(JSON.stringify(item));
    
    if (i < NUM_ITEMS - 1) {
        stream.write(',\n');
    } else {
        stream.write('\n');
    }
}

stream.write(']\n');

stream.end(() => {
    console.log(`Successfully generated ${FILE_PATH}`);
}); 