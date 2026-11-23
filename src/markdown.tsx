import { Fragment, type ReactNode } from 'react';

function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g).map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) return <strong key={i}>{part.slice(2, -2)}</strong>;
    if (part.startsWith('*') && part.endsWith('*')) return <em key={i}>{part.slice(1, -1)}</em>;
    if (part.startsWith('`') && part.endsWith('`')) return <code key={i}>{part.slice(1, -1)}</code>;
    return part;
  });
}

const cells = (line: string) => line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(cell => cell.trim());
const separator = (line: string) => cells(line).every(cell => /^:?-{3,}:?$/.test(cell));

export function Markdown({ text }: { text: string }) {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const blocks: ReactNode[] = [];
  let i = 0;
  while (i < lines.length) {
    if (!lines[i].trim()) { i++; continue; }
    const key = i;
    if (lines[i].includes('|') && i + 1 < lines.length && separator(lines[i + 1])) {
      const headers = cells(lines[i]);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && lines[i].trim() && lines[i].includes('|')) rows.push(cells(lines[i++]));
      blocks.push(<div className="table-scroll" key={key} role="region" aria-label="Answer table" tabIndex={0}><table><thead><tr>{headers.map((cell, n) => <th scope="col" key={n}>{inline(cell)}</th>)}</tr></thead><tbody>{rows.map((row, n) => <tr key={n}>{headers.map((_, col) => <td key={col}>{inline(row[col] || '')}</td>)}</tr>)}</tbody></table></div>);
    } else if (/^\s*[-*+]\s+/.test(lines[i])) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*+]\s+/.test(lines[i])) items.push(lines[i++].replace(/^\s*[-*+]\s+/, ''));
      blocks.push(<ul key={key}>{items.map((item, n) => <li key={n}>{inline(item)}</li>)}</ul>);
    } else {
      const paragraph: string[] = [];
      while (i < lines.length && lines[i].trim()) {
        if (paragraph.length && (/^\s*[-*+]\s+/.test(lines[i]) || (lines[i].includes('|') && i + 1 < lines.length && separator(lines[i + 1])))) break;
        paragraph.push(lines[i++]);
      }
      blocks.push(<p key={key}>{paragraph.map((line, n) => <Fragment key={n}>{n > 0 && <br/>}{inline(line)}</Fragment>)}</p>);
    }
  }
  return <div className="markdown">{blocks}</div>;
}
