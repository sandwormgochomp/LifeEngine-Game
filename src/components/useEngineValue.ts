import { useMemo, useSyncExternalStore } from 'react';

const noopSubscribe = () => () => {};

/**
 * Subscribe a component to a value derived from the engine.
 * Re-renders only when the derived value changes (compared with Object.is),
 * so getValue should return a primitive (number/string/boolean).
 */
export default function useEngineValue<T>(
  engine: any,
  getValue: (engine: any) => T,
  fallback: T
): T {
  const subscribe = useMemo(
    () => (engine ? (onChange: () => void) => engine.subscribe(onChange) : noopSubscribe),
    [engine]
  );
  return useSyncExternalStore(subscribe, () => (engine ? getValue(engine) : fallback));
}
