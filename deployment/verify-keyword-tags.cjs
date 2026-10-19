const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const React = require('react');
const source = ts.transpileModule(fs.readFileSync('src/components/auto-reply/KeywordTagsInput.tsx', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true }
}).outputText;
let draft = '', value = 'harga|katalog', changes = 0;
const mod = { exports: {} };
new Function('require', 'module', 'exports', source)(name => {
  if (name === 'react') return { ...React, useState: () => [draft, next => { draft = next; }] };
  if (name === 'antd') return { Input: 'input', Button: 'button', Tag: 'tag', Space: 'space' };
  if (name === '@ant-design/icons') return { CloseOutlined: 'close-icon' };
  return require(name);
}, mod, mod.exports);
function render() { return mod.exports.default({ value, onChange: next => { value = next; changes++; } }); }
function find(node, type) {
  if (!node || typeof node !== 'object') return [];
  const children = React.Children.toArray(node.props?.children);
  return [...(node.type === type ? [node] : []), ...children.flatMap(child => find(child, type))];
}
function enter(text, nativeEvent = {}) {
  let input = find(render(), 'input')[0];
  input.props.onChange({ target: { value: text } });
  input = find(render(), 'input')[0];
  let prevented = false, stopped = false;
  input.props.onKeyDown({ key: 'Enter', nativeEvent, preventDefault() { prevented = true; }, stopPropagation() { stopped = true; } });
  assert(prevented && stopped, 'Enter must not submit or bubble');
}
assert.equal(find(render(), 'tag').length, 2, 'Existing pipe-separated rules load as tags');
enter(' produk '); assert.equal(value, 'harga|katalog|produk'); assert.equal(draft, '');
enter('HARGA'); assert.equal(value, 'harga|katalog|produk', 'Duplicates ignored case-insensitively');
const beforeEmpty = changes; enter('  '); assert.equal(changes, beforeEmpty);
enter('halo, kak'); assert(value.endsWith('|halo, kak'), 'Comma stays within one keyword');
enter('promo|diskon'); assert(value.endsWith('|promo|diskon'), 'Legacy separator compatible');
const beforeComposition = value; enter('日本語', { isComposing: true }); assert.equal(value, beforeComposition);
assert.equal(draft, '日本語');
find(render(), 'input')[0].props.onChange({ target: { value: 'belum enter' } });
find(render(), 'input')[0].props.onBlur(); assert(value.endsWith('|belum enter'), 'Pending keyword committed before Save');
find(render(), 'button').find(button => button.props['aria-label'] === 'Hapus kata kunci katalog').props.onClick();
assert(!value.split('|').includes('katalog'));
draft = 'belum ditambahkan';
const clear = find(render(), 'button').find(button => button.props.children === 'Hapus semua tag');
assert.equal(clear.props.htmlType, 'button');
assert.equal(clear.props.disabled, false);
clear.props.onClick();
assert.equal(value, ''); assert.equal(draft, '');
assert.equal(find(render(), 'tag').length, 0);
assert.equal(find(render(), 'button').find(button => button.props.children === 'Hapus semua tag').props.disabled, true);
enter('baru'); assert.equal(value, 'baru', 'Input works after clearing all tags');
const form = fs.readFileSync('src/components/auto-reply/AutoReplyFormModal.tsx', 'utf8');
assert(form.includes('Tekan Enter untuk menambahkan kata kunci'));
assert(!form.includes('pisahkan beberapa kata kunci dengan |'));
console.log('KEYWORD_TAGS_OK: legacy rules, Enter suppression, empty input, deduplication, commas, IME, pending input, removal');
