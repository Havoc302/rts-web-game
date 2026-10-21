import assert from 'assert';
import { HOTKEY_ACTION, isTypingTarget, resolveHotkey } from '../../src/engine/Hotkeys.js';

console.log('=== hotkeys.case.js ===');

// Events are plain objects here: the resolver only reads the key, the code, the modifiers and
// the event target, so no DOM is needed.
const press = (overrides = {}) => ({ key: ' ', code: 'Space', target: null, ...overrides });

assert.strictEqual(resolveHotkey(press()), HOTKEY_ACTION.TOGGLE_PAUSE, 'Space toggles pause');
assert.strictEqual(resolveHotkey(press({ key: 'Spacebar' })), HOTKEY_ACTION.TOGGLE_PAUSE,
  'The legacy Spacebar key name still works');
assert.strictEqual(resolveHotkey(press({ key: 'Unidentified' })), HOTKEY_ACTION.TOGGLE_PAUSE,
  'The physical code is enough when the key is unidentified');
assert.strictEqual(resolveHotkey(press({ key: 'Enter', code: 'Enter' })), null, 'Every other key is left alone');

assert.strictEqual(resolveHotkey(press({ ctrlKey: true })), null, 'Ctrl+Space belongs to the browser');
assert.strictEqual(resolveHotkey(press({ metaKey: true })), null, 'Cmd+Space belongs to the OS');
assert.strictEqual(resolveHotkey(press({ altKey: true })), null, 'Alt+Space belongs to the OS');
assert.strictEqual(resolveHotkey(press({ defaultPrevented: true })), null,
  'An event something else already handled is ignored');
assert.strictEqual(resolveHotkey(null), null, 'A missing event resolves to nothing');

// Typing and focused controls must never pause the game.
assert.strictEqual(resolveHotkey(press({ target: { tagName: 'INPUT' } })), null,
  'The seed box keeps its spaces');
assert.strictEqual(resolveHotkey(press({ target: { tagName: 'textarea' } })), null, 'Text areas are respected');
assert.strictEqual(resolveHotkey(press({ target: { isContentEditable: true } })), null,
  'Editable regions keep their spaces');
// HUD buttons keep focus after a mouse click, so they must not swallow the shortcut; the
// handler's preventDefault stops the focused button from also clicking on keyup.
assert.strictEqual(resolveHotkey(press({ target: { tagName: 'BUTTON' } })), HOTKEY_ACTION.TOGGLE_PAUSE,
  'A focused HUD button does not block the pause shortcut');
assert.strictEqual(resolveHotkey(press({ target: { tagName: 'BODY' } })), HOTKEY_ACTION.TOGGLE_PAUSE,
  'The page body and canvas still toggle pause');

assert.strictEqual(isTypingTarget(null), false, 'No target is not a text field');
assert.strictEqual(isTypingTarget({}), false, 'An element without a tag name is not a text field');
assert.strictEqual(isTypingTarget({ tagName: 'select' }), true);
assert.strictEqual(isTypingTarget({ tagName: 'BUTTON' }), false, 'Buttons are not text entry');

console.log('Hotkey tests passed.');
