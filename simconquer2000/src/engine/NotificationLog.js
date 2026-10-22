// A rolling log of city warnings, newest at the bottom. The simulation's alert list only says what
// is wrong right now; this keeps the history, stamped with the in-game time each warning started,
// so a shortage that came and went is still readable. Pure data, so it can be tested without a DOM.
import { HOURS_PER_DAY, TICKS_PER_HOUR } from '../config.js';

export const NOTIFICATION_LOG_LIMIT = 50;

/** In-game stamp for a tick count, matching the header clock (`D3 14:00`). */
export function formatNotificationStamp(tickCount) {
  const ticks = Math.max(0, Math.floor(Number(tickCount) || 0));
  const day = Math.floor(ticks / (TICKS_PER_HOUR * HOURS_PER_DAY)) + 1;
  const hour = Math.floor(ticks / TICKS_PER_HOUR) % HOURS_PER_DAY;
  return `D${day} ${String(hour).padStart(2, '0')}:00`;
}

export class NotificationLog {
  constructor(limit = NOTIFICATION_LOG_LIMIT) {
    this.limit = limit;
    this.entries = [];
    this.active = new Map();
    // Warnings the player cleared by hand. They stay quiet until their condition goes away and
    // comes back, which is what the old dismissable banner did.
    this.silenced = new Set();
    this.nextKey = 1;
  }

  /**
   * Folds in the current alert list. An alert only becomes an entry when it is new, so a standing
   * warning does not repeat every tick, but the same id with different wording (\"supply is below
   * demand\" escalating to \"going hungry\") is a new event and gets its own line. Returns the
   * entries that were added.
   */
  record(alerts, tickCount = 0) {
    const active = new Map();
    const added = [];
    for (const alert of alerts || []) {
      if (!alert || !alert.id) continue;
      const eventKey = `${alert.id}|${alert.message}`;
      active.set(eventKey, alert.id);
      if (this.silenced.has(eventKey) || this.openKeys().has(eventKey)) continue;
      const entry = {
        key: this.nextKey++,
        eventKey,
        alertId: alert.id,
        message: alert.message,
        x: alert.x ?? null,
        y: alert.y ?? null,
        stamp: formatNotificationStamp(tickCount),
        open: true,
      };
      this.entries.push(entry);
      added.push(entry);
    }
    this.active = active;
    for (const eventKey of this.silenced) {
      if (!active.has(eventKey)) this.silenced.delete(eventKey);
    }
    this.syncOpenState();
    if (this.entries.length > this.limit) {
      this.entries.splice(0, this.entries.length - this.limit);
    }
    return added;
  }

  /** Event keys of entries that are still live, used to avoid logging the same warning twice. */
  openKeys() {
    const keys = new Set();
    for (const entry of this.entries) {
      if (entry.open) keys.add(entry.eventKey);
    }
    return keys;
  }

  /** Marks entries whose warning has since cleared, so the log can show history without alarm. */
  syncOpenState() {
    for (const entry of this.entries) {
      entry.open = this.active.has(entry.eventKey);
    }
  }

  /** Player-driven removal. The warning stays silent until the condition clears and returns. */
  dismiss(key) {
    const index = this.entries.findIndex((entry) => entry.key === Number(key));
    if (index === -1) return false;
    const [entry] = this.entries.splice(index, 1);
    this.silenced.add(entry.eventKey);
    return true;
  }

  clear() {
    this.entries = [];
    this.active = new Map();
    this.silenced.clear();
  }
}
