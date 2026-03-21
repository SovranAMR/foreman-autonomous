import fs from 'fs';
const names = JSON.parse(fs.readFileSync('./bebek-isim-app/data.json'));

// what if ratings is such that score calculation fails?
