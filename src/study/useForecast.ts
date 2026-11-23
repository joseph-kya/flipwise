import { useEffect, useRef, useState } from 'react';
import { cachedForecast, type Forecast, type ForecastInput } from '../forecast';

/**
 * Forecast that follows its inputs live without blocking input: cached by key, recomputed after a
 * short debounce (so a slider drag doesn't queue a simulation per pixel). The run itself is
 * ~12 ms on the 2,568-card starter set, under one frame.
 */
export function useForecast(key: string, input: () => ForecastInput, delay = 60): Forecast | null {
  const [state, setState] = useState<{ key: string; value: Forecast } | null>(null);
  const latest = useRef(input);
  latest.current = input;
  useEffect(() => {
    if (state?.key === key) return;
    const t = setTimeout(() => setState({ key, value: cachedForecast(key, latest.current) }), state ? delay : 0);
    return () => clearTimeout(t);
  }, [key]);
  return state?.value ?? null;
}
