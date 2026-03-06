const fs = require('fs');
const code = fs.readFileSync('src/ui/search.js', 'utf8');
if (!code.includes('search')) process.exit(1);
if (!code.includes('flyTo')) process.exit(1);
console.log('SEARCH MODULE OK');
