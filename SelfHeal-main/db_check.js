import Database from 'better-sqlite3';
import path from 'path';

try {
    const dbHeals = new Database('data/heals.db');
    console.log('--- heals.db ---');
    const infoHeals = dbHeals.prepare('PRAGMA table_info(heals)').all();
    infoHeals.forEach(c => console.log(`Column: ${c.name}`));

    const dbSelfHeal = new Database('data/selfheal.db');
    console.log('--- selfheal.db ---');
    const infoSelfHeal = dbSelfHeal.prepare('PRAGMA table_info(heals)').all();
    infoSelfHeal.forEach(c => console.log(`Column: ${c.name}`));
} catch (err) {
    console.error(err);
}
