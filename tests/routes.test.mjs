import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const snapshot=JSON.parse(readFileSync(new URL('../src/routes.json',import.meta.url)));
test('public play and verification paths remain distinct',()=>{
  assert.match(snapshot.sha256,/^[a-f0-9]{64}$/);
  assert.deepEqual(snapshot.routes,['/spin','/spin/verify','/spin/verify/:code']);
});
