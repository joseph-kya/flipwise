import { stableCardId } from '../anki/types';
import { subjects as demoSubjects } from '../demoSubjects';
import { makeIsSyncable } from './merge';

/** Every built-in demo card id. Reviews of these (and `demo: true` entries) are never uploaded. */
export const DEMO_CARD_IDS: ReadonlySet<string> = new Set(
  demoSubjects.flatMap((s) => s.lectures.flatMap((l) => l.cards.map((c) => stableCardId(s.id, l.id, c)))),
);

export const isSyncableReview = makeIsSyncable(DEMO_CARD_IDS);
