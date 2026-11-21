// Fast drop-in for csv-reader 1.0.0 (make.fun's own CSV reader).
//
// Same answers, faster. The reference reads one character at a time and builds
// every field up a character at a time; this one finds each field's end with
// native indexOf jumps and takes the field as one slice where nothing in it
// needs rewriting. The slow paths run only for broken fields: stray CRs,
// doubled quotes, CRs inside quotes, quote junk and unterminated quotes. No
// regex, no per-character string building, and nothing allocated in the common
// path beyond the field strings and the result arrays themselves.
//
// Semantics (mirroring the reference exactly):
// - a U+FEFF at the very start is dropped;
// - a record ends at LF or CRLF; a line left with no characters is no record;
// - outside quotes a CR not followed by LF is dropped (stray_cr);
// - a field that opens with a quote runs to the next quote that is not doubled,
//   "" inside it is one quote, each CRLF or lone CR inside it is read as LF;
//   what follows its closing quote, up to the next comma or line break, is
//   appended as it stands (quote_junk, when the field ends);
// - a quote that never closes is a literal character and the text after it is
//   read again as unquoted (unterminated_quote);
// - a quote inside an unquoted field is a literal character;
// - fields stay strings, never trimmed or converted;
// - columns is the first record when header is true, else null; rows holds the
//   records after it, each padded (short_row) or cut (long_row) to the first
//   record's width;
// - each error is {code, line, row}, in the order met; line is the 1-based line
//   its record starts on (every LF, CRLF and lone CR inside quotes counted),
//   row its record's index in rows (null for the header).
const COMMA = 44;
const LF = 10;
const CR = 13;
const QUOTE = 34;
const BOM = 0xfeff;

function buildQuoted(text, start, end) {
  let value = '';
  let i = start;
  while (i < end) {
    const c = text.charCodeAt(i);
    if (c === QUOTE) { value += '"'; i += 2; continue; }
    if (c === CR) { value += '\n'; i += text.charCodeAt(i + 1) === LF ? 2 : 1; continue; }
    let j = i;
    while (j < end) {
      const d = text.charCodeAt(j);
      if (d === QUOTE || d === CR) break;
      j += 1;
    }
    value += text.slice(i, j);
    i = j;
  }
  return value;
}

export function run(input) {
  const text = String(input.text);
  const header = input.header === true;
  const n = text.length;
  const errors = [];
  const rows = [];
  let columns = null;
  let width = -1;
  let pos = 0;
  let line = 1;
  if (n > 0 && text.charCodeAt(0) === BOM) pos = 1;

  while (true) {
    while (pos < n) {
      const c = text.charCodeAt(pos);
      if (c === LF) { pos += 1; line += 1; }
      else if (c === CR && text.charCodeAt(pos + 1) === LF) { pos += 2; line += 1; }
      else break;
    }
    if (pos >= n) break;
    const recordLine = line;
    const recordRow = header && columns === null ? null : rows.length;
    const fields = [];
    let quoted = false;
    for (;;) {
      let value;
      let endedComma;
      let scanInit = null;
      let isJunk = false;
      if (text.charCodeAt(pos) === QUOTE) {
        quoted = true;
        const open = pos;
        const openLine = line;
        pos += 1;
        const start = pos;
        let closed = false;
        let hasEscape = false;
        let closeIdx = -1;
        // Jump to the next quote; a doubled quote is content, not the close.
        let scan = pos;
        while (true) {
          const q = text.indexOf('"', scan);
          if (q === -1) break;
          if (text.charCodeAt(q + 1) === QUOTE) { hasEscape = true; scan = q + 2; continue; }
          closed = true; closeIdx = q; break;
        }
        if (closed) {
          // Count the line breaks inside the quotes: each LF and each CR
          // counts once, a CRLF once together.
          let lf = 0, cr = 0, crlf = 0;
          let p = start;
          while (true) {
            const i = text.indexOf('\n', p);
            if (i === -1 || i >= closeIdx) break;
            lf += 1; p = i + 1;
          }
          p = start;
          while (true) {
            const i = text.indexOf('\r', p);
            if (i === -1 || i >= closeIdx) break;
            cr += 1;
            if (text.charCodeAt(i + 1) === LF) crlf += 1;
            p = i + 1;
          }
          line += lf + cr - crlf;
          if (cr > 0) hasEscape = true;
          pos = closeIdx + 1;
        }
        if (!closed) {
          pos = open + 1;
          line = openLine;
          errors.push({ code: 'unterminated_quote', line: recordLine, row: recordRow });
          scanInit = '"';
        } else {
          value = hasEscape ? buildQuoted(text, start, closeIdx) : text.slice(start, closeIdx);
          if (pos >= n) { endedComma = false; }
          else {
            const c = text.charCodeAt(pos);
            if (c === COMMA) { pos += 1; endedComma = true; }
            else if (c === LF) { pos += 1; line += 1; endedComma = false; }
            else if (c === CR && text.charCodeAt(pos + 1) === LF) { pos += 2; line += 1; endedComma = false; }
            else { scanInit = value; isJunk = true; }
          }
        }
      } else {
        quoted = false;
        scanInit = '';
      }
      if (scanInit !== null) {
        // Unquoted scan via indexOf jumps.
        let seg = null;
        let segStart = pos;
        let added = 0;
        let done = false;
        while (!done) {
          if (pos >= n) {
            if (seg === null) { value = scanInit === '' ? text.slice(segStart, pos) : scanInit + text.slice(segStart, pos); added += pos - segStart; }
            else { seg.push(text.slice(segStart, pos)); added += pos - segStart; value = seg.join(''); }
            endedComma = false;
            done = true;
            break;
          }
          const ic = text.indexOf(',', pos);
          const il = text.indexOf('\n', pos);
          const ir = text.indexOf('\r', pos);
          let m = -1, kind = -1;
          if (ic !== -1) { m = ic; kind = 0; }
          if (il !== -1 && (m === -1 || il < m)) { m = il; kind = 1; }
          if (ir !== -1 && (m === -1 || ir < m)) { m = ir; kind = 2; }
          if (m === -1) {
            if (seg === null) { value = scanInit === '' ? text.slice(segStart, n) : scanInit + text.slice(segStart, n); added += n - segStart; }
            else { seg.push(text.slice(segStart, n)); added += n - segStart; value = seg.join(''); }
            pos = n;
            endedComma = false;
            done = true;
          } else if (kind === 0) {
            if (seg === null) { value = scanInit === '' ? text.slice(segStart, m) : scanInit + text.slice(segStart, m); added += m - segStart; }
            else { seg.push(text.slice(segStart, m)); added += m - segStart; value = seg.join(''); }
            pos = m + 1;
            endedComma = true;
            done = true;
          } else if (kind === 1) {
            if (seg === null) { value = scanInit === '' ? text.slice(segStart, m) : scanInit + text.slice(segStart, m); added += m - segStart; }
            else { seg.push(text.slice(segStart, m)); added += m - segStart; value = seg.join(''); }
            pos = m + 1;
            line += 1;
            endedComma = false;
            done = true;
          } else {
            if (text.charCodeAt(m + 1) === LF) {
              if (seg === null) { value = scanInit === '' ? text.slice(segStart, m) : scanInit + text.slice(segStart, m); added += m - segStart; }
              else { seg.push(text.slice(segStart, m)); added += m - segStart; value = seg.join(''); }
              pos = m + 2;
              line += 1;
              endedComma = false;
              done = true;
            } else {
              errors.push({ code: 'stray_cr', line: recordLine, row: recordRow });
              if (seg === null) seg = [scanInit, text.slice(segStart, m)];
              else seg.push(text.slice(segStart, m));
              added += m - segStart;
              pos = m + 1;
              segStart = pos;
            }
          }
        }
        if (isJunk && added > 0) errors.push({ code: 'quote_junk', line: recordLine, row: recordRow });
      }
      fields.push(value);
      if (!endedComma) break;
    }
    if (fields.length === 1 && fields[0] === '' && !quoted) continue;
    if (width < 0) width = fields.length;
    if (header && columns === null) { columns = fields; continue; }
    if (fields.length < width) {
      errors.push({ code: 'short_row', line: recordLine, row: recordRow, fields: fields.length });
      while (fields.length < width) fields.push('');
    } else if (fields.length > width) {
      errors.push({ code: 'long_row', line: recordLine, row: recordRow, extra: fields.splice(width) });
    }
    rows.push(fields);
  }
  return { columns: header ? (columns ?? []) : null, rows, errors };
}
