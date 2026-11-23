import { useEffect, useRef, useState } from 'react';
import { cachedForecast, peekForecast, type Forecast, type ForecastInput } from '../forecast';

/**
 * Forecast that follows its inputs live without blocking input: cached by key, recomputed after a
 * short debounce (so a slider drag doesn't queue a simulation per pixel). Computes synchronously on
 * first mount or cache hit so opening the sheet never flashes a loading state.
 */
export function useForecast(key: string, input: () => ForecastInput, delay = 60): Forecast {
  const latest = useRef(input);
  latest.current = input;
  const [state, setState] = useState<{ key: string; value: Forecast }>(() => ({
    key,
    value: cachedForecast(key, input),
  }));
  useEffect(() => {
    if (state.key === key) return;
    const hit = peekForecast(key);
    if (hit) {
      setState({ key, value: hit });
      return;
    }
    const t = setTimeout(() => setState({ key, value: cachedForecast(key, latest.current) }), delay);
    return () => clearTimeout(t);
  }, [key, delay]);
  return state.value;
}
