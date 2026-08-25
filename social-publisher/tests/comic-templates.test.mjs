import test from 'node:test';
import assert from 'node:assert/strict';
import { handleComicTemplateRequest } from '../src/comic-templates.js';

function fakeBucket() {
  const objects = new Map();
  return {
    objects,
    async put(key, body, options={}) {
      const bytes = body ? new Uint8Array(await new Response(body).arrayBuffer()) : new Uint8Array();
      objects.set(key, {
        key,
        size:bytes.byteLength,
        uploaded:new Date('2026-08-25T18:00:00Z'),
        httpMetadata:options.httpMetadata || {},
        customMetadata:options.customMetadata || {},
      });
    },
    async delete(key) { objects.delete(key); },
    async list({ prefix='' }={}) {
      return { objects:[...objects.values()].filter(object => object.key.startsWith(prefix)) };
    },
  };
}

test('comic template API stores paired scene metadata and lists it', async () => {
  const MEDIA = fakeBucket();
  const upload = new Request('https://social.test/api/comic-templates/neon-night-story', {
    method:'PUT',
    headers:{
      'content-type':'image/png',
      'x-template-name':'Neon Night',
      'x-template-pair':'neon-night',
      'x-template-format':'story',
      'x-bubble-x':'0.08',
      'x-bubble-y':'0.08',
      'x-bubble-width':'0.54',
      'x-bubble-height':'0.30',
    },
    body:new Uint8Array([1,2,3,4]),
  });
  const uploaded = await handleComicTemplateRequest(upload, { MEDIA });
  assert.equal(uploaded.status, 201);
  const uploadedData = await uploaded.json();
  assert.equal(uploadedData.template.id, 'neon-night-story.png');
  assert.equal(uploadedData.template.pairId, 'neon-night');
  assert.equal(uploadedData.template.format, 'story');
  assert.equal(uploadedData.template.bubble.width, 0.54);

  const listed = await handleComicTemplateRequest(new Request('https://social.test/api/comic-templates'), { MEDIA });
  assert.equal(listed.status, 200);
  const listedData = await listed.json();
  assert.equal(listedData.templates.length, 1);
  assert.equal(listedData.templates[0].name, 'Neon Night');
  assert.equal(listedData.templates[0].format, 'story');
  assert.equal(listedData.templates[0].url.includes('comic-templates%2Fneon-night-story.png'), true);
});

test('comic template API rejects non-images and can delete a template', async () => {
  const MEDIA = fakeBucket();
  const bad = await handleComicTemplateRequest(new Request('https://social.test/api/comic-templates/not-image', {
    method:'PUT', headers:{'content-type':'text/plain'}, body:'hello',
  }), { MEDIA });
  assert.equal(bad.status, 415);

  await MEDIA.put('comic-templates/test-feed.jpg', new Uint8Array([1]), { httpMetadata:{contentType:'image/jpeg'} });
  const removed = await handleComicTemplateRequest(new Request('https://social.test/api/comic-templates/test-feed.jpg', { method:'DELETE' }), { MEDIA });
  assert.equal(removed.status, 200);
  assert.equal(MEDIA.objects.has('comic-templates/test-feed.jpg'), false);
});
