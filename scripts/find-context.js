const fs = require('fs');

const content = fs.readFileSync('profile.html', 'utf8');
const search = 'livebreathevolatility';
const index = content.indexOf(search);

if (index !== -1) {
    const start = Math.max(0, index - 500);
    const end = Math.min(content.length, index + 500);
    console.log('Context around username:');
    console.log(content.substring(start, end));
} else {
    console.log('Username not found in HTML.');
}
