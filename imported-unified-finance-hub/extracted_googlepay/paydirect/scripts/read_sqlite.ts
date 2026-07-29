import sqlite3 from 'sqlite3';
import path from 'path';

const dbPath = path.resolve('sovereigns_interbank_vault.db');
console.log('Opening database:', dbPath);

const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY, (err) => {
  if (err) {
    console.error('Failed to open database:', err.message);
    return;
  }
  
  db.all("SELECT name FROM sqlite_master WHERE type='table'", [], (err, tables: any[]) => {
    if (err) {
      console.error('Failed to query tables:', err.message);
      return;
    }
    
    console.log('Tables in database:', tables.map(t => t.name));
    
    tables.forEach((table) => {
      db.all(`SELECT * FROM ${table.name}`, [], (err, rows) => {
        if (err) {
          console.error(`Failed to query table ${table.name}:`, err.message);
          return;
        }
        console.log(`\n--- Rows in ${table.name} (${rows.length} total) ---`);
        console.log(JSON.stringify(rows.slice(0, 100), null, 2));
      });
    });
  });
});
