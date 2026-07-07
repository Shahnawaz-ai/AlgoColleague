const fs = require('fs');
const path = require('path');

const routesDir = path.join(__dirname, 'server', 'routes');
const files = fs.readdirSync(routesDir).filter(f => f.endsWith('.js'));

for (const file of files) {
  const filePath = path.join(routesDir, file);
  let content = fs.readFileSync(filePath, 'utf-8');

  // 1. Update require
  content = content.replace(
    /const \{ prepare(.*?) \} = require\('\.\.\/db'\);/,
    "const { dbGet, dbAll, dbRun$1 } = require('../db');"
  );
  content = content.replace(
    /const \{ logActivity, prepare(.*?) \} = require\('\.\.\/db'\);/,
    "const { logActivity, dbGet, dbAll, dbRun$1 } = require('../db');"
  );
  content = content.replace(
    /const \{ prepare(.*?), logActivity \} = require\('\.\.\/db'\);/,
    "const { dbGet, dbAll, dbRun$1, logActivity } = require('../db');"
  );

  // 2. Make all router callbacks async
  content = content.replace(/router\.(get|post|put|delete)\(\s*(['`"].*?['`"])\s*,\s*(?:\(.*?,.*?,.*?\) => {|\(.*?,.*?\) => {|req => {|res => {|\(\) => {|(req, res) => {)/g, (match, p1, p2) => {
    return match.replace(/=>/, '=>').replace(/\(\s*req\s*,\s*res\s*\)/, 'async (req, res)').replace(/\(\s*req\s*,\s*res\s*,\s*next\s*\)/, 'async (req, res, next)');
  });
  // Fallback regex for router callbacks
  content = content.replace(/router\.(get|post|put|delete)\(([^,]+),\s*\(/g, "router.$1($2, async (");
  content = content.replace(/async async/g, "async");

  // 3. Replace prepare(X).get(Y) with await dbGet(X, Y)
  // We use a custom replacer to handle arguments correctly
  content = content.replace(/prepare\(([\s\S]*?)\)\.get\(([\s\S]*?)\)/g, (match, query, args) => {
    return args.trim() ? `await dbGet(${query}, ${args})` : `await dbGet(${query})`;
  });

  // 4. Replace prepare(X).all(Y) with await dbAll(X, Y)
  content = content.replace(/prepare\(([\s\S]*?)\)\.all\(([\s\S]*?)\)/g, (match, query, args) => {
    return args.trim() ? `await dbAll(${query}, ${args})` : `await dbAll(${query})`;
  });

  // 5. Replace prepare(X).run(Y) with await dbRun(X, Y)
  content = content.replace(/prepare\(([\s\S]*?)\)\.run\(([\s\S]*?)\)/g, (match, query, args) => {
    return args.trim() ? `await dbRun(${query}, ${args})` : `await dbRun(${query})`;
  });

  // 6. Fix try/catch errors that might arise with await (they're fine)

  fs.writeFileSync(filePath, content, 'utf-8');
  console.log(`Updated ${file}`);
}
