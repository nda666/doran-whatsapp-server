const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const React = require('react');

// Exercise the modal's rendered fields and lifecycle without saving live rules.
let values = {}, defaults = {}, slots = [], cursor = 0, effects = [];
const form = {
  setFieldValue(name, value) { values[name] = value; },
  getFieldValue(name) { return values[name]; },
  resetFields() { values = { ...defaults }; },
};
const ref = { current: null };
const hooks = {
  ...React,
  forwardRef: render => render,
  useState(initial) {
    const index = cursor++;
    if (!(index in slots)) slots[index] = initial;
    return [slots[index], next => { slots[index] = next; }];
  },
  useImperativeHandle(target, create) { target.current = create(); },
  useEffect(callback, dependencies) {
    const index = cursor++;
    const previous = slots[index];
    if (!previous || dependencies.some((value, i) => value !== previous.dependencies[i])) {
      effects.push(() => {
        previous?.cleanup?.();
        slots[index] = { dependencies, cleanup: callback() };
      });
    }
  },
};
const Form = Object.assign(() => null, {
  Item: 'form-item', useForm: () => [form], useWatch: name => values[name],
});
const source = ts.transpileModule(fs.readFileSync('src/components/auto-reply/AutoReplyFormModal.tsx', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
}).outputText;
const mod = { exports: {} };
new Function('require', 'module', 'exports', source)(name => {
  if (name === 'react') return hooks;
  if (name === 'antd') return {
    Form, Input: Object.assign(() => null, { TextArea: 'textarea' }),
    Radio: Object.assign(() => null, { Group: 'radio-group' }), Select: 'select', Modal: 'modal', Flex: 'flex',
    Button: 'button', Checkbox: 'checkbox', InputNumber: 'number', Upload: 'upload', Image: 'image',
  };
  if (name === 'next-i18next') return { useTranslation: () => ({ t: key => key }) };
  if (name === '@ant-design/icons') return { UploadOutlined: 'icon' };
  if (name.startsWith('@/') || name === './KeywordTagsInput' || name === 'react-image-file-resizer') return () => null;
  return require(name);
}, mod, mod.exports);
function find(node, predicate) {
  if (!node || typeof node !== 'object') return [];
  return [...(predicate(node) ? [node] : []), ...React.Children.toArray(node.props?.children).flatMap(child => find(child, predicate))];
}
const phone = { id: 'phone', number: '628000000000' };
let props = { open: true, phoneId: phone, onCancel() {}, onSubmitReply() {} };
function render() {
  let tree;
  for (let i = 0; i < 3; i++) {
    cursor = 0;
    tree = mod.exports.default(props, ref);
    defaults = find(tree, node => node.type === Form)[0].props.initialValues;
    if (!('type_message' in values)) values = { ...defaults, ...values };
    const pending = effects; effects = []; pending.forEach(effect => effect());
  }
  return tree;
}
function check(type, field) {
  const tree = render();
  assert.equal(values.type_message, type);
  assert.equal(find(tree, node => node.type === Form.Item && node.props.name === field).length, 1);
  return tree;
}
check('text', 'reply');
form.setFieldValue('reply', 'First reply');
ref.current.resetForm();
props = { ...props, open: false, phoneId: undefined }; render();
props = { ...props, open: true, phoneId: { ...phone } };
check('text', 'reply');
assert.equal(values.reply, undefined, 'Previous reply cleared');
for (const [type, field] of [['image', 'caption'], ['list', 'listPayload'], ['webhook', 'url'], ['text', 'reply']]) {
  form.setFieldValue('type_message', type); check(type, field);
}
props = { ...props, editReply: { id: 1, type: 'image', type_keyword: 'Equal', reply: {}, keyword: 'photo' } };
check('image', 'caption');
props = { ...props, open: false, editReply: undefined, phoneId: undefined }; render();
props = { ...props, open: true, phoneId: { ...phone } };
check('text', 'reply');
const page = fs.readFileSync('src/pages/dashboard/auto-reply.tsx', 'utf8');
assert(page.includes('formAutoRep.current?.resetForm()'), 'Successful save resets the reply modal');
console.log('AUTO_REPLY_FORM_RESET_OK: first open, save/reset/reopen, message types, edit/cancel/create');
