import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { downloadAsset } from '../dist/lib/download.js';
import { featuresFor } from '../dist/lib/permissions.js';

const originalFetch = globalThis.fetch;
process.env.RAVEN_API_KEY = 'test-key';
afterEach(() => { globalThis.fetch = originalFetch; });
const json = (body, status=200) => new Response(JSON.stringify(body), { status, headers: {'content-type':'application/json'} });

async function temporary(callback) {
  const directory = await mkdtemp(join(tmpdir(), 'raven-test-'));
  try { await callback(directory); } finally { await rm(directory, { recursive:true, force:true }); }
}

test('writes exact binary bytes and keeps authentication off CDN requests', async () => temporary(async directory => {
  const bytes = Uint8Array.of(0, 255, 128, 4, 0);
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push([String(url), options]);
    return calls.length === 1 ? json({location:'https://cdn.example/asset'}) : new Response(bytes);
  };
  const file = join(directory,'mesh');
  assert.deepEqual(await downloadAsset('85219043959502',file), {assetId:'85219043959502',path:file,bytes:5});
  assert.deepEqual(new Uint8Array(await readFile(file)),bytes);
  assert.equal(calls[0][1].headers['x-api-key'],'test-key');
  assert.equal(calls[0][1].redirect,'error');
  assert.equal(calls[1][1].headers,undefined);
  assert.ok(calls[0][1].signal && calls[1][1].signal);
  assert.deepEqual(await readdir(directory),['mesh']);
}));

test('403 gives permission guidance and writes no file', async () => temporary(async directory => {
  globalThis.fetch = async () => json({message:'Forbidden'},403);
  await assert.rejects(downloadAsset('123',join(directory,'asset')),/Legacy Assets/);
  assert.deepEqual(await readdir(directory),[]);
}));

test('retries API rate limits and CDN failures', async () => temporary(async directory => {
  let call=0;
  globalThis.fetch = async () => {
    call++;
    if (call===1) return json({},429);
    if (call===2) return json({locations:[{location:'https://cdn.example/asset'}]});
    if (call===3) return new Response('',{status:503});
    return new Response('mesh');
  };
  assert.equal((await downloadAsset('123',join(directory,'asset'))).bytes,4);
  assert.equal(call,4);
}));

test('network timeout, missing location, insecure URL, and empty bytes fail', async () => temporary(async directory => {
  globalThis.fetch=async () => {throw new DOMException('Timeout','TimeoutError');};
  await assert.rejects(downloadAsset('123',join(directory,'asset')),/Network error/);
  globalThis.fetch=async () => json({});
  await assert.rejects(downloadAsset('123',join(directory,'asset')),/location/);
  globalThis.fetch=async () => json({location:'http://cdn.example/asset'});
  await assert.rejects(downloadAsset('123',join(directory,'asset')),/insecure/);
  globalThis.fetch=async url => String(url).includes('assetId') ? json({location:'https://cdn.example/asset'}) : new Response('');
  await assert.rejects(downloadAsset('123',join(directory,'asset')),/empty/);
}));

test('failed atomic rename cleans staging files', async () => temporary(async directory => {
  globalThis.fetch=async url => String(url).includes('assetId') ? json({location:'https://cdn.example/asset'}) : new Response('mesh');
  await mkdir(join(directory,'target'));
  await assert.rejects(downloadAsset('123',join(directory,'target')),/Could not write/);
  assert.deepEqual(await readdir(directory),['target']);
}));

test('upload and download command permissions remain separate', () => {
  assert.deepEqual(featuresFor('asset upload').map(f=>f.id),['asset']);
  assert.deepEqual(featuresFor('asset download').map(f=>f.id),['asset-download']);
});

test('CLI follows CDN redirects without leaking authentication', async () => temporary(async directory => {
  const { createServer } = await import('node:http');
  const { spawn } = await import('node:child_process');
  let base;
  const requests=[];
  const server=createServer((req,res)=> {
    requests.push([req.url,req.headers['x-api-key']]);
    if(req.url.includes('/assetId/')) {
      res.setHeader('content-type','application/json');res.end(JSON.stringify({location:base+'/redirect'}));
    } else if(req.url==='/redirect') {
      res.writeHead(302,{location:base+'/binary'});res.end();
    } else res.end(Buffer.from([0,255,1]));
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  base=`http://127.0.0.1:${server.address().port}`;
  try {
    const output=await new Promise((resolve,reject)=> {
      const child=spawn(process.execPath,['dist/index.js','--json','asset','download','--id','123','--output',join(directory,'asset')],
        {env:{...process.env,RAVEN_API_BASE_URL:base,RAVEN_API_KEY:'test-key'}});
      let stdout='',stderr=''; child.stdout.on('data',x=>stdout+=x);child.stderr.on('data',x=>stderr+=x);
      child.on('error',reject);child.on('close',code=>code===0?resolve(stdout):reject(new Error(stderr)));
    });
    assert.equal(JSON.parse(output).bytes,3);
    assert.deepEqual(requests,[['/asset-delivery-api/v1/assetId/123','test-key'],['/redirect',undefined],['/binary',undefined]]);
  } finally {await new Promise(resolve=>server.close(resolve));}
}));

test('noninteractive feature migration preserves the saved key and other commands', async () => temporary(async directory => {
  const { spawn } = await import('node:child_process');
  const { writeFile } = await import('node:fs/promises');
  const credentials=join(directory,'credentials.json');
  await writeFile(credentials,JSON.stringify({apiKey:'test-key',features:['asset','publish'],savedAt:'test'}));
  const env={...process.env,RAVEN_CONFIG_DIR:directory};delete env.RAVEN_API_KEY;
  const run=async args=>new Promise((resolve,reject)=> {
    const child=spawn(process.execPath,['dist/index.js',...args],{env});let stdout='',stderr='';
    child.stdout.on('data',x=>stdout+=x);child.stderr.on('data',x=>stderr+=x);
    child.on('error',reject);child.on('close',code=>resolve({code,stdout,stderr}));
  });
  const disabled=await run(['asset','download','--id','123','--output',join(directory,'asset')]);
  assert.equal(disabled.code,1);assert.match(disabled.stderr,/disabled/);
  const enabled=await run(['--json','auth','enable','--feature','asset-download']);
  assert.equal(enabled.code,0);assert.deepEqual(JSON.parse(enabled.stdout),{enabled:'asset-download'});
  const saved=JSON.parse(await readFile(credentials,'utf8'));
  assert.deepEqual(saved.features,['asset','publish','asset-download']);assert.equal(saved.apiKey,'test-key');
}));
