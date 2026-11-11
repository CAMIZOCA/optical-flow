import assert from 'node:assert/strict';
import { test } from 'node:test';
import { imageSize, normalizeCedula, validateReview, validateEndpoint } from '../src/domain.ts';

test('keeps smaller originals and reduces large images without stretching', () => {
  assert.deepEqual(imageSize(1200, 2000), { width: 1200, height: 2000 });
  assert.deepEqual(imageSize(4000, 3000), { width: 3000, height: 2250 });
});

test('requires explicit review of name and 10 digit cedula before approval', () => {
  const review = { name: 'Elena Demo', cedula: '', document_date: '', notes: '', raw_text: 'Cédula no legible' };
  assert.equal(validateReview(review, false), null);
  assert.match(validateReview(review, true) ?? '', /cédula/i);
  assert.equal(validateReview({ ...review, cedula: '123-456-7890' }, true), null);
  assert.equal(normalizeCedula('123-456-7890'), '1234567890');
});

test('rejects invalid historical dates and malformed OCR endpoints', () => {
  const review = { name: 'Elena Demo', cedula: '1234567890', document_date: '2024-02-30', notes: '', raw_text: '' };
  assert.match(validateReview(review, true) ?? '', /fecha/i);
  assert.throws(() => validateEndpoint('https://host.test/other'));
  assert.throws(() => validateEndpoint('https://user:password@host.test/extract'));
  assert.equal(validateEndpoint('https://host.test/extract'), 'https://host.test/extract');
});
