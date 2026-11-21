// Fast, exact CSV reader matching csv-reader 1.0.0's parse.
//
// How it works: the whole text is split on '\n' once (native C++), then the
// physical lines are walked. A line with no quotes and no stray carriage
// returns is one whole record whose fields are just the ',' split — no
// per-field work at all. Any other line is split on ',' once and the pieces
// are reassembled: pieces that do not start a quoted field are complete
// fields, and quoted fields are closed with indexOf jumps, un-doubled only
// when a doubled quote is actually present, and junk after the closing quote
// is kept as-is. A quoted field may span lines; the newline inside it
// becomes a single LF in the value. Lone carriage returns inside quotes
// become LF and count as line breaks; lone carriage returns anywhere else
// are dropped and reported as stray_cr. A quote that never closes is treated
// as a literal character and the rest of the field is re-read as unquoted,
// exactly as the reference does.

export function run(input) {
  const text = input.text;
  const header = input.header === true;

  // --- physical lines -------------------------------------------------------
  let lines = text.split('\n');
  const hasTrailingNL = text.length > 0 && text.charCodeAt(text.length - 1) === 10;
  if (hasTrailingNL) lines.pop();
  if (lines.length > 0 && lines[0].length > 0 && lines[0].charCodeAt(0) === 0xfeff) {
    lines[0] = lines[0].slice(1);
  }

  const rows = [];
  const errors = [];
  let cols = null;
  let width = -1;
  let seenFirst = false;
  let nData = 0;
  // Lone CRs seen inside quoted fields so far; each one is an extra line.
  let loneExtra = 0;

  // Record currently being built (null when between records).
  let rec = null;
  let recLine = 0;
  let recRow = null;
  let recHasNonEmpty = false;
  let recHasQuoted = false;
  // Quoted field open across pieces/lines.
  let inQ = false;
  let qVal = '';
  let qLine0 = 0;
  let qPiece0 = 0;
  let qPieceStr = '';

  function finalize(fields, line, row) {
    if (!seenFirst) {
      seenFirst = true;
      width = fields.length;
      if (header) cols = fields;
      else { rows.push(fields); nData++; }
      return;
    }
    if (fields.length < width) {
      const n = fields.length;
      for (let i = n; i < width; i++) fields.push('');
      errors.push({ code: 'short_row', line, row, fields: n });
      rows.push(fields);
      nData++;
    } else if (fields.length > width) {
      const extra = fields.slice(width);
      fields.length = width;
      errors.push({ code: 'long_row', line, row, extra });
      rows.push(fields);
      nData++;
    } else {
      rows.push(fields);
      nData++;
    }
  }

  // Finish a quoted field's raw content: lone CRs become LF (and count as
  // lines), doubled quotes collapse to one.
  function finishQuoted(content) {
    let v = content;
    if (content.indexOf('\r') !== -1) {
      loneExtra += content.split('\r').length - 1;
      v = content.replace(/\r/g, '\n');
    }
    if (v.indexOf('""') !== -1) v = v.split('""').join('"');
    return v;
  }

  // Junk after a closing quote: lone CRs are dropped (one stray_cr each),
  // anything left over is quote_junk.
  function cleanJunk(junk) {
    let j = junk;
    if (junk.indexOf('\r') !== -1) {
      const n = junk.split('\r').length - 1;
      for (let t = 0; t < n; t++) errors.push({ code: 'stray_cr', line: recLine, row: recRow });
      j = junk.replace(/\r/g, '');
    }
    if (j.length > 0) errors.push({ code: 'quote_junk', line: recLine, row: recRow });
    return j;
  }

  // Find the closing quote of a quoted field inside `piece`, starting the
  // search at `from`. A quote followed immediately by another quote is a
  // doubled quote, not a close. Returns the index of the close, or -1.
  function findClose(piece, from) {
    let k = piece.indexOf('"', from);
    while (k !== -1 && piece.charCodeAt(k + 1) === 34) k = piece.indexOf('"', k + 2);
    return k;
  }

  let li = 0;
  let resumeJ = 0;
  outer:
  while (li < lines.length) {
    let line = lines[li];
    const followedByNL = li < lines.length - 1 || hasTrailingNL;
    if (followedByNL && line.length > 0 && line.charCodeAt(line.length - 1) === 13) {
      line = line.slice(0, -1);
    }
    const lineNo = li + 1 + loneExtra;

    if (!inQ && line.length === 0) { li++; resumeJ = 0; continue; }

    const hasQuote = line.indexOf('"') !== -1;
    const hasCR = line.indexOf('\r') !== -1;

    // Clean line: no quotes, no stray CRs, not inside a quoted field. It is
    // one whole record; its fields are the ',' split, nothing more.
    if (!inQ && !hasQuote && !hasCR) {
      const fields = line.split(',');
      finalize(fields, lineNo, header && !seenFirst ? null : nData);
      li++;
      resumeJ = 0;
      continue;
    }

    if (rec === null) {
      rec = [];
      recLine = lineNo;
      recRow = header && !seenFirst ? null : nData;
      recHasNonEmpty = false;
      recHasQuoted = false;
    }
    if (inQ) qVal += '\n';

    const pieces = line.split(',');
    const startJ = resumeJ;
    resumeJ = 0;
    for (let j = startJ; j < pieces.length; j++) {
      const piece = pieces[j];
      if (inQ) {
        // Continuing a quoted field: this piece is more content until a
        // closing quote shows up.
        const k = findClose(piece, 0);
        if (k === -1) {
          if (j > 0) qVal += ',';
          qVal += piece;
          continue;
        }
        if (j > 0) qVal += ',';
        qVal += piece.slice(0, k);
        const val = finishQuoted(qVal) + cleanJunk(piece.slice(k + 1));
        rec.push(val);
        if (val.length > 0) recHasNonEmpty = true;
        recHasQuoted = true;
        inQ = false;
        qVal = '';
        continue;
      }
      // A fresh field starts here.
      if (piece.length > 0 && piece.charCodeAt(0) === 34) {
        // Quoted field opens.
        const k = findClose(piece, 1);
        if (k === -1) {
          qVal = piece.slice(1);
          qLine0 = li;
          qPiece0 = j;
          qPieceStr = piece;
          inQ = true;
          continue;
        }
        const val = finishQuoted(piece.slice(1, k)) + cleanJunk(piece.slice(k + 1));
        rec.push(val);
        if (val.length > 0) recHasNonEmpty = true;
        recHasQuoted = true;
        continue;
      }
      // Unquoted field.
      if (!hasCR) {
        rec.push(piece);
        if (piece.length > 0) recHasNonEmpty = true;
      } else if (piece.indexOf('\r') === -1) {
        rec.push(piece);
        if (piece.length > 0) recHasNonEmpty = true;
      } else {
        const n = piece.split('\r').length - 1;
        for (let t = 0; t < n; t++) errors.push({ code: 'stray_cr', line: recLine, row: recRow });
        const v = piece.replace(/\r/g, '');
        rec.push(v);
        if (v.length > 0) recHasNonEmpty = true;
      }
    }

    if (inQ) {
      if (li === lines.length - 1) {
        // No closing quote anywhere in the text: the field is unterminated.
        // The quote is literal and the rest of the field is re-read unquoted.
        errors.push({ code: 'unterminated_quote', line: recLine, row: recRow });
        let rest = qPieceStr.slice(1);
        if (rest.indexOf('\r') !== -1) {
          const n = rest.split('\r').length - 1;
          for (let t = 0; t < n; t++) errors.push({ code: 'stray_cr', line: recLine, row: recRow });
          rest = rest.replace(/\r/g, '');
        }
        const val = '"' + rest;
        rec.push(val);
        if (val.length > 0) recHasNonEmpty = true;
        inQ = false;
        qVal = '';
        // Rewind to just after the opening quote: the pieces after it, and
        // the lines that were swallowed as quoted content, are parsed again
        // as ordinary text.
        li = qLine0;
        resumeJ = qPiece0 + 1;
        continue outer;
      }
      li++;
      continue;
    }

    // The record ends at this line.
    if (rec.length > 1 || recHasNonEmpty || recHasQuoted) finalize(rec, recLine, recRow);
    rec = null;
    li++;
  }

  return { columns: header ? (cols === null ? [] : cols) : null, rows, errors };
}
