// Keyboard shortcuts. The key -> action mapping is a pure function so the bindings can be
// tested without a DOM, and the caller decides what each action does.
export const HOTKEY_ACTION = {
  TOGGLE_PAUSE: 'toggle-pause',
};

// Controls that own the keyboard while focused. Buttons are deliberately not on this list: HUD
// buttons keep focus after a mouse click, so excluding them would make the shortcut stop working
// right after choosing a tool. Standalone HUD buttons still respond to Enter.
const TEXT_ENTRY_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT', 'OPTION']);

/** True when a key event belongs to a text field or an editable region. */
export function isTypingTarget(target) {
  if (!target) return false;
  if (target.isContentEditable) return true;
  const tag = typeof target.tagName === 'string' ? target.tagName.toUpperCase() : '';
  return TEXT_ENTRY_TAGS.has(tag);
}

/**
 * Resolves a keydown event to an action id, or null when nothing is bound.
 *
 * Space toggles pause. It is ignored while typing (the seed box), when a modifier is held
 * (Ctrl+Space and friends belong to the browser or the OS), and when something else has
 * already handled the event. The caller must call `preventDefault()` so a focused HUD button
 * does not also fire its click on keyup.
 */
export function resolveHotkey(event) {
  if (!event || event.defaultPrevented) return null;
  if (event.ctrlKey || event.metaKey || event.altKey) return null;
  if (isTypingTarget(event.target)) return null;
  const key = event.key;
  const isSpace = key === ' ' || key === 'Spacebar' || event.code === 'Space';
  return isSpace ? HOTKEY_ACTION.TOGGLE_PAUSE : null;
}
