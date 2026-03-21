const names = require('./bebek-isim-app/data.json');

let validNames = names.filter(n => n.gender === 'F' || n.gender === 'U');
const ratedIds = validNames.map(n => n.id);

// If user rates ALL names...
// Wait, what if they rate everything negatively?
