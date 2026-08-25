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
        bytes,
        size:bytes.byteLength,
        uploaded:new Date('2026-08-25T18:00:00Z'),
        httpMetadata:options.httpMetadata || {},
        customMetadata:options.customMetadata || {},
      });
    },
    async get(key) {
      const stored = objects.get(key);
      if (!stored) return null;
      return {
        key:stored.key,
        size:stored.size,
        uploaded:stored.uploaded,
        httpMetadata:stored.httpMetadata,
        customMetadata:stored.customMetadata,
        body:new Response(stored.bytes).body,
        async text() { return new TextDecoder().decode(stored.bytes); },
      };
    },
    async delete(key) { objects.delete(key); },
    async list({ prefix='' }={}) {
      return { objects:[...objects.values()].filter(object => object.key.startsWith(prefix)) };
    },
  };
}

test('comic template API stores category metadata and lists reusable package categories', async () => {
  const MEDIA = fakeBucket();
  const category = await handleComicTemplateRequest(new Request('https://social.test/api/comic-templates/categories', {
    method:'POST',
    headers:{'content-type':'application/json'},
    body:JSON.stringify({name:'Holidays'}),
  }), { MEDIA });
  assert.equal(category.status, 201);
  const categoryData = await category.json();
  assert.equal(categoryData.categories.includes('Rick Parma Comics'), true);
  assert.equal(categoryData.categories.includes('Holidays'), true);

  const upload = new Request('https://social.test/api/comic-templates/neon-night-story', {
    method:'PUT',
    headers:{
      'content-type':'image/png',
      'x-template-name':'Neon Night',
      'x-template-category':'Rick Parma Comics',
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
  assert.equal(uploadedData.template.category, 'Rick Parma Comics');
  assert.equal(uploadedData.template.format, 'story');

  const listed = await handleComicTemplateRequest(new Request('https://social.test/api/comic-templates'), { MEDIA });
  assert.equal(listed.status, 200);
  const listedData = await listed.json();
  assert.equal(listedData.templates.length, 1);
  assert.equal(listedData.templates[0].name, 'Neon Night');
  assert.equal(listedData.categories.includes('Holidays'), true);
  assert.equal(listedData.templates[0].url.includes('comic-templates%2Fneon-night-story.png'), true);
});

test('comic template API can update the mapped speech bubble without re-uploading the image', async () => {
  const MEDIA = fakeBucket();
  await handleComicTemplateRequest(new Request('https://social.test/api/comic-templates/holiday-feed', {
    method:'PUT',
    headers:{
      'content-type':'image/jpeg',
      'x-template-name':'Holiday Party',
      'x-template-category':'Holidays',
      'x-template-format':'feed',
      'x-bubble-x':'0.08','x-bubble-y':'0.05','x-bubble-width':'0.84','x-bubble-height':'0.27',
    },
    body:new Uint8Array([9,8,7]),
  }), { MEDIA });

  const patch = await handleComicTemplateRequest(new Request('https://social.test/api/comic-templates/holiday-feed.jpg', {
    method:'PATCH',headers:{'content-type':'application/json'},
    body:JSON.stringify({bubble:{x:.2,y:.1,width:.5,height:.22}}),
  }), { MEDIA });
  assert.equal(patch.status, 200);
  const data = await patch.json();
  assert.equal(data.template.category, 'Holidays');
  assert.equal(data.template.bubble.x, .2);
  assert.equal(data.template.bubble.width, .5);
  assert.equal(MEDIA.objects.get('comic-templates/holiday-feed.jpg').bytes.length, 3);
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
