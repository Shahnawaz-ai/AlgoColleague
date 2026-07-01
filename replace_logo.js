const fs = require('fs');
const path = require('path');

const dir = 'C:\\Users\\Dell\\.gemini\\antigravity-ide\\scratch\\algo-colleague\\public';
const extAllowed = ['.html'];

const newLogo = `<svg viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect width="36" height="36" rx="9" fill="url(#ac-grad)"/>
  <path d="M7 18h5l3.5-7 5 14 3.5-7h5" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" opacity="0.95"/>
  <circle cx="7" cy="18" r="2" fill="white"/>
  <circle cx="29" cy="18" r="2" fill="white"/>
  <defs>
    <linearGradient id="ac-grad" x1="0" y1="0" x2="36" y2="36">
      <stop stop-color="#3b82f6"/><stop offset="1" stop-color="#06b6d4"/>
    </linearGradient>
  </defs>
</svg>`;

function walkDir(currentPath) {
    const files = fs.readdirSync(currentPath);
    for (let file of files) {
        if (file === 'node_modules' || file === '.git' || file === 'data') continue;
        
        const fullPath = path.join(currentPath, file);
        const stat = fs.statSync(fullPath);
        
        if (stat.isDirectory()) {
            walkDir(fullPath);
        } else if (extAllowed.includes(path.extname(fullPath))) {
            let content = fs.readFileSync(fullPath, 'utf8');
            
            // Regex to find the old SVG. It matches <svg viewBox="0 0 36 36"... up to </svg>
            const svgRegex = /<svg viewBox="0 0 36 36" fill="none" xmlns="http:\/\/www\.w3\.org\/2000\/svg">[\s\S]*?<\/svg>/g;
            
            if (content.match(svgRegex)) {
                content = content.replace(svgRegex, newLogo);
                fs.writeFileSync(fullPath, content, 'utf8');
                console.log('Replaced logo in: ' + fullPath);
            }
        }
    }
}

walkDir(dir);
console.log('Logo replacement complete.');
