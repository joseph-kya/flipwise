import robotics from '../decks/intro-to-robotics.flipwise.json';

export interface DemoCard { stableId?: string; format?: 'anki'; source?: string; queuePosition?: number; id: string; front: string; back: string }
export interface Lecture { id: string; title: string; cards: DemoCard[] }
export interface Subject { collectionLabel?: string; dailyNew?: number; id: string; name: string; total: number; lectures: Lecture[] }

const makeLectures = (entries: [string, [string, string][]][]): Lecture[] =>
  entries.map(([title, cards], index) => ({
    id: `lecture-${index + 1}`,
    title,
    cards: cards.map(([front, back], i) => ({ id: `${index}-${i}`, front, back })),
  }));

export const subjects: Subject[] = [
  {
    id: 'analysis-1', name: 'Analysis 1', total: 696,
    lectures: makeLectures([
      ['Sequences & Limits', [
        ['What does aₙ → L mean?', 'For every ε > 0, there exists N such that n ≥ N implies |aₙ − L| < ε.'],
        ['What is the limit of 1/n?', '0 as n tends to infinity.'],
        ['Does every bounded sequence converge?', 'No. For example, (−1)ⁿ is bounded but does not converge.'],
      ]],
      ['Series', [
        ['When does the geometric series ∑ rⁿ, n = 0,…, converge?', 'Exactly when |r| < 1; its sum is 1/(1 − r).'],
        ['Does the harmonic series converge?', 'No. ∑ 1/n diverges.'],
        ['What is a necessary condition for ∑ aₙ to converge?', 'The terms aₙ must tend to 0. This condition alone is not sufficient.'],
      ]],
      ['Continuity', [
        ['What does continuity at a mean?', 'The limit of f(x) as x → a equals f(a).'],
        ['Are all polynomials continuous on ℝ?', 'Yes.'],
        ['What does the intermediate value theorem guarantee?', 'A continuous function on [a,b] takes every value between f(a) and f(b).'],
      ]],
      ['Differentiation', [
        ['What is the derivative of xⁿ?', 'n xⁿ⁻¹, for positive integer n.'],
        ['State the product rule.', '(fg)′ = f′g + fg′.'],
        ['Does differentiability imply continuity?', 'Yes, at every point where the function is differentiable.'],
      ]],
      ['Riemann Integral', [
        ['What is ∫₀¹ x dx?', '1/2.'],
        ['Is every continuous function on [a,b] Riemann integrable?', 'Yes.'],
        ['What is ∫ₐᵃ f(x) dx?', '0.'],
      ]],
    ]),
  },
  {
    id: 'robotics', name: 'Robotics', total: 904,
    lectures: robotics.sections.map(section => ({
      id: section.id, title: section.title,
      cards: robotics.cards.filter(card => card.section === section.id),
    })),
  },
  {
    id: 'physics-1', name: 'Physics 1', total: 756,
    lectures: makeLectures([
      ['Kinematics', [
        ['How is velocity defined?', 'Velocity is the time derivative of position: v = dx/dt.'],
        ['What is acceleration?', 'The time derivative of velocity: a = dv/dt.'],
        ['What is displacement under constant velocity?', 'Δx = v Δt.'],
      ]],
      ['Newton’s Laws', [
        ['State Newton’s second law for constant mass.', 'The net force is F = ma.'],
        ['What is the SI unit of force?', 'The newton: 1 N = 1 kg·m/s².'],
        ['Do action and reaction forces act on the same body?', 'No. They act on different bodies.'],
      ]],
      ['Work & Energy', [
        ['What is translational kinetic energy?', 'K = ½mv².'],
        ['What is the work of a constant force?', 'W = F · Δr = F Δr cos θ.'],
        ['State the work–energy theorem.', 'The net work equals the change in kinetic energy.'],
      ]],
      ['Momentum', [
        ['What is linear momentum?', 'p = mv for a body of mass m and velocity v.'],
        ['When is total momentum conserved?', 'When the net external force on a system is zero.'],
        ['What is impulse?', 'The integral of force over time; it equals the change in momentum.'],
      ]],
      ['Oscillations', [
        ['What is Hooke’s law?', 'F = −kx for an ideal spring displaced by x.'],
        ['What is the angular frequency of an ideal mass–spring oscillator?', 'ω = √(k/m).'],
        ['How are period and frequency related?', 'T = 1/f.'],
      ]],
    ]),
  },
  {
    id: 'programming-1', name: 'Programming 1', total: 212,
    lectures: makeLectures([
      ['Variables & Types', [
        ['What is a variable?', 'A named binding used to store or refer to a value.'],
        ['What values does a Boolean represent?', 'True and false.'],
        ['What is a type?', 'A classification of values that determines which operations are valid.'],
      ]],
      ['Control Flow', [
        ['What does an if statement do?', 'It executes a branch depending on a condition.'],
        ['When does a while loop check its condition?', 'Before each iteration, including the first.'],
        ['What does break do in a loop?', 'It exits the nearest enclosing loop.'],
      ]],
      ['Functions', [
        ['What is a function parameter?', 'A named input declared in a function definition.'],
        ['What does return do?', 'It ends the current function call, optionally providing a result.'],
        ['What does recursion require to terminate?', 'A reachable base case and progress toward it.'],
      ]],
      ['Arrays & Algorithms', [
        ['What is an array index?', 'A position used to access an element in an array.'],
        ['What is the worst-case time complexity of linear search?', 'O(n) for n elements.'],
        ['What prerequisite does binary search have?', 'The search range must be sorted according to the comparison used.'],
      ]],
    ]),
  },
];

// Layout proof cards remain ordinary study content.
subjects[0].lectures[0].cards[0].back += '\n\n| Criterion | Convergent sequence | Bounded sequence | Monotone sequence | Practical test |\n| --- | --- | --- | --- | --- |\n| Definition | Approaches one finite limit | Stays in a finite interval | Moves in one direction | Check the quantifiers |\n| Guarantee | Always bounded | May oscillate forever | Converges if bounded | Bound and monotonicity together |';
subjects[0].lectures[0].cards[1].back += '\n\n' + Array.from({length:8}, (_,i) => `**Step ${i+1}.** Given a positive tolerance ε, choose an integer N greater than 1/ε. For every n ≥ N, the distance from 1/n to zero is smaller than ε. This verifies the definition without relying on a graph or a numerical approximation.`).join('\n\n');

// Handwritten additions use the existing practice IDs to preserve saved reviews.
const practice: Record<string, [string, string][][]> = {
  'analysis-1': [
    [
      ['Can a convergent real sequence have two different limits?', 'No. Limits are unique; the triangle inequality rules out two distinct limits.'],
      ['What does the monotone convergence theorem say for real sequences?', 'Every monotone bounded real sequence converges.'],
      ['If aₙ → 2 and bₙ → −3, what is lim aₙbₙ?', '−6, by the product rule for limits.'],
      ['What is a Cauchy sequence in ℝ?', 'For every ε > 0, some N satisfies |aₙ − aₘ| < ε whenever n,m ≥ N.'],
      ['Does every Cauchy sequence in ℝ converge?', 'Yes. This is the completeness property of ℝ.'],
    ],
    [
      ['For which real p does ∑ₙ₌₁∞ 1/nᵖ converge?', 'Exactly for p > 1.'],
      ['What does absolute convergence imply?', 'If ∑ |aₙ| converges, then ∑ aₙ converges.'],
      ['When does the alternating series test guarantee convergence?', 'When the nonnegative term magnitudes decrease to zero.'],
      ['If lim |aₙ₊₁/aₙ| = q < 1, what does the ratio test imply?', 'The series converges absolutely.'],
      ['What is the sum of ∑ₙ₌₁∞ 1/[n(n+1)]?', '1. Write each term as 1/n − 1/(n+1); the partial sums telescope.'],
    ],
    [
      ['What does the extreme value theorem guarantee?', 'A continuous real function on a compact interval attains a minimum and a maximum.'],
      ['Is f(x) = |x| continuous at zero?', 'Yes. Its limit at zero equals f(0) = 0.'],
      ['When is a discontinuity at a removable?', 'When the finite limit at a exists; assigning that limit to f(a) makes the function continuous there.'],
      ['Is 1/x uniformly continuous on (0,1)?', 'No. Inputs can be arbitrarily close near zero while their reciprocals stay far apart.'],
      ['What does the Heine–Cantor theorem say?', 'Every continuous function on a compact metric space is uniformly continuous.'],
    ],
    [
      ['State the chain rule.', '(f ∘ g)′(x) = f′(g(x))g′(x), assuming the needed derivatives exist.'],
      ['What is the derivative of ln x for x > 0?', '1/x.'],
      ['State the mean value theorem.', 'If f is continuous on [a,b] and differentiable on (a,b), some c in (a,b) satisfies f′(c) = [f(b) − f(a)]/(b − a).'],
      ['What does f′ > 0 throughout an interval imply?', 'f is strictly increasing on that interval.'],
      ['Must a point with f′(a) = 0 be a local extremum?', 'No. For f(x) = x³, f′(0) = 0 but zero is not a local extremum.'],
    ],
    [
      ['How does reversing integration limits change an integral?', '∫ᵦᵃ f(x) dx = −∫ₐᵇ f(x) dx.'],
      ['If f is continuous, what is the derivative of F(x) = ∫ₐˣ f(t) dt?', 'F′(x) = f(x), by the fundamental theorem of calculus.'],
      ['What is ∫₋ₐᵃ f(x) dx for an integrable odd function?', '0, because the two halves cancel.'],
      ['State integration by parts.', '∫ₐᵇ u v′ dx = [uv]ₐᵇ − ∫ₐᵇ u′v dx, for continuously differentiable u and v.'],
      ['If m ≤ f(x) ≤ M on [a,b], how is its integral bounded?', 'm(b − a) ≤ ∫ₐᵇ f(x) dx ≤ M(b − a), assuming a ≤ b and integrability.'],
    ],
  ],
  'physics-1': [
    [
      ['What is v(t) under constant acceleration?', 'v(t) = v₀ + at.'],
      ['What is x(t) under constant acceleration?', 'x(t) = x₀ + v₀t + ½at².'],
      ['Can speed be constant while acceleration is nonzero?', 'Yes. Uniform circular motion has centripetal acceleration because velocity changes direction.'],
      ['What is the centripetal acceleration at speed v and radius r?', 'a = v²/r, directed toward the circle’s center.'],
      ['What does the signed area under a velocity–time graph represent?', 'Displacement over that time interval.'],
    ],
    [
      ['What defines an inertial reference frame?', 'A frame in which a force-free body moves with constant velocity.'],
      ['What is the weight of a mass m near Earth’s surface?', 'The gravitational force mg, directed downward.'],
      ['What is the maximum static friction in the Coulomb model?', 'fₛ,max = μₛN; the actual static friction can be smaller.'],
      ['What is the normal force on a stationary mass on an incline of angle θ?', 'N = mg cos θ, if no other forces act perpendicular to the incline.'],
      ['Why do a third-law force pair not cancel on one free-body diagram?', 'Each force acts on a different body; a free-body diagram contains forces on only one body.'],
    ],
    [
      ['How is a conservative force related to potential energy in one dimension?', 'F(x) = −dU/dx.'],
      ['When is mechanical energy K + U conserved?', 'When only conservative forces do work on the system.'],
      ['What is the elastic potential energy of an ideal spring?', 'U = ½kx², measured from its unstretched equilibrium.'],
      ['What is instantaneous mechanical power?', 'P = F · v for the power delivered by a force.'],
      ['How much work does a force perpendicular to displacement do?', 'Zero, since their dot product is zero.'],
    ],
    [
      ['Is kinetic energy conserved in a perfectly inelastic collision?', 'No. The bodies stick together; momentum is conserved for an isolated system, but kinetic energy generally decreases.'],
      ['What additionally distinguishes an elastic collision?', 'Total kinetic energy is conserved.'],
      ['How does the center of mass of an isolated system move?', 'With constant velocity.'],
      ['What is the SI unit of impulse?', 'N·s, equivalent to kg·m/s.'],
      ['A mass m at speed v sticks to an identical stationary mass. What is their final speed?', 'v/2, by conservation of momentum.'],
    ],
    [
      ['What differential equation describes an undamped ideal mass–spring oscillator?', 'm x″ + kx = 0, with x measured from equilibrium.'],
      ['What is the period of an ideal mass–spring oscillator?', 'T = 2π√(m/k).'],
      ['What is the small-angle period of a simple pendulum?', 'T ≈ 2π√(ℓ/g), neglecting damping.'],
      ['Where is the speed largest in simple harmonic motion?', 'At equilibrium, where the potential energy is smallest.'],
      ['What is resonance in a driven oscillator?', 'A large steady-state response near a natural frequency; damping limits the amplitude.'],
    ],
  ],
  'programming-1': [
    [
      ['How does assignment differ from an equality comparison?', 'Assignment stores or binds a value; comparison computes whether two values are equal.'],
      ['What is a variable’s scope?', 'The region of a program where its binding can be accessed.'],
      ['What is integer overflow?', 'A result exceeds the representable integer range. The resulting behavior depends on the language and integer type.'],
      ['Why can floating-point arithmetic introduce rounding error?', 'A finite binary representation cannot exactly represent most real numbers, including many decimal fractions.'],
      ['What is a type conversion?', 'Changing a value’s representation from one type to another, potentially losing information.'],
    ],
    [
      ['What does continue do in a loop?', 'It skips the rest of the current iteration and proceeds to the next iteration step.'],
      ['What is a loop invariant?', 'A property true before and after every iteration, used to reason about correctness.'],
      ['What is an off-by-one error?', 'A boundary mistake that performs one iteration too many or too few, or accesses a neighboring index.'],
      ['What is short-circuit evaluation of Boolean AND?', 'The second operand is evaluated only if the first is true.'],
      ['How many iterations does for (let i = 0; i < 5; i++) perform?', 'Five, with i equal to 0, 1, 2, 3 and 4.'],
    ],
    [
      ['How does an argument differ from a parameter?', 'An argument is the value supplied at a call; a parameter is the named input in the definition.'],
      ['What makes a function pure?', 'Its result depends only on its inputs and it has no observable side effects.'],
      ['What is a call stack?', 'The stack of active function calls, including their return locations and local state.'],
      ['What causes a stack overflow in unbounded recursion?', 'Each nested call consumes stack space until the available stack capacity is exhausted.'],
      ['What is a function’s base case in recursion?', 'An input case solved directly without another recursive call.'],
    ],
    [
      ['What is the time complexity of binary search on a sorted array?', 'O(log n) comparisons, assuming constant-time indexed access.'],
      ['What is the time complexity of reading an array element by index?', 'O(1) for a conventional random-access array.'],
      ['What does a stable sorting algorithm preserve?', 'The original relative order of elements with equal sort keys.'],
      ['What is the worst-case time complexity of merge sort?', 'O(n log n).'],
      ['What does auxiliary space complexity measure?', 'The extra memory an algorithm uses beyond its input storage.'],
    ],
  ],
};
for (const subject of subjects) {
  subject.lectures.forEach((lesson, lessonIndex) => {
    for (const [index, [front, back]] of (practice[subject.id]?.[lessonIndex] ?? []).entries()) {
      lesson.cards.push({ id: `practice-${index + 4}`, front, back });
    }
  });
}
