const fs = require('fs');
const content = fs.readFileSync('src/tools.ts', 'utf-8');
const toolDefs = content.split('export const TOOL_DEFINITIONS')[1];
const braceMatches = toolDefs.match(/name:\s*"([^"]+)"/g);
console.log(braceMatches.length, "Total name properties inside TOOL_DEFINITIONS");
