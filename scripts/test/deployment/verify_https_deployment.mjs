#!/usr/bin/env node

import fs from 'node:fs';
import https from 'node:https';
import process from 'node:process';

const EXPECTED_ISOLATION_HEADERS = {
  'cross-origin-opener-policy': 'same-origin',
  'cross-origin-embedder-policy': 'require-corp',
  'cross-origin-resource-policy': 'same-site',
  'x-content-type-options': 'nosniff',
};

function parseArgs(argv) {
  const options = {
    url: process.env.URDF_STUDIO_PUBLIC_URL || 'https://localhost:8320',
    caCert: process.env.URDF_STUDIO_TEST_CA_CERT || '',
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--url') {
      options.url = argv[++index] || '';
    } else if (arg === '--ca-cert') {
      options.caCert = argv[++index] || '';
    } else if (arg === '--help') {
      console.log(`Usage: node scripts/test/deployment/verify_https_deployment.mjs [options]

Options:
  --url <https-url>    Deployment base URL (default: https://localhost:8320)
  --ca-cert <path>     PEM CA used to validate the deployment certificate
  --help               Show this help`);
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  const baseUrl = new URL(options.url);
  if (baseUrl.protocol !== 'https:') {
    throw new Error(`Deployment verification requires HTTPS, received: ${baseUrl.href}`);
  }

  return {
    baseUrl,
    ca: options.caCert ? fs.readFileSync(options.caCert) : undefined,
  };
}

function request(baseUrl, pathname, { ca, method = 'HEAD', readBody = false } = {}) {
  const targetUrl = new URL(pathname, baseUrl);

  return new Promise((resolve, reject) => {
    const requestHandle = https.request(
      targetUrl,
      {
        ca,
        method,
        rejectUnauthorized: true,
      },
      (response) => {
        const authorized = response.socket?.authorized ?? false;
        const authorizationError = response.socket?.authorizationError;
        const chunks = [];
        response.on('data', (chunk) => {
          if (readBody) chunks.push(chunk);
        });
        response.on('end', () => {
          resolve({
            authorized,
            authorizationError,
            body: Buffer.concat(chunks).toString('utf8'),
            headers: response.headers,
            pathname,
            statusCode: response.statusCode,
          });
        });
      },
    );

    requestHandle.setTimeout(15_000, () => {
      requestHandle.destroy(new Error(`Timed out requesting ${targetUrl.href}`));
    });
    requestHandle.on('error', reject);
    requestHandle.end();
  });
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertIsolationHeaders(result) {
  for (const [headerName, expectedValue] of Object.entries(EXPECTED_ISOLATION_HEADERS)) {
    assert(
      result.headers[headerName] === expectedValue,
      `${result.pathname}: expected ${headerName}=${expectedValue}, received ${String(result.headers[headerName])}`,
    );
  }
}

async function main() {
  const { baseUrl, ca } = parseArgs(process.argv.slice(2));
  const checks = [];

  const health = await request(baseUrl, '/healthz', { ca, method: 'GET', readBody: true });
  assert(health.statusCode === 200, `/healthz: expected 200, received ${health.statusCode}`);
  assert(
    health.authorized,
    `/healthz: TLS is not trusted (${health.authorizationError || 'unknown'})`,
  );
  assert(health.body.trim() === 'ok', `/healthz: unexpected body ${JSON.stringify(health.body)}`);
  assertIsolationHeaders(health);
  checks.push('trusted HTTPS health endpoint');

  const index = await request(baseUrl, '/', { ca, method: 'GET', readBody: true });
  assert(index.statusCode === 200, `/: expected 200, received ${index.statusCode}`);
  assert(index.body.includes('<title>URDF Studio'), '/: URDF Studio HTML title was not found');
  assertIsolationHeaders(index);
  assert(String(index.headers['cache-control']).includes('no-cache'), '/: expected no-cache');
  checks.push('HTML and isolation headers');

  const wasm = await request(baseUrl, '/usd/bindings/emHdBindings.wasm', { ca });
  assert(wasm.statusCode === 200, `WASM: expected 200, received ${wasm.statusCode}`);
  assert(
    String(wasm.headers['content-type']).startsWith('application/wasm'),
    `WASM: invalid content-type ${String(wasm.headers['content-type'])}`,
  );
  assert(
    Number(wasm.headers['content-length']) > 10_000_000,
    'WASM: payload is unexpectedly small',
  );
  assertIsolationHeaders(wasm);
  assert(String(wasm.headers['cache-control']).includes('no-cache'), 'WASM: expected no-cache');
  checks.push('OpenUSD WASM MIME and payload');

  const runtimeJs = await request(baseUrl, '/usd/bindings/emHdBindings.js', { ca });
  assert(
    runtimeJs.statusCode === 200,
    `Runtime JS: expected 200, received ${runtimeJs.statusCode}`,
  );
  assert(
    /javascript/.test(String(runtimeJs.headers['content-type'])),
    `Runtime JS: invalid content-type ${String(runtimeJs.headers['content-type'])}`,
  );
  assertIsolationHeaders(runtimeJs);
  checks.push('OpenUSD runtime JavaScript MIME');

  const runtimeData = await request(baseUrl, '/usd/bindings/emHdBindings.data', { ca });
  assert(
    runtimeData.statusCode === 200,
    `Runtime data: expected 200, received ${runtimeData.statusCode}`,
  );
  assert(
    String(runtimeData.headers['content-type']).startsWith('application/octet-stream'),
    `Runtime data: invalid content-type ${String(runtimeData.headers['content-type'])}`,
  );
  assert(
    Number(runtimeData.headers['content-length']) > 500_000,
    'Runtime data: payload is unexpectedly small',
  );
  assertIsolationHeaders(runtimeData);
  checks.push('OpenUSD runtime data MIME and payload');

  const worker = await request(baseUrl, '/usd/bindings/emHdBindings.worker.js', { ca });
  assert(worker.statusCode === 200, `Worker: expected 200, received ${worker.statusCode}`);
  assert(
    /javascript/.test(String(worker.headers['content-type'])),
    `Worker: invalid content-type ${String(worker.headers['content-type'])}`,
  );
  assertIsolationHeaders(worker);
  checks.push('OpenUSD Worker JavaScript MIME');

  const missingAsset = await request(baseUrl, '/assets/__xgd_missing_worker__.js', { ca });
  assert(
    missingAsset.statusCode === 404,
    `Missing static asset: expected 404, received ${missingAsset.statusCode}`,
  );
  assertIsolationHeaders(missingAsset);
  checks.push('static asset 404 without SPA fallback');

  console.log(
    JSON.stringify(
      {
        baseUrl: baseUrl.href,
        checks,
        ok: true,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exitCode = 1;
});
