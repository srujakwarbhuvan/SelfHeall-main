import fs from 'fs';
import path from 'path';

const filesToDelete = [
    'src/storage/healHistory.js',
    'data/heals.db',
    'data/heals.db-shm',
    'data/heals.db-wal',
    'data/selfheal.db',
    'data/selfheal.db-shm',
    'data/selfheal.db-wal'
];

filesToDelete.forEach(f => {
    try {
        if (fs.existsSync(f)) {
            fs.unlinkSync(f);
            console.log(`Deleted: ${f}`);
        }
    } catch (err) {
        console.error(`Failed to delete ${f}: ${err.message}`);
    }
});
