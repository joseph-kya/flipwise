import { useState } from 'react';
import { Explainer } from './Explainer';

/** Settings → How Flipwise works: the same swipeable explainer as onboarding. */
export function HowItWorksPage() {
  const [index, setIndex] = useState(0);
  return <Explainer index={index} onIndex={setIndex} />;
}
