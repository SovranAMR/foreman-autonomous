const fs = require('fs');
const content = fs.readFileSync('src/tools.ts', 'utf-8');
const match = content.match(/name:\s*"([^"]+)"/g);
console.log(match ? match.length : 0);
