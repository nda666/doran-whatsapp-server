"use strict";
// https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Interact_with_the_clipboard
Object.defineProperty(exports, "__esModule", { value: true });
exports.copyToClipboard = void 0;
const copyToClipboard = async ({ target, message, value, }) => {
    try {
        let copyValue = "";
        if (!navigator.clipboard) {
            throw new Error("Browser don't have support for native clipboard.");
        }
        if (target) {
            const node = document.querySelector(target);
            if (!node || !node.textContent) {
                throw new Error("Element not found");
            }
            value = node.textContent;
        }
        if (value) {
            copyValue = value;
        }
        await navigator.clipboard.writeText(copyValue);
        console.log(message !== null && message !== void 0 ? message : "Copied!!!");
    }
    catch (error) {
        console.log(error.toString());
    }
};
exports.copyToClipboard = copyToClipboard;
