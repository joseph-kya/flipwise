export interface NoteHeading {
  id: string;
  text: string;
  level: number;
}

export interface NoteLectureMeta {
  slug: string;
  courseSlug: string;
  fileName: string;
  number: string | null;
  title: string;
  excerpt: string;
  wordCount: number;
  readingMinutes: number;
  headings: NoteHeading[];
}

export interface NoteCourseMeta {
  slug: string;
  name: string;
  lectureCount: number;
  totalWordCount: number;
  totalReadingMinutes: number;
  lectures: NoteLectureMeta[];
}

export interface NotesIndex {
  version: 1;
  courses: NoteCourseMeta[];
}

export interface NoteNeighbor {
  slug: string;
  title: string;
  number: string | null;
}

export interface NoteDocument {
  version: 1;
  courseSlug: string;
  courseName: string;
  slug: string;
  fileName: string;
  number: string | null;
  title: string;
  subtitleHtml?: string;
  buildsOnHtml?: string;
  wordCount: number;
  readingMinutes: number;
  headings: NoteHeading[];
  html: string;
  prev?: NoteNeighbor;
  next?: NoteNeighbor;
}
