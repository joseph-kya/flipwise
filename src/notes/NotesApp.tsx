import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import katex from 'katex';
import type { EffectiveMotion } from '../settings';
import { plural } from '../plural';
import {
  Button,
  ChevronLeft,
  ChevronRight,
  Group,
  PageHeader,
  Sheet,
  SubjectTile,
  subjectColor,
} from '../ui';
import { fetchNoteDocument, fetchNotesIndex, type NoteOpenTarget } from './sourceLink';
import type { NoteCourseMeta, NoteDocument, NoteHeading, NotesIndex } from './types';
import './notes.css';

function formatReadingDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function ListIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 7h16M4 12h12M4 17h14" />
    </svg>
  );
}

function SearchIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}

function NotesCourseList({
  index,
  onSelectNote,
}: {
  index: NotesIndex;
  onSelectNote?: (target: NoteOpenTarget) => void;
}) {
  const [query, setQuery] = useState('');
  const trimmed = query.trim().toLowerCase();

  const totalLectures = index.courses.reduce((sum, c) => sum + c.lectureCount, 0);

  const searchResults = useMemo(() => {
    if (!trimmed) return [];
    const matches: Array<{
      course: NoteCourseMeta;
      lectureSlug: string;
      lectureTitle: string;
      number: string | null;
      heading?: NoteHeading;
      readingMinutes: number;
    }> = [];

    for (const course of index.courses) {
      for (const lec of course.lectures) {
        const titleHit =
          lec.title.toLowerCase().includes(trimmed) ||
          course.name.toLowerCase().includes(trimmed);
        const headingHit = lec.headings.find((h) => h.text.toLowerCase().includes(trimmed));
        if (titleHit || headingHit) {
          matches.push({
            course,
            lectureSlug: lec.slug,
            lectureTitle: lec.title,
            number: lec.number,
            heading: titleHit ? undefined : headingHit,
            readingMinutes: lec.readingMinutes,
          });
        }
        if (matches.length >= 24) return matches;
      }
    }
    return matches;
  }, [index, trimmed]);

  return (
    <div className="section-stack notes-shell">
      <PageHeader
        eyebrow="Semester 1"
        title="Notes"
        subtitle={`${plural(index.courses.length, 'course')} · ${plural(totalLectures, 'lecture')}`}
      />

      <div className="notes-search-wrap">
        <SearchIcon size={16} />
        <input
          type="search"
          className="notes-search-input"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter lectures or topics…"
          aria-label="Filter lecture notes"
        />
        {query && (
          <button
            type="button"
            className="notes-search-clear"
            onClick={() => setQuery('')}
            aria-label="Clear filter"
          >
            Clear
          </button>
        )}
      </div>

      {trimmed ? (
        searchResults.length > 0 ? (
          <Group ariaLabel="Matching lecture notes">
            {searchResults.map((hit, i) => {
              const href = `#/notes/${hit.course.slug}/${hit.lectureSlug}${hit.heading ? `#${hit.heading.id}` : ''}`;
              return (
                <a
                  key={`${hit.course.slug}/${hit.lectureSlug}/${hit.heading?.id ?? i}`}
                  className="group-row group-row-interactive notes-search-hit"
                  href={href}
                  onClick={(e) => {
                    if (onSelectNote) {
                      e.preventDefault();
                      onSelectNote({
                        courseSlug: hit.course.slug,
                        noteSlug: hit.lectureSlug,
                        headingId: hit.heading?.id,
                      });
                    }
                  }}
                >
                  <SubjectTile subjectId={hit.course.slug} name={hit.course.name} size="sm" />
                  <span className="row-main">
                    <span className="row-title">
                      {hit.number ? `${hit.number} · ` : ''}{hit.lectureTitle}
                    </span>
                    <span className="row-sub">
                      {hit.course.name}
                      {hit.heading ? ` › ${hit.heading.text}` : ` · ${hit.readingMinutes} min`}
                    </span>
                  </span>
                  <ChevronRight size={15} className="row-chevron" />
                </a>
              );
            })}
          </Group>
        ) : (
          <Group divider={false} padded ariaLabel="No matching notes">
            <p className="notes-empty">No lectures or headings match “{query.trim()}”.</p>
          </Group>
        )
      ) : (
        <div className="notes-course-grid">
          {index.courses.map((course, i) => (
            <a
              key={course.slug}
              href={`#/notes/${course.slug}`}
              className="notes-course-card stagger-item"
              style={{ '--i': Math.min(i, 7), '--subject': subjectColor(course.slug, course.name) } as CSSProperties}
            >
              <div className="notes-course-top">
                <SubjectTile subjectId={course.slug} name={course.name} size="md" />
                <ChevronRight size={16} className="row-chevron" />
              </div>
              <div className="notes-course-body">
                <h2 className="notes-course-title">{course.name}</h2>
                <p className="notes-course-meta tabular">
                  {plural(course.lectureCount, 'lecture')} · {formatReadingDuration(course.totalReadingMinutes)} read
                </p>
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

function NotesLectureList({ course }: { course: NoteCourseMeta }) {
  return (
    <div
      className="section-stack notes-shell"
      style={{ '--subject': subjectColor(course.slug, course.name) } as CSSProperties}
    >
      <PageHeader
        backHref="#/notes"
        backLabel="Notes"
        title={course.name}
        subtitle={`${plural(course.lectureCount, 'lecture')} · ${formatReadingDuration(course.totalReadingMinutes)} read`}
      />

      <Group ariaLabel={`${course.name} lectures`}>
        {course.lectures.map((lec, i) => (
          <a
            key={lec.slug}
            href={`#/notes/${course.slug}/${lec.slug}`}
            className="notes-lecture-row stagger-item"
            style={{ '--i': Math.min(i, 7) } as CSSProperties}
          >
            <span className="notes-lecture-num tabular" aria-hidden="true">
              {lec.number ?? '·'}
            </span>
            <span className="notes-lecture-main">
              <span className="notes-lecture-title">{lec.title}</span>
              {lec.excerpt && <span className="notes-lecture-excerpt">{lec.excerpt}</span>}
            </span>
            <span className="notes-lecture-right">
              <span className="notes-lecture-time tabular">{lec.readingMinutes} min</span>
              <ChevronRight size={15} className="row-chevron" />
            </span>
          </a>
        ))}
      </Group>
    </div>
  );
}

/** Hydrate compact math placeholders (<span class="m"> and <div class="mb">) with KaTeX. */
function hydrateNoteDom(container: HTMLElement, courseSlug: string, noteSlug: string) {
  const inlineMath = Array.from(container.querySelectorAll<HTMLElement>('span.m'));
  for (const el of inlineMath) {
    if (el.dataset.katexDone) continue;
    const tex = el.textContent ?? '';
    katex.render(tex, el, { displayMode: false, throwOnError: false, strict: 'ignore', trust: false });
    el.dataset.katexDone = '1';
  }

  const blockMath = Array.from(container.querySelectorAll<HTMLElement>('div.mb'));
  for (const el of blockMath) {
    if (el.dataset.katexDone) continue;
    const tex = el.textContent ?? '';
    katex.render(tex, el, { displayMode: true, throwOnError: false, strict: 'ignore', trust: false });
    el.setAttribute('role', 'region');
    el.setAttribute('aria-label', 'Equation');
    el.tabIndex = 0;
    el.dataset.katexDone = '1';
  }

  const tables = Array.from(container.querySelectorAll<HTMLElement>('div.ts'));
  for (const el of tables) {
    if (!el.hasAttribute('role')) {
      el.setAttribute('role', 'region');
      el.setAttribute('aria-label', 'Table');
      el.tabIndex = 0;
    }
  }

  const headings = Array.from(container.querySelectorAll<HTMLElement>('h2[id], h3[id], h4[id]'));
  for (const h of headings) {
    if (h.querySelector('.note-anchor')) continue;
    const anchor = document.createElement('a');
    anchor.className = 'note-anchor';
    anchor.href = `#/notes/${courseSlug}/${noteSlug}#${h.id}`;
    anchor.setAttribute('aria-label', `Link to ${h.textContent?.trim() ?? 'section'}`);
    anchor.textContent = '#';
    h.appendChild(anchor);
  }
}

export function NoteReader({
  courseSlug,
  noteSlug,
  headingId,
  motion,
  scrollContainer,
  backHref,
  backLabel,
  onBack,
  onNavigateNote,
}: {
  courseSlug: string;
  noteSlug: string;
  headingId?: string;
  motion: EffectiveMotion;
  scrollContainer?: HTMLElement | null;
  backHref?: string;
  backLabel: string;
  onBack?: () => void;
  onNavigateNote?: (target: NoteOpenTarget) => void;
}) {
  const [doc, setDoc] = useState<NoteDocument | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [activeHeading, setActiveHeading] = useState<string>('');
  const [tocOpen, setTocOpen] = useState(false);

  const articleRef = useRef<HTMLDivElement>(null);
  const subtitleRef = useRef<HTMLParagraphElement>(null);
  const buildsOnRef = useRef<HTMLDivElement>(null);
  const flashTimerRef = useRef<number | null>(null);

  useEffect(() => {
    let active = true;
    setStatus('loading');
    void fetchNoteDocument(courseSlug, noteSlug).then((loaded) => {
      if (!active) return;
      if (!loaded) {
        setDoc(null);
        setStatus('error');
        return;
      }
      setDoc(loaded);
      setStatus('ready');
    });
    return () => {
      active = false;
    };
  }, [courseSlug, noteSlug]);

  const scrollToHeading = (targetId: string, highlight = true) => {
    const root = articleRef.current;
    if (!root) return;
    const escaped = typeof CSS !== 'undefined' && typeof CSS.escape === 'function' ? CSS.escape(targetId) : targetId;
    const target = root.querySelector<HTMLElement>(`#${escaped}`);
    if (!target) return;

    const behavior: ScrollBehavior = motion === 'full' ? 'smooth' : 'auto';
    target.scrollIntoView({ behavior, block: 'start' });
    setActiveHeading(targetId);

    if (highlight) {
      root.querySelectorAll('.note-heading-flash').forEach((n) => n.classList.remove('note-heading-flash'));
      // Trigger reflow so repeated clicks re-flash cleanly
      void target.offsetWidth;
      target.classList.add('note-heading-flash');
      if (flashTimerRef.current) window.clearTimeout(flashTimerRef.current);
      flashTimerRef.current = window.setTimeout(() => {
        target.classList.remove('note-heading-flash');
      }, 2000);
    }
  };

  // Hydrate KaTeX synchronously right after DOM update, then scroll to target heading
  useLayoutEffect(() => {
    if (status !== 'ready' || !doc) return;
    if (subtitleRef.current) hydrateNoteDom(subtitleRef.current, doc.courseSlug, doc.slug);
    if (buildsOnRef.current) hydrateNoteDom(buildsOnRef.current, doc.courseSlug, doc.slug);
    if (articleRef.current) hydrateNoteDom(articleRef.current, doc.courseSlug, doc.slug);

    if (headingId) {
      scrollToHeading(headingId, true);
    } else if (scrollContainer) {
      scrollContainer.scrollTo({ top: 0, behavior: 'auto' });
    } else {
      window.scrollTo(0, 0);
    }

    return () => {
      if (flashTimerRef.current) window.clearTimeout(flashTimerRef.current);
    };
  }, [doc, status, headingId]);

  // Scrollspy for desktop TOC
  useEffect(() => {
    if (status !== 'ready' || !doc || !articleRef.current || typeof IntersectionObserver === 'undefined') return;
    const nodes = Array.from(articleRef.current.querySelectorAll<HTMLElement>('h2[id], h3[id], h4[id]'));
    if (nodes.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible.length > 0) {
          setActiveHeading(visible[0].target.id);
        }
      },
      {
        root: scrollContainer ?? null,
        rootMargin: '-72px 0px -68% 0px',
        threshold: 0,
      },
    );
    for (const n of nodes) observer.observe(n);
    return () => observer.disconnect();
  }, [doc, status, scrollContainer]);

  // Intercept internal #/notes/... link clicks when inside study overlay or same-note anchor
  const handleContentClick = (e: React.MouseEvent<HTMLElement>) => {
    const link = (e.target as HTMLElement).closest('a');
    if (!link) return;
    const href = link.getAttribute('href') ?? '';
    if (!href.startsWith('#/notes/')) return;

    const rest = href.slice('#/notes/'.length);
    const hashIdx = rest.indexOf('#');
    const pathPart = hashIdx >= 0 ? rest.slice(0, hashIdx) : rest;
    const targetHeading = hashIdx >= 0 ? decodeURIComponent(rest.slice(hashIdx + 1)) : undefined;
    const [targetCourse, targetNote] = pathPart.split('/');

    if (targetCourse === courseSlug && targetNote === noteSlug && targetHeading) {
      e.preventDefault();
      scrollToHeading(targetHeading, true);
      if (!onNavigateNote) {
        history.replaceState(null, '', href);
      }
      return;
    }

    if (onNavigateNote && targetCourse && targetNote) {
      e.preventDefault();
      onNavigateNote({
        courseSlug: decodeURIComponent(targetCourse),
        noteSlug: decodeURIComponent(targetNote),
        headingId: targetHeading,
      });
    }
  };

  const tocHeadings = useMemo(
    () => (doc?.headings ?? []).filter((h) => h.level <= 3),
    [doc],
  );

  if (status === 'loading') {
    return (
      <div className="notes-reader-state" role="status" aria-live="polite">
        <div className="notes-skeleton notes-skeleton-title" />
        <div className="notes-skeleton notes-skeleton-line" />
        <div className="notes-skeleton notes-skeleton-line short" />
        <div className="notes-skeleton notes-skeleton-box" />
      </div>
    );
  }

  if (status === 'error' || !doc) {
    return (
      <div className="section-stack notes-shell">
        <PageHeader
          backHref={onBack ? undefined : backHref ?? '#/notes'}
          backLabel={onBack ? undefined : backLabel}
          title="Note not found"
        />
        <Group divider={false} padded>
          <p className="notes-empty">This lecture note could not be loaded.</p>
          <div className="notes-error-actions">
            {onBack ? (
              <Button variant="secondary" onClick={onBack}>{backLabel}</Button>
            ) : (
              <Button variant="secondary" href={backHref ?? '#/notes'}>Back to notes</Button>
            )}
          </div>
        </Group>
      </div>
    );
  }

  const accentStyle = { '--subject': subjectColor(doc.courseSlug, doc.courseName) } as CSSProperties;

  const renderTocList = (closeSheet?: boolean) => (
    <nav className="notes-toc-list" aria-label="Table of contents">
      {tocHeadings.map((h) => {
        const isCurrent = activeHeading === h.id;
        return (
          <a
            key={h.id}
            href={`#/notes/${doc.courseSlug}/${doc.slug}#${h.id}`}
            className={`notes-toc-link notes-toc-l${h.level}${isCurrent ? ' is-active' : ''}`}
            aria-current={isCurrent ? 'location' : undefined}
            onClick={(e) => {
              e.preventDefault();
              if (closeSheet) setTocOpen(false);
              scrollToHeading(h.id, true);
              if (!onNavigateNote) {
                history.replaceState(null, '', `#/notes/${doc.courseSlug}/${doc.slug}#${h.id}`);
              }
            }}
          >
            {h.text}
          </a>
        );
      })}
    </nav>
  );

  return (
    <div className="notes-reader-root" style={accentStyle}>
      <div className="notes-reader-bar">
        {onBack ? (
          <button type="button" className="back-link notes-bar-back" onClick={onBack}>
            <ChevronLeft size={16} />
            {backLabel}
          </button>
        ) : (
          <a className="back-link notes-bar-back" href={backHref ?? `#/notes/${doc.courseSlug}`}>
            <ChevronLeft size={16} />
            {backLabel}
          </a>
        )}

        {tocHeadings.length > 0 && (
          <button
            type="button"
            className="notes-toc-trigger"
            onClick={() => setTocOpen(true)}
            aria-haspopup="dialog"
            aria-expanded={tocOpen}
          >
            <ListIcon size={15} />
            <span>Contents</span>
          </button>
        )}
      </div>

      <div className="notes-reader-layout">
        <article className="notes-article" onClick={handleContentClick}>
          <header className="notes-article-head">
            <div className="notes-article-eyebrow">
              <span className="notes-course-dot" aria-hidden="true" />
              {onNavigateNote ? (
                <span>{doc.courseName}</span>
              ) : (
                <a href={`#/notes/${doc.courseSlug}`}>{doc.courseName}</a>
              )}
              {doc.number && <span className="notes-eyebrow-sep">· Lecture {doc.number}</span>}
            </div>

            <h1 className="notes-article-title">{doc.title}</h1>

            <div className="notes-article-stats tabular">
              <span>{doc.readingMinutes} min read</span>
              <span aria-hidden="true">·</span>
              <span>{doc.wordCount.toLocaleString()} words</span>
            </div>

            {doc.subtitleHtml && (
              <p
                ref={subtitleRef}
                className="notes-article-subtitle"
                dangerouslySetInnerHTML={{ __html: doc.subtitleHtml }}
              />
            )}

            {doc.buildsOnHtml && (
              <div className="notes-builds-on">
                <span className="notes-builds-label">Builds on</span>
                <div
                  ref={buildsOnRef}
                  className="notes-builds-links"
                  dangerouslySetInnerHTML={{ __html: doc.buildsOnHtml }}
                />
              </div>
            )}
          </header>

          <div
            ref={articleRef}
            className="note-prose"
            dangerouslySetInnerHTML={{ __html: doc.html }}
          />

          {(doc.prev || doc.next) && (
            <nav className="notes-prev-next" aria-label="Adjacent lectures">
              {doc.prev ? (
                <a
                  className="notes-pager-card notes-pager-prev"
                  href={`#/notes/${doc.courseSlug}/${doc.prev.slug}`}
                  onClick={(e) => {
                    if (onNavigateNote && doc.prev) {
                      e.preventDefault();
                      onNavigateNote({ courseSlug: doc.courseSlug, noteSlug: doc.prev.slug });
                    }
                  }}
                >
                  <span className="notes-pager-dir">
                    <ChevronLeft size={14} /> Previous
                  </span>
                  <span className="notes-pager-title">
                    {doc.prev.number ? `${doc.prev.number} · ` : ''}{doc.prev.title}
                  </span>
                </a>
              ) : (
                <span />
              )}
              {doc.next && (
                <a
                  className="notes-pager-card notes-pager-next"
                  href={`#/notes/${doc.courseSlug}/${doc.next.slug}`}
                  onClick={(e) => {
                    if (onNavigateNote && doc.next) {
                      e.preventDefault();
                      onNavigateNote({ courseSlug: doc.courseSlug, noteSlug: doc.next.slug });
                    }
                  }}
                >
                  <span className="notes-pager-dir">
                    Next <ChevronRight size={14} />
                  </span>
                  <span className="notes-pager-title">
                    {doc.next.number ? `${doc.next.number} · ` : ''}{doc.next.title}
                  </span>
                </a>
              )}
            </nav>
          )}
        </article>

        {tocHeadings.length > 0 && (
          <aside className="notes-toc-sidebar" aria-label="On this page">
            <div className="notes-toc-sticky">
              <p className="notes-toc-heading">On this page</p>
              {renderTocList(false)}
            </div>
          </aside>
        )}
      </div>

      <Sheet
        open={tocOpen}
        title="Contents"
        subtitle={doc.title}
        onClose={() => setTocOpen(false)}
      >
        <div className="notes-toc-sheet-body">
          {renderTocList(true)}
        </div>
      </Sheet>
    </div>
  );
}

/** Full-viewport overlay reader launched from a flashcard so the study session stays mounted intact underneath. */
export function NotesOverlay({
  target,
  motion,
  onClose,
  onNavigate,
}: {
  target: NoteOpenTarget;
  motion: EffectiveMotion;
  onClose: () => void;
  onNavigate: (next: NoteOpenTarget) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [onClose]);

  return (
    <div
      className="notes-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Lecture note reader"
    >
      <div ref={scrollRef} className="notes-overlay-scroll">
        <div className="notes-overlay-inner">
          <NoteReader
            courseSlug={target.courseSlug}
            noteSlug={target.noteSlug}
            headingId={target.headingId}
            motion={motion}
            scrollContainer={scrollRef.current}
            backLabel="Back to study"
            onBack={onClose}
            onNavigateNote={onNavigate}
          />
        </div>
      </div>
    </div>
  );
}

/** Main routed Notes destination (#/notes, #/notes/<course>, #/notes/<course>/<note>[#heading]). */
export default function NotesApp({
  courseSlug,
  noteSlug,
  headingId,
  motion,
}: {
  courseSlug?: string;
  noteSlug?: string;
  headingId?: string;
  motion: EffectiveMotion;
}) {
  const [index, setIndex] = useState<NotesIndex | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    void fetchNotesIndex().then((loaded) => {
      if (!active) return;
      if (loaded) setIndex(loaded);
      else setError(true);
    });
    return () => {
      active = false;
    };
  }, []);

  if (error) {
    return (
      <div className="section-stack notes-shell">
        <PageHeader title="Notes" />
        <Group divider={false} padded>
          <p className="notes-empty">Could not load lecture notes. Check your connection and try again.</p>
        </Group>
      </div>
    );
  }

  if (!index) {
    return (
      <div className="section-stack notes-shell" role="status" aria-live="polite">
        <PageHeader eyebrow="Semester 1" title="Notes" />
        <div className="notes-skeleton notes-skeleton-box" />
      </div>
    );
  }

  if (!courseSlug) {
    return <NotesCourseList index={index} />;
  }

  const course = index.courses.find((c) => c.slug === courseSlug);
  if (!course) {
    return (
      <div className="section-stack notes-shell">
        <PageHeader backHref="#/notes" backLabel="Notes" title="Course not found" />
        <Group divider={false} padded>
          <Button variant="secondary" href="#/notes">Browse all courses</Button>
        </Group>
      </div>
    );
  }

  if (!noteSlug) {
    return <NotesLectureList course={course} />;
  }

  return (
    <NoteReader
      courseSlug={course.slug}
      noteSlug={noteSlug}
      headingId={headingId}
      motion={motion}
      backHref={`#/notes/${course.slug}`}
      backLabel={course.name}
    />
  );
}
