# Writing cards for recall

Apply the minimum information principle: one fact or one decision per card. A question should name its context and admit one clear answer. Prefer a short answer that can be checked quickly; aim for 15–40 words, with 40 as the maximum. Shorter formulas and definitions are welcome. Split a multi-part answer instead of compressing a paragraph into fragments.

- **Definition:** ask for the distinguishing property, not a circular paraphrase.
- **Theorem:** include hypotheses and ask for one consequence; split hypotheses, conclusion and applicability when necessary.
- **Method:** supply concrete inputs and ask for one step or result. Put long derivations in the notes, not on one card.
- **Why:** ask for the single causal reason or counterexample, not an essay.
- **Sets/enumerations:** avoid “List the seven…”. Ask separate distinguishing questions. Cloze can help in other tools, but Flipwise's current Basic-card generator does not implement cloze; rewrite it into a direct question.

Do not leak the answer through the question (“Why does the conserved momentum stay constant?”). Include necessary context without giving away the tested fact. Add concrete examples and counterexamples when they test a useful distinction. Do not generate near-duplicates or memorize incidental phrasing.

Use `\( ... \)` for inline math and `\[ ... \]` for display math. In JSON these backslashes must be escaped: `"\\(x^2\\)"`. Use `<b>`, `<i>`, `<code>` and `<br>` sparingly. Markdown `**bold**` and backticks are not the imported Anki renderer's formatting syntax. Source links belong in `source`, not in the question.

Use flat tags such as `core`, `coverage`, `definition`, `theorem`, `method`, `why`, `counterexample` and `exam`. Assign `exam` only when the source or user identifies exam relevance. Tags use letters, digits, underscores or hyphens; no spaces inside one tag.

| Topic | Bad | Better |
| --- | --- | --- |
| Math | State everything about convergent sequences. | Q: Can a convergent real sequence have two distinct limits? A: No. If two limits differed, disjoint sufficiently small neighborhoods would eventually both have to contain every term, which is impossible. |
| Math | Why is the limit unique because neighborhoods become disjoint? | Q: Which property of real limits rules out two distinct limits? A: Uniqueness: disjoint neighborhoods around distinct proposed limits contradict the requirement that all sufficiently late terms lie in both neighborhoods. |
| Physics | List all the laws of motion and explain them. | Q: What acceleration does a net force of \(6\,\mathrm N\) produce on a \(2\,\mathrm{kg}\) mass? A: \(3\,\mathrm{m/s^2}\), from \(a=F_{net}/m\), assuming a constant mass in an inertial reference frame. |
| Programming | What are scope, types, functions, and loops? | Q: In Python, what does <code>continue</code> do inside a loop? A: It skips the remaining statements of the current iteration and proceeds with the next iteration, if another iteration is available. |

An agent should verify each answer against the selected note. If a source omits a needed assumption or conflicts with another note, report that gap and avoid presenting a guess as a theorem.
