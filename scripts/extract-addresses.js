const fs = require('fs');

const content = fs.readFileSync('profile.html', 'utf8');
const regex = /0x[a-fA-F0-9]{40}/g;
const matches = content.match(regex);

if (matches) {
    const uniqueMatches = [...new Set(matches)];
    console.log('Found addresses:');
    uniqueMatches.forEach(addr => console.log(addr));
} else {
    console.log('No addresses found.');
}
