const assert = require('node:assert/strict'), fs = require('node:fs'), { createHash } = require('node:crypto');
(async () => {
  for (const name of ['jeblast-api.postman_collection.json', 'jeblast-api.postman_environment.json', 'jeblast-api-curl-guide.pdf']) {
    const response = await fetch('https://dashboard.jeblast.com/downloads/' + name);
    assert.equal(response.status, 200);
    const data = Buffer.from(await response.arrayBuffer());
    const local = fs.readFileSync('public/downloads/' + name);
    assert.equal(createHash('sha256').update(data).digest('hex'), createHash('sha256').update(local).digest('hex'));
    console.log('EXTERNAL_WINDOWS_API_TOOLKIT_DOWNLOAD_OK', name, data.length);
  }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
