import { EventEmitter } from "node:events";
const events = new EventEmitter();
events.setMaxListeners(0);
export const notifyChat = (...ids) =>
  ids.forEach(id => events.emit(String(id)));
export function subscribeChat(id, callback) {
  events.on(String(id), callback);
  return () => events.off(String(id), callback);
}
