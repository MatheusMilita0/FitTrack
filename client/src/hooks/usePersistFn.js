"use strict";
import { useRef } from "react";
export function usePersistFn(fn) {
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const persistFn = useRef(null);
  if (!persistFn.current) {
    persistFn.current = function(...args) {
      return fnRef.current.apply(this, args);
    };
  }
  return persistFn.current;
}
