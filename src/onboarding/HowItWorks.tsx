import { Group, Row } from '../ui';
import { STUDY_CONFIG } from '../scheduler';

export const HOW_PANELS = 3;

/** Memory fading, a review just before it drops too low, and wider gaps each time. */
function ForgettingCurve() {
  // Each review (dot) lifts memory back up; it lands just above the line where you'd forget,
  // and every gap is wider than the last.
  const reviews = [8, 56, 128, 234];
  const decay = (x0: number, x1: number) => {
    const w = x1 - x0;
    return `C ${x0 + w * 0.18} 62, ${x0 + w * 0.5} 84, ${x1} 88`;
  };
  const d = reviews.slice(0, -1).map((x, i) => `${i ? `L ${x} 22 ` : `M ${x} 22 `}${decay(x, reviews[i + 1])}`).join(' ')
    + ` L ${reviews.at(-1)} 22 C ${reviews.at(-1)! + 30} 40, ${reviews.at(-1)! + 60} 52, 312 58`;
  return (
    <svg className="how-curve" viewBox="0 0 320 120" role="img" aria-label="Memory fades after each review; each review lands just before you'd forget, and the gaps grow longer.">
      <line className="how-curve-threshold" x1="8" x2="312" y1="98" y2="98" />
      <path className="how-curve-line" pathLength={1} d={d} />
      {reviews.map((x) => <circle key={x} className="how-curve-dot" cx={x} cy={22} r={4.5} />)}
      <text className="how-curve-label" x="8" y="10">Reviews</text>
      <text className="how-curve-label how-curve-label-end" x="312" y="114">You’d forget here</text>
    </svg>
  );
}

const caps = [
  ['Physics 1', STUDY_CONFIG.courseNew['physics-1']],
  ['Robotics', STUDY_CONFIG.courseNew.robotics],
  ['Analysis 1', STUDY_CONFIG.courseNew['analysis-1']],
  ['Programming 1', STUDY_CONFIG.courseNew['programming-1']],
] as const;

/** The FSRS + daily-habit explainer, used in onboarding (one panel at a time) and in Settings (all). */
export function HowItWorksPanel({ panel }: { panel: number }) {
  if (panel === 0)
    return (
      <div className="how-panel">
        <h2 className="ob-title">Each card comes back just before you’d forget it</h2>
        <p className="ob-lead">
          Flipwise uses FSRS, a memory model that predicts when you’re about to forget a card and schedules it right before.
          Cards you know well come back less and less often.
        </p>
        <ForgettingCurve />
      </div>
    );
  if (panel === 1)
    return (
      <div className="how-panel">
        <h2 className="ob-title">Rate honestly</h2>
        <p className="ob-lead">Your rating is how FSRS learns your memory. Be honest, not generous.</p>
        <Group ariaLabel="Rating buttons">
          <Row leading={<span className="how-rating how-rating-again">Again</span>} title="You didn’t remember it" subtitle="Comes back in minutes" />
          <Row leading={<span className="how-rating how-rating-hard">Hard</span>} title="You got it, with effort" subtitle="A shorter gap than usual" />
          <Row leading={<span className="how-rating how-rating-good">Good</span>} title="You remembered it" subtitle="The normal gap" />
          <Row leading={<span className="how-rating how-rating-easy">Easy</span>} title="Instant, no thought needed" subtitle="A much longer gap" />
        </Group>
      </div>
    );
  return (
    <div className="how-panel">
      <h2 className="ob-title">A little, every day</h2>
      <p className="ob-lead">Being on board means opening Flipwise daily. Short and steady beats long and rare.</p>
      <Group ariaLabel="Daily habit">
        <Row title="10–20 minutes a day" subtitle="Usually enough to keep every course on track" />
        <Row title="Due cards first" subtitle="Then new ones, as many as the day allows" />
        <Row
          title="New cards are capped per course"
          subtitle={`${caps.map(([n, c]) => `${n} ${c}`).join(', ')} a day, so reviews never snowball`}
        />
        <Row title="Missed a few days?" subtitle="Reviews pile up. Catch-up mode clears them fast." />
      </Group>
    </div>
  );
}
