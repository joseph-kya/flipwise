import robotics from '../decks/intro-to-robotics.flipwise.json';

export interface DemoCard { id: string; front: string; back: string }
export interface Lecture { id: string; title: string; cards: DemoCard[] }
export interface Subject { id: string; name: string; total: number; lectures: Lecture[] }

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

// Add recall from the other direction and explanation practice to each short demo lesson.
for (const subject of subjects) {
  for (const lesson of subject.lectures) {
    const originals = [...lesson.cards];
    for (let i = lesson.cards.length; i < 8; i++) {
      const source = originals[(i - originals.length) % originals.length];
      const answer = source.back.split('\n\n')[0];
      lesson.cards.push({
        id: `practice-${i + 1}`,
        front: i < 6 ? `Which concept in ${lesson.title} does this describe?\n\n${answer}` : `Explain the reasoning behind this answer in your own words:\n\n${answer}`,
        back: `**Recall prompt:** ${source.front}\n\n${answer}\n\n${i < 6 ? 'Connect the definition to its name, then recall it without the cue.' : 'A complete explanation should state the relevant definition and the assumptions that make this statement valid.'}`,
      });
    }
  }
}
