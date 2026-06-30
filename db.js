// db.js — minimal file-based "database" layer (reads/writes JSON on disk).
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');

function load(name) {
  const file = path.join(DATA_DIR, `${name}.json`);
  if (!fs.existsSync(file)) return [];
  return JSON.parse(fs.readFileSync(file, 'utf-8'));
}

function save(name, data) {
  const file = path.join(DATA_DIR, `${name}.json`);
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

module.exports = { load, save };
