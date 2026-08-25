import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/entry.js';

function mediaObject(bytes, contentType='image/jpeg') {
  return {
    body:new Uint8Array(bytes),
    httpEtag:'"comic-etag"',
    writeHttpMetadata(headers) { headers.set('content-type',contentType); },
  };
}

test('entry serves stored comic backgrounds through the public media path', async () => {
  const seen = [];
  const env = {
    MEDIA:{
      async get(key) {
        seen.push(key);
        if (key === 'comic-templates/movies--scene-1--feed.jpg') return mediaObject([1,2,3,4]);
        return null;
      },
    },
  };
  const response = await worker.fetch(new Request('https://social.test/media/comic-templates%2Fmovies--scene-1--feed.jpg'),env,{});
  assert.equal(response.status,200);
  assert.equal(response.headers.get('content-type'),'image/jpeg');
  assert.equal(response.headers.get('cache-control'),'public, max-age=86400');
  assert.deepEqual(seen,['comic-templates/movies--scene-1--feed.jpg']);
  assert.deepEqual([...new Uint8Array(await response.arrayBuffer())],[1,2,3,4]);
});

test('comic media route rejects nested or unsafe keys', async () => {
  const env = { MEDIA:{ async get() { throw new Error('should not read storage'); } } };
  const response = await worker.fetch(new Request('https://social.test/media/comic-templates%2F..%2Fsecret.jpg'),env,{});
  assert.equal(response.status,404);
});
