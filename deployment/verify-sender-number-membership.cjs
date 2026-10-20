'use strict';
const assert = require('node:assert/strict');
const { senderNumber, conflictingSender, senderNumberConflicts } = require('../src/server/dispatch/senderNumberMembership.ts');
for (const value of ['081234567890', '6281234567890', '+62 812-3456-7890', '6281234567890:17@s.whatsapp.net']) {
  assert.equal(senderNumber(value), '6281234567890');
}
for (const value of ['14155552671', '+1 (415) 555-2671', '14155552671@s.whatsapp.net']) {
  assert.equal(senderNumber(value), '14155552671', 'International country codes must be preserved');
}
for (const value of [null, '', 'not a number', '123', '1234567890123456']) assert.equal(senderNumber(value), null);
const members = [
  { id: 'a', name: 'A', number: '081234567890', senderGroupId: 'first', senderGroup: { name: 'First' } },
  { id: 'b', name: 'B', number: '+6281234567890', senderGroupId: 'first', senderGroup: { name: 'First' } },
];
assert.equal(conflictingSender(members[0], members), undefined, 'Same-group duplicates are allowed');
members.push({ id: 'c', name: 'C', number: '6281234567890', senderGroupId: 'second', senderGroup: { name: 'Second' } });
assert.equal(conflictingSender(members[0], members).id, 'c');
assert.equal(senderNumberConflicts(members).length, 3);
members.push({ id: 'unassigned', name: 'Unassigned', number: '081234567890', senderGroupId: null });
assert.equal(senderNumberConflicts(members).find(row => row.phoneId === 'unassigned').otherGroupName, 'First');
console.log('SENDER_NUMBER_MEMBERSHIP_OK: canonical ID/international numbers, invalid/missing values, same group and legacy conflict audit');
