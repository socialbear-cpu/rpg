const fs = require('fs');
const scan = JSON.parse(fs.readFileSync('.ua/intermediate/scan-result.json', 'utf8'));
const input = { projectRoot: process.cwd(), filePaths: scan.files.map(f => f.path), gitCommitHash: '2430ef737a9202e53bf237a5b45a2e4db05ccd41' };
fs.writeFileSync('.ua/intermediate/fingerprint-input.json', JSON.stringify(input, null, 2));
console.log(`Fingerprint input prepared for ${input.filePaths.length} files.`);
