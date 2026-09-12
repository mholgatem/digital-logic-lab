// ---------------------------------------------------------------------------
// Theme / cookie boilerplate (same pattern used by every Digital Logic Lab
// module — see CLAUDE.md: utilities are intentionally duplicated per module).
// ---------------------------------------------------------------------------
const THEME_COOKIE = 'dll_theme';
const ADJACENCY_COOKIE = 'dll_kmap_adjacency';

function setCookie(name, value, days) {
  let expires = '';
  if (days) {
    const date = new Date();
    date.setTime(date.getTime() + (days * 24 * 60 * 60 * 1000));
    expires = '; expires=' + date.toUTCString();
  }
  document.cookie = name + '=' + (value || '') + expires + '; path=/';
}

function getCookie(name) {
  const nameEQ = name + '=';
  const ca = document.cookie.split(';');
  for (let i = 0; i < ca.length; i++) {
    let c = ca[i];
    while (c.charAt(0) === ' ') c = c.substring(1, c.length);
    if (c.indexOf(nameEQ) === 0) return c.substring(nameEQ.length, c.length);
  }
  return null;
}

function applyTheme(theme) {
  if (theme === 'dark') {
    document.body.classList.add('dark');
    document.body.classList.remove('light');
    const toggle = document.getElementById('darkModeToggle');
    if (toggle) toggle.checked = true;
  } else {
    document.body.classList.add('light');
    document.body.classList.remove('dark');
    const toggle = document.getElementById('darkModeToggle');
    if (toggle) toggle.checked = false;
  }
}

function initTheme() {
  const savedTheme = getCookie(THEME_COOKIE) || 'light';
  applyTheme(savedTheme);
}

// ---------------------------------------------------------------------------
// K-map core logic ported from FiniteStateMachine/app.js. These functions are
// unchanged from the FSM module — they operate purely on a plain kmap-like
// object ({ variables, direction, cells }) and never touched FSM globals.
// ---------------------------------------------------------------------------
function escapeHtml(str) {
  return str.replace(/[&<>]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[ch]));
}

function stripOverlines(text) {
  return (text || '').replace(/̅/g, '');
}

function applyOverline(text) {
  return (text || '')
    .split('')
    .map((ch) => (ch.trim() ? `${ch}̅` : ch))
    .join('');
}

function formatScriptedText(text) {
  let result = '';
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (ch === '_' || ch === '^') {
      const cls = ch === '_' ? 'subscript-text' : 'superscript-text';
      let start = i + 1;
      let end = start;
      while (end < text.length && /[A-Za-z0-9+]/.test(text[end])) end += 1;
      const segment = text.slice(start, end) || text[start] || '';
      if (segment) {
        result += `<span class="${cls}">${escapeHtml(segment)}</span>`;
      }
      i = end;
      continue;
    }
    result += escapeHtml(ch);
    i += 1;
  }
  return result;
}

function grayCode(bits) {
  if (bits <= 0) return [''];
  let codes = ['0', '1'];
  for (let i = 1; i < bits; i += 1) {
    const reflected = [...codes].reverse();
    codes = codes.map((c) => `0${c}`).concat(reflected.map((c) => `1${c}`));
  }
  return codes;
}

function buildKmapLayout(kmap) {
  const variables = kmap.variables || [];
  const mapVarCount = Math.max(0, variables.length - 4);
  const mapVars = variables.slice(0, mapVarCount);
  const coreVars = variables.slice(mapVarCount);
  const moreSigCount = Math.ceil(coreVars.length / 2);
  let moreSig = coreVars.slice(0, moreSigCount);
  let lessSig = coreVars.slice(moreSigCount);
  if (lessSig.length === 0 && moreSig.length > 1) {
    lessSig = [moreSig.pop()];
  }
  let rowVars;
  let colVars;
  if (kmap.direction === 'vertical') {
    rowVars = moreSig;
    colVars = lessSig;
  } else {
    rowVars = lessSig;
    colVars = moreSig;
  }
  if (rowVars.length === 0 && colVars.length) {
    rowVars = [colVars.shift()];
  }
  const rowCodes = grayCode(rowVars.length);
  const colCodes = grayCode(colVars.length);
  const baseRows = rowCodes.length || 1;
  const baseCols = colCodes.length || 1;

  let mapRows = 1;
  let mapCols = 1;
  let mapRowCodes = [''];
  let mapColCodes = [''];

  if (mapVarCount === 1) {
    mapCols = 2;
    mapColCodes = grayCode(1);
  } else if (mapVarCount >= 2) {
    mapRows = 2;
    mapCols = 2;
    mapRowCodes = grayCode(1);
    mapColCodes = grayCode(1);
  }

  const submaps = [];
  for (let mr = 0; mr < mapRows; mr += 1) {
    for (let mc = 0; mc < mapCols; mc += 1) {
      const mapCode = `${mapRowCodes[mr] || ''}${mapColCodes[mc] || ''}`;
      const assignments = mapVars.map((name, idx) => `${name}=${mapCode[idx] || '0'}`);
      submaps.push({
        mapRow: mr,
        mapCol: mc,
        mapCode,
        label: assignments.join(', '),
        rowOffset: mr * baseRows,
        colOffset: mc * baseCols,
      });
    }
  }

  return {
    mapVarCount,
    mapVars,
    rowVars,
    colVars,
    rowCodes,
    colCodes,
    baseRows,
    baseCols,
    mapRows,
    mapCols,
    totalRows: baseRows * mapRows,
    totalCols: baseCols * mapCols,
    submaps,
  };
}

function kmapCellKey(row, col) {
  return `${row}-${col}`;
}

function kmapVariablesForLayout(layout) {
  return [...(layout.mapVars || []), ...(layout.colVars || []), ...(layout.rowVars || [])];
}

function computeCellKeyForLayout(layout, row, col) {
  const baseRows = layout.baseRows || 1;
  const baseCols = layout.baseCols || 1;
  const sub = (layout.submaps || []).find(
    (s) => row >= s.rowOffset && row < s.rowOffset + baseRows && col >= s.colOffset && col < s.colOffset + baseCols,
  );
  const mapBits = sub?.mapCode || ''.padEnd((layout.mapVars || []).length, '0');
  const colCode = layout.colCodes[col - (sub?.colOffset || 0)] || '';
  const rowCode = layout.rowCodes[row - (sub?.rowOffset || 0)] || '';
  const bits = `${mapBits}${colCode}${rowCode}`;
  const variables = kmapVariablesForLayout(layout);
  const assignment = {};
  variables.forEach((name, idx) => {
    assignment[name] = bits[idx] === '1';
  });
  const key = variables.map((v) => (assignment[v] ? '1' : '0')).join('');
  return { key, submap: sub };
}

function buildKmapCornerLabel(layout) {
  const corner = document.createElement('div');
  corner.className = 'kmap-corner-label';
  const diagonal = document.createElement('div');
  diagonal.className = 'kmap-diagonal';
  corner.appendChild(diagonal);

  const buildBlock = (vars, blockClass) => {
    const block = document.createElement('div');
    block.className = `kmap-variable-block ${blockClass}`;
    const list = vars.length ? vars : ['—'];
    list.forEach((name, idx) => {
      const span = document.createElement('span');
      const positionClass = idx === 0 ? 'kmap-var-top' : idx === 1 ? 'kmap-var-bottom' : '';
      span.className = `kmap-var ${positionClass}`.trim();
      span.innerHTML = formatScriptedText(name);
      block.appendChild(span);
    });
    return block;
  };

  corner.appendChild(buildBlock(layout.rowVars, 'kmap-vars-row'));
  corner.appendChild(buildBlock(layout.colVars, 'kmap-vars-col'));
  return corner;
}

function buildKmapTable(kmap, layout, submap) {
  const table = document.createElement('table');
  table.className = 'kmap-table';

  const headerRow = document.createElement('tr');
  const cornerCell = document.createElement('th');
  cornerCell.rowSpan = 1;
  cornerCell.appendChild(buildKmapCornerLabel(layout));
  headerRow.appendChild(cornerCell);

  layout.colCodes.forEach((code) => {
    const th = document.createElement('th');
    const span = document.createElement('span');
    span.className = 'kmap-gray-code kmap-gray-col';
    span.textContent = code || '0';
    th.appendChild(span);
    headerRow.appendChild(th);
  });
  table.appendChild(headerRow);

  layout.rowCodes.forEach((rowCode, rIdx) => {
    const tr = document.createElement('tr');
    const rowHeader = document.createElement('th');
    const span = document.createElement('span');
    span.className = 'kmap-gray-code kmap-gray-row';
    span.textContent = rowCode || '0';
    rowHeader.appendChild(span);
    tr.appendChild(rowHeader);

    layout.colCodes.forEach((colCode, cIdx) => {
      const td = document.createElement('td');
      const input = document.createElement('input');
      input.type = 'text';
      const rowIndex = submap.rowOffset + rIdx;
      const colIndex = submap.colOffset + cIdx;
      input.dataset.kmapId = kmap.id;
      input.dataset.rowIndex = rowIndex;
      input.dataset.colIndex = colIndex;
      input.dataset.totalRows = layout.totalRows;
      input.dataset.totalCols = layout.totalCols;
      input.classList.add('kmap-cell-input');
      input.value = (kmap.cells && kmap.cells[kmapCellKey(rowIndex, colIndex)]) || '';
      td.appendChild(input);
      tr.appendChild(td);
    });
    table.appendChild(tr);
  });

  return table;
}

// ---------------------------------------------------------------------------
// Expression parsing / canonicalization / truth-table evaluation, and the
// SOP/POS verification chain — all ported verbatim from
// FiniteStateMachine/app.js. These operate purely on plain expression
// strings/token arrays and a kmap-like object, no FSM globals involved.
// ---------------------------------------------------------------------------
function normalizeVarName(name) {
  return stripOverlines(name || '').replace(/\s+/g, '').toLowerCase();
}

function tokenizeExpressionInput(raw) {
  const tokens = [];
  const src = stripOverlines(raw);
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (/\s/.test(ch)) {
      i += 1;
      continue;
    }
    if (ch === '+') {
      tokens.push({ type: 'op', value: '+' });
      i += 1;
      continue;
    }
    if (ch === '*') {
      tokens.push({ type: 'op', value: '*' });
      i += 1;
      continue;
    }
    if (ch === '~') {
      tokens.push({ type: 'not' });
      i += 1;
      continue;
    }
    if (ch === "'") {
      tokens.push({ type: 'not-post' });
      i += 1;
      continue;
    }
    if (ch === '(' || ch === ')') {
      tokens.push({ type: 'paren', value: ch });
      i += 1;
      continue;
    }
    if (/[A-Za-z0-9_^]/.test(ch)) {
      let start = i;
      while (i < src.length && /[A-Za-z0-9_^]/.test(src[i])) i += 1;
      tokens.push({ type: 'var', value: src.slice(start, i) });
      continue;
    }
    i += 1;
  }
  return tokens;
}

function normalizeExpressionTokens(raw) {
  const tokens = tokenizeExpressionInput(raw);
  const normalized = [];
  for (let i = 0; i < tokens.length; i += 1) {
    const tk = tokens[i];
    if (tk.type === 'var') {
      let negated = false;
      if (i > 0 && tokens[i - 1].type === 'not') {
        negated = true;
      }
      if (i + 1 < tokens.length && tokens[i + 1].type === 'not-post') {
        negated = true;
        i += 1;
      }
      normalized.push({ type: 'var', value: tk.value, negated });
      continue;
    }
    if (tk.type === 'not') {
      const next = tokens[i + 1];
      if (!next || next.type !== 'var') {
        normalized.push({ type: 'not' });
      }
      continue;
    }
    if (tk.type === 'op' || tk.type === 'paren') {
      normalized.push(tk);
    }
  }
  return normalized;
}

function tokensToCanonical(tokens) {
  const parts = [];
  let prevType = null;
  tokens.forEach((tk, idx) => {
    if (tk.type === 'var') {
      const name = tk.value;
      const base = tk.negated ? `~${name}` : name;
      if (prevType === 'var' || prevType === 'close') {
        parts.push(' ');
      }
      parts.push(base);
      prevType = 'var';
      return;
    }
    if (tk.type === 'op') {
      if (tk.value === '+') {
        parts.push(' + ');
      } else if (tk.value === '*') {
        parts.push(' ');
      }
      prevType = 'op';
      return;
    }
    if (tk.type === 'not') {
      parts.push('~');
      prevType = 'not';
      return;
    }
    if (tk.type === 'paren') {
      if (tk.value === '(' && (prevType === 'var' || prevType === 'close')) {
        parts.push(' ');
      }
      parts.push(tk.value);
      prevType = tk.value === '(' ? 'open' : 'close';
    }
    if (idx === tokens.length - 1) prevType = tk.type;
  });
  return parts.join('').replace(/\s+/g, ' ').trim();
}

function expressionStringToTokens(raw) {
  const normalized = normalizeExpressionTokens(raw || '');
  return normalized
    .filter((tk) => tk.type === 'var' || tk.type === 'op' || tk.type === 'paren')
    .map((tk) => ({
      type: tk.type,
      value: tk.value,
      negated: tk.negated || false,
    }));
}

function insertImplicitMultiply(tokens) {
  const result = [];
  for (let i = 0; i < tokens.length; i += 1) {
    result.push(tokens[i]);
    if (
      tokens[i].type === 'paren' && tokens[i].value === ')' &&
      tokens[i + 1]?.type === 'paren' && tokens[i + 1]?.value === '('
    ) {
      result.push({ type: 'op', value: '*' });
    }
  }
  return result;
}

function buildImplicitAndTokens(tokens) {
  const result = [];
  tokens.forEach((tk, idx) => {
    result.push(tk);
    const next = tokens[idx + 1];
    if (!next) return;
    const isLeft = tk.type === 'var' || (tk.type === 'paren' && tk.value === ')');
    const isRight =
      next.type === 'var' || next.type === 'not' || (next.type === 'paren' && next.value === '(');
    if (isLeft && isRight) {
      result.push({ type: 'op', value: '*' });
    }
  });
  return result;
}

function toRpn(tokens) {
  const output = [];
  const ops = [];
  const prec = { '~': 3, '*': 2, '+': 1 };
  const assoc = { '~': 'right', '*': 'left', '+': 'left' };
  tokens.forEach((tk) => {
    if (tk.type === 'var') {
      output.push(tk);
      return;
    }
    if (tk.type === 'not' || tk.type === 'not-post') {
      const op = '~';
      while (ops.length && ops[ops.length - 1] !== '(' && prec[ops[ops.length - 1]] >= prec[op]) {
        output.push({ type: 'op', value: ops.pop() });
      }
      ops.push(op);
      return;
    }
    if (tk.type === 'op') {
      const op = tk.value;
      while (
        ops.length &&
        ops[ops.length - 1] !== '(' &&
        (prec[ops[ops.length - 1]] > prec[op] ||
          (prec[ops[ops.length - 1]] === prec[op] && assoc[op] === 'left'))
      ) {
        output.push({ type: 'op', value: ops.pop() });
      }
      ops.push(op);
      return;
    }
    if (tk.type === 'paren') {
      if (tk.value === '(') {
        ops.push('(');
      } else {
        while (ops.length && ops[ops.length - 1] !== '(') {
          output.push({ type: 'op', value: ops.pop() });
        }
        ops.pop();
      }
    }
  });
  while (ops.length) {
    output.push({ type: 'op', value: ops.pop() });
  }
  return output;
}

function evaluateRpn(rpn, assignmentGetter) {
  const stack = [];
  for (let i = 0; i < rpn.length; i += 1) {
    const tk = rpn[i];
    if (tk.type === 'var') {
      const value = assignmentGetter(tk.value);
      if (value === undefined) return null;
      stack.push(Boolean(value));
      continue;
    }
    if (tk.type === 'op') {
      if (tk.value === '~') {
        const a = stack.pop();
        if (a === undefined) return null;
        stack.push(!a);
        continue;
      }
      const b = stack.pop();
      const a = stack.pop();
      if (a === undefined || b === undefined) return null;
      if (tk.value === '*') stack.push(a && b);
      else if (tk.value === '+') stack.push(a || b);
    }
  }
  const result = stack.pop();
  if (result === undefined || stack.length) return null;
  return result;
}

function buildExpressionTruthTable(expression, variables) {
  const cleanExpr = stripOverlines(expression || '').replace(/\s+/g, ' ').trim();
  if (!cleanExpr) return null;
  const tokens = tokenizeExpressionInput(cleanExpr);
  const prepared = buildImplicitAndTokens(tokens);
  const rpn = toRpn(prepared);
  const table = new Map();
  const normalizedVars = (variables || []).map((v) => ({ raw: v, norm: normalizeVarName(v) }));

  const total = Math.pow(2, normalizedVars.length);
  for (let i = 0; i < total; i += 1) {
    const assignment = {};
    normalizedVars.forEach((v, idx) => {
      const bit = (i >> (normalizedVars.length - idx - 1)) & 1;
      assignment[v.raw] = bit === 1;
      assignment[v.norm] = bit === 1;
    });
    const evalAssignment = (name) => assignment[name] ?? assignment[normalizeVarName(name)];
    const value = evaluateRpn(rpn, (name) => evalAssignment(name));
    if (value === null) return null;
    const key = normalizedVars
      .map((v) => (assignment[v.raw] ? '1' : '0'))
      .join('');
    table.set(key, value ? '1' : '0');
  }
  return table;
}

function buildKmapTruthTable(kmap, strictType = null) {
  const layout = buildKmapLayout(kmap);
  const variables = [...layout.mapVars, ...layout.colVars, ...layout.rowVars];
  const table = new Map();
  const baseRows = layout.baseRows || 1;
  const baseCols = layout.baseCols || 1;
  const blankValue = strictType === null ? 'X' : (strictType === 'pos' ? '1' : '0');

  for (let r = 0; r < layout.totalRows; r += 1) {
    for (let c = 0; c < layout.totalCols; c += 1) {
      const sub = layout.submaps.find(
        (s) => r >= s.rowOffset && r < s.rowOffset + baseRows && c >= s.colOffset && c < s.colOffset + baseCols,
      );
      const mapBits = sub?.mapCode || ''.padEnd(layout.mapVars.length, '0');
      const colCode = layout.colCodes[c - (sub?.colOffset || 0)] || '';
      const rowCode = layout.rowCodes[r - (sub?.rowOffset || 0)] || '';
      const bits = `${mapBits}${colCode}${rowCode}`;
      const assignment = {};
      variables.forEach((name, idx) => {
        assignment[name] = bits[idx] === '1';
      });
      const key = variables.map((v) => (assignment[v] ? '1' : '0')).join('');
      const cellVal = (kmap.cells && kmap.cells[kmapCellKey(r, c)]) || '';
      table.set(key, cellVal || blankValue);
    }
  }

  return { table, variables };
}

function splitExpressionSections(tokens = [], type = 'sop') {
  const splitOp = type === 'pos' ? '*' : '+';
  const sections = [];
  let depth = 0;
  let current = [];

  const pushCurrent = () => {
    if (current.some((tk) => tk.type === 'var')) {
      sections.push(current);
    }
    current = [];
  };

  tokens.forEach((tk) => {
    if (tk.type === 'op' && tk.value === splitOp && depth === 0) {
      pushCurrent();
      return;
    }
    current.push(tk);
    if (tk.type === 'paren') {
      if (tk.value === '(') depth += 1;
      else if (tk.value === ')') depth = Math.max(0, depth - 1);
    }
  });

  pushCurrent();
  return sections;
}

function getKmapSectionSignatures(tokens = [], type = 'sop') {
  return splitExpressionSections(tokens, type).map((sectionTokens) => tokensToCanonical(sectionTokens));
}

function dropLiteralFromSection(tokens, varIdx) {
  const result = [...tokens];
  result.splice(varIdx, 1);
  const rightIdx = varIdx;
  const leftIdx = varIdx - 1;
  if (rightIdx < result.length && result[rightIdx].type === 'op') {
    result.splice(rightIdx, 1);
  } else if (leftIdx >= 0 && result[leftIdx].type === 'op') {
    result.splice(leftIdx, 1);
  }
  return result;
}

function checkKmapMinimality(sections, kmapTable, variables, type) {
  const targetValue = type === 'pos' ? '0' : '1';
  const badValue = type === 'pos' ? '1' : '0';

  const sectionTables = sections.map((sectionTokens) => {
    const canonical = tokensToCanonical(sectionTokens);
    return buildExpressionTruthTable(canonical, variables);
  });

  for (let i = 0; i < sections.length; i += 1) {
    const others = sectionTables.filter((_, j) => j !== i);
    let redundant = true;
    for (const [key, val] of kmapTable.entries()) {
      if (val !== targetValue) continue;
      // A section's own truth table is 1 wherever that product term is true,
      // regardless of SOP/POS — "does another term cover this cell" always
      // means checking for '1' here, never `targetValue` (which is '0' for
      // POS and would silently invert this check).
      if (!others.some((t) => t?.get(key) === '1')) {
        redundant = false;
        break;
      }
    }
    if (redundant) return 'Expression contains a redundant term';
  }

  for (const sectionTokens of sections) {
    const varIndices = sectionTokens
      .map((tk, idx) => (tk.type === 'var' ? idx : -1))
      .filter((idx) => idx >= 0);
    for (const varIdx of varIndices) {
      const reduced = dropLiteralFromSection(sectionTokens, varIdx);
      if (!reduced.some((tk) => tk.type === 'var')) continue;
      const reducedTable = buildExpressionTruthTable(tokensToCanonical(reduced), variables);
      if (!reducedTable) continue;
      let expandable = true;
      for (const [key, val] of kmapTable.entries()) {
        if (val === badValue && reducedTable.get(key) === '1') {
          expandable = false;
          break;
        }
      }
      if (expandable) return 'Expression is not fully simplified (a term can be expanded)';
    }
  }

  return null;
}

function verifyPrimaryKmapExpression(kmap) {
  const kmapTable = buildKmapTruthTable(kmap);
  const tokens = kmap.expressionTokens || expressionStringToTokens(kmap.expression || '');
  const canonical = tokensToCanonical(tokens);
  kmap.expression = canonical;
  kmap.expressionTokens = tokens;
  const exprTable = buildExpressionTruthTable(canonical, kmapTable.variables);
  if (!exprTable) return { passed: false, reason: 'Expression is invalid or empty' };
  for (const [key, value] of kmapTable.table.entries()) {
    if (value === 'X') continue;
    // POS k-maps build the SOP of the complement (F') in this tray, so a '1'
    // in this tray's expression should land on the K-map's '0' cells.
    const expected = kmap.type === 'pos' ? value === '0' : value === '1';
    const exprVal = exprTable.get(key);
    if (exprVal === undefined) return { passed: false, reason: 'Expression incomplete' };
    if ((exprVal === '1') !== expected) {
      return { passed: false, reason: 'Expression output does not match K-map' };
    }
  }
  const sections = splitExpressionSections(tokens);
  const strictTable = buildKmapTruthTable(kmap, kmap.type || 'sop').table;
  const notMinimalReason = checkKmapMinimality(sections, strictTable, kmapTable.variables, kmap.type || 'sop');
  if (notMinimalReason) return { passed: false, minimal: false, reason: notMinimalReason };
  return { passed: true, minimal: true };
}

function verifyKmapFExpression(kmap) {
  const variables = kmap.variables || [];
  const outputName = kmap.label || 'F';
  const primeName = `${outputName}'`;
  const fTokens = kmap.fExpressionTokens || expressionStringToTokens(kmap.fExpression || '');
  const fPrimeTokens = kmap.expressionTokens || expressionStringToTokens(kmap.expression || '');
  kmap.fExpressionTokens = fTokens;
  kmap.fExpression = tokensToCanonical(fTokens) || '';

  const fTable = buildExpressionTruthTable(kmap.fExpression, variables);
  if (!fTable) return { passed: false, reason: `${outputName} expression is invalid or empty` };
  const fPrimeCanonical = tokensToCanonical(fPrimeTokens);
  const fPrimeTable = buildExpressionTruthTable(fPrimeCanonical, variables);
  if (!fPrimeTable) return { passed: false, reason: `${primeName} expression is invalid or empty` };

  for (const [key, fPrimeVal] of fPrimeTable.entries()) {
    const expected = fPrimeVal === '0' ? '1' : '0';
    if (fTable.get(key) !== expected) {
      return { passed: false, reason: `${outputName} does not equal the DeMorgan complement of ${primeName}` };
    }
  }
  return { passed: true };
}

function verifyKmapExpression(kmap) {
  if (!kmap) return { passed: false, reason: 'No k-map selected' };
  const primaryResult = verifyPrimaryKmapExpression(kmap);
  if (kmap.type !== 'pos') return primaryResult;

  const primeName = `${kmap.label || 'F'}'`;
  if (!primaryResult.passed) {
    return { ...primaryResult, reason: `${primeName} does not match the K-map: ${primaryResult.reason}` };
  }

  const fResult = verifyKmapFExpression(kmap);
  if (!fResult.passed) {
    return { passed: false, reason: fResult.reason };
  }
  return { passed: true, minimal: primaryResult.minimal };
}

// ---------------------------------------------------------------------------
// Circle-grouping overlay (SVG) — ported verbatim from
// FiniteStateMachine/app.js. Draws a rounded-rect group (with wrap-around
// splitting) over every term of the primary expression tray.
// ---------------------------------------------------------------------------
const kmapCirclePalette = ['#00FFFF', '#FF00FF', '#39FF14', '#FF5E00', '#8A2BE2', '#FF2D55'];
const kmapCircleFadeDuration = 1500;
let showKmapCircles = true;

function colorWithAlpha(hex, alpha) {
  if (!hex || typeof hex !== 'string') return hex;
  const safe = hex.replace('#', '');
  if (safe.length !== 6) return hex;
  const r = parseInt(safe.slice(0, 2), 16);
  const g = parseInt(safe.slice(2, 4), 16);
  const b = parseInt(safe.slice(4, 6), 16);
  if ([r, g, b].some((v) => Number.isNaN(v))) return hex;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function rectDistance(a, b) {
  const dx = Math.max(0, Math.max(a.minX - b.maxX, b.minX - a.maxX));
  const dy = Math.max(0, Math.max(a.minY - b.maxY, b.minY - a.maxY));
  return Math.hypot(dx, dy);
}

function clusterRects(rects, threshold = 28) {
  const clusters = [];
  rects.forEach((rect) => {
    let cluster = clusters.find((c) => rectDistance(c, rect) <= threshold);
    if (!cluster) {
      cluster = { ...rect, boxes: [rect] };
      clusters.push(cluster);
    } else {
      cluster.minX = Math.min(cluster.minX, rect.minX);
      cluster.minY = Math.min(cluster.minY, rect.minY);
      cluster.maxX = Math.max(cluster.maxX, rect.maxX);
      cluster.maxY = Math.max(cluster.maxY, rect.maxY);
      cluster.boxes.push(rect);
    }
  });
  clusters.forEach((c) => {
    c.cx = (c.minX + c.maxX) / 2;
    c.cy = (c.minY + c.maxY) / 2;
  });
  return clusters;
}

function clusterCellsWithWrap(cells, layout, threshold = 28) {
  if (!cells?.length) return [];

  const baseRows = layout?.baseRows || 1;
  const baseCols = layout?.baseCols || 1;

  const visited = new Set();
  const byPosition = new Map();

  cells.forEach((entry, idx) => {
    const { cell } = entry;
    const key = `${cell.submap?.mapRow || 0}-${cell.submap?.mapCol || 0}-${cell.row}-${cell.col}`;
    byPosition.set(key, { idx, cell });
  });

  const findNeighbor = (sub, row, col) => {
    const key = `${sub?.mapRow || 0}-${sub?.mapCol || 0}-${row}-${col}`;
    return byPosition.get(key)?.idx;
  };

  const neighbors = (cell) => {
    const { submap, row, col } = cell;
    const localRow = row - (submap?.rowOffset || 0);
    const localCol = col - (submap?.colOffset || 0);

    const upRow = ((localRow - 1 + baseRows) % baseRows) + (submap?.rowOffset || 0);
    const downRow = ((localRow + 1) % baseRows) + (submap?.rowOffset || 0);
    const leftCol = ((localCol - 1 + baseCols) % baseCols) + (submap?.colOffset || 0);
    const rightCol = ((localCol + 1) % baseCols) + (submap?.colOffset || 0);

    return [
      findNeighbor(submap, upRow, col),
      findNeighbor(submap, downRow, col),
      findNeighbor(submap, row, leftCol),
      findNeighbor(submap, row, rightCol),
    ].filter((v) => v !== undefined);
  };

  const logicalClusters = [];
  const stack = [];

  const buildCluster = (seedIdx) => {
    stack.length = 0;
    stack.push(seedIdx);
    visited.add(seedIdx);

    const rects = [];
    while (stack.length) {
      const idx = stack.pop();
      rects.push(cells[idx].rect);

      neighbors(cells[idx].cell).forEach((nIdx) => {
        if (!visited.has(nIdx)) {
          visited.add(nIdx);
          stack.push(nIdx);
        }
      });
    }
    logicalClusters.push(rects);
  };

  cells.forEach((_, idx) => {
    if (!visited.has(idx)) buildCluster(idx);
  });

  // For EACH logical cluster, do a spatial merge *within that cluster only*.
  // This produces 1+ boxes per logical cluster (wrap => typically 2 boxes).
  const out = [];
  logicalClusters.forEach((rects, groupId) => {
    const boxes = clusterRects(rects, threshold);
    boxes.forEach((b) => out.push({ ...b, groupId }));
  });

  return out;
}

// Converts a kmap cell list into the {rect, cell} shape buildCircleGroupFromActiveCells
// expects, measuring each cell's DOM box relative to the overlay's own box.
function computeActiveCellRects(cells, overlayRect) {
  const computePadding = 5;
  return cells.map((cell) => {
    const target = cell.element.closest('td') || cell.element.parentElement;
    const rect = target.getBoundingClientRect();
    return {
      rect: {
        minX: rect.left - overlayRect.left - computePadding,
        minY: rect.top - overlayRect.top - computePadding,
        maxX: rect.right - overlayRect.left + computePadding,
        maxY: rect.bottom - overlayRect.top + computePadding,
      },
      cell,
    };
  });
}

function buildKmapCircleGroup({
  sectionTokens,
  sectionIdx,
  layout,
  variables,
  cells,
  overlayRect,
  paletteOffset,
}) {
  const canonical = tokensToCanonical(sectionTokens);
  const sectionTable = buildExpressionTruthTable(canonical, variables);
  if (!sectionTable) return null;
  const targetValue = '1';
  const matchingCells = cells.filter((cell) => sectionTable.get(cell.key) === targetValue);
  if (!matchingCells.length) return null;
  const activeCells = computeActiveCellRects(matchingCells, overlayRect);
  return buildCircleGroupFromActiveCells(activeCells, sectionIdx, layout, paletteOffset);
}

// Shared tail of the circle-drawing pipeline: clusters a known set of
// {rect, cell} entries (wraparound-aware) and renders the rounded-rect +
// connector SVG group. Used both for expression-derived groups
// (buildKmapCircleGroup) and for algorithmically-found "model answer" groups
// that were never typed as an expression (see findMinimalCoverGroups).
function buildCircleGroupFromActiveCells(activeCells, sectionIdx, layout, paletteOffset) {
  const computePadding = 5;
  const drawPadding = -4;
  if (!activeCells.length) return null;

  const clusters = clusterCellsWithWrap(activeCells, layout, 32);
  const strokeColor = kmapCirclePalette[(paletteOffset + sectionIdx) % kmapCirclePalette.length];
  const fillColor = colorWithAlpha(strokeColor, 0.12);
  const paddingAdjustment = computePadding - drawPadding;
  const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  group.setAttribute('class', 'kmap-circle-section');
  group.dataset.sectionIndex = sectionIdx;

  clusters.forEach((cl) => {
    const rectEl = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    const minX = cl.minX + paddingAdjustment;
    const minY = cl.minY + paddingAdjustment;
    const maxX = cl.maxX - paddingAdjustment;
    const maxY = cl.maxY - paddingAdjustment;

    rectEl.setAttribute('x', minX);
    rectEl.setAttribute('y', minY);
    rectEl.setAttribute('width', Math.max(0, maxX - minX));
    rectEl.setAttribute('height', Math.max(0, maxY - minY));
    rectEl.setAttribute('rx', 14);
    rectEl.setAttribute('ry', 14);
    rectEl.setAttribute('fill', fillColor);
    rectEl.setAttribute('stroke', strokeColor);
    rectEl.setAttribute('stroke-width', '2');
    rectEl.setAttribute('class', 'kmap-circle-rect');
    group.appendChild(rectEl);
  });

  const sorted = [...clusters].sort((a, b) => (a.minX === b.minX ? a.minY - b.minY : a.minX - b.minX));
  for (let i = 0; i < sorted.length - 1; i += 1) {
    const start = sorted[i];
    const end = sorted[i + 1];
    const dx = end.cx - start.cx;
    const dy = end.cy - start.cy;
    const dist = Math.hypot(dx, dy) || 1;
    const offset = Math.min(40, dist / 3);
    const cx = (start.cx + end.cx) / 2 - (dy / dist) * offset;
    const cy = (start.cy + end.cy) / 2 + (dx / dist) * offset;
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', `M ${start.cx} ${start.cy} Q ${cx} ${cy} ${end.cx} ${end.cy}`);
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', strokeColor);
    path.setAttribute('stroke-width', '2');
    path.setAttribute('stroke-dasharray', '8 6');
    path.setAttribute('class', 'kmap-circle-link');
    group.appendChild(path);
  }

  return group;
}

function clearKmapCircleAnimations(kmap) {
  if (!kmap?.circleSectionAnimations) return;
  Object.values(kmap.circleSectionAnimations).forEach((entry) => {
    if (entry?.timeoutId) window.clearTimeout(entry.timeoutId);
  });
  kmap.circleSectionAnimations = {};
}

function collectKmapCells(kmap, card, layout) {
  const cells = [];
  for (let r = 0; r < layout.totalRows; r += 1) {
    for (let c = 0; c < layout.totalCols; c += 1) {
      const input = card.querySelector(
        `.kmap-cell-input[data-row-index="${r}"][data-col-index="${c}"]`,
      );
      if (!input) continue;
      const { key, submap } = computeCellKeyForLayout(layout, r, c);
      cells.push({ row: r, col: c, key, element: input, submap });
    }
  }
  return cells;
}

// Colors a truth-table row to match the K-map circle of whichever term
// covers it, so students can see the same group in both views at once.
function clearTruthTableCircleHighlights() {
  truthTableBody.querySelectorAll('.circle-highlight').forEach((row) => {
    row.classList.remove('circle-highlight');
    row.style.removeProperty('--circle-color');
    row.style.removeProperty('--circle-bg');
  });
}

function applyTruthTableCircleHighlight(sectionTokens, sectionIdx, variables) {
  const canonical = tokensToCanonical(sectionTokens);
  const sectionTable = buildExpressionTruthTable(canonical, variables);
  if (!sectionTable) return;
  const color = kmapCirclePalette[sectionIdx % kmapCirclePalette.length];
  const bg = colorWithAlpha(color, 0.16);
  sectionTable.forEach((val, layoutKey) => {
    if (val !== '1') return;
    const assignment = {};
    variables.forEach((v, idx) => {
      assignment[v] = layoutKey[idx];
    });
    const declaredKey = state.variables.map((v) => assignment[v]).join('');
    const row = truthTableBody.querySelector(`tr[data-declared-key="${declaredKey}"]`);
    if (row) {
      row.classList.add('circle-highlight');
      row.style.setProperty('--circle-color', color);
      row.style.setProperty('--circle-bg', bg);
    }
  });
}

function renderKmapCircles() {
  const overlay = document.getElementById('kmapCircleOverlay');
  if (!overlay) return;
  overlay.innerHTML = '';
  overlay.classList.toggle('hidden', !showKmapCircles);
  clearTruthTableCircleHighlights();
  if (!showKmapCircles) return;

  const kmap = state.kmap;
  if (!kmap.expression) return;
  const layout = state.layout;
  const variables = kmapVariablesForLayout(layout);
  const tokens = kmap.expressionTokens || expressionStringToTokens(kmap.expression || '');
  const sections = splitExpressionSections(tokens);
  if (!sections.length) return;
  clearKmapCircleAnimations(kmap);
  const cells = collectKmapCells(kmap, kmapGridCollection, layout);
  const overlayRect = overlay.getBoundingClientRect();
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', '100%');
  svg.setAttribute('height', '100%');
  overlay.appendChild(svg);

  sections.forEach((sectionTokens, sectionIdx) => {
    const group = buildKmapCircleGroup({
      sectionTokens,
      sectionIdx,
      layout,
      variables,
      cells,
      overlayRect,
      paletteOffset: 0,
    });
    if (group) svg.appendChild(group);
    applyTruthTableCircleHighlight(sectionTokens, sectionIdx, variables);
  });

  kmap.circleSectionSignatures = getKmapSectionSignatures(tokens);
}

function diffKmapSectionSignatures(previous = [], next = []) {
  const max = Math.max(previous.length, next.length);
  const changed = [];
  for (let i = 0; i < max; i += 1) {
    if (previous[i] !== next[i]) changed.push(i);
  }
  return changed;
}

function renderKmapCircleSectionUpdate(kmap, sectionIndices, tokens) {
  if (!showKmapCircles || !sectionIndices.length) return;
  const overlay = document.getElementById('kmapCircleOverlay');
  if (!overlay) return;
  let svg = overlay.querySelector('svg');
  if (!svg) {
    renderKmapCircles();
    svg = overlay.querySelector('svg');
  }
  if (!svg) return;

  const layout = state.layout;
  const variables = kmapVariablesForLayout(layout);
  const cells = collectKmapCells(kmap, kmapGridCollection, layout);
  const overlayRect = overlay.getBoundingClientRect();
  const sectionAnimations = kmap.circleSectionAnimations || {};
  const nextSignatures = getKmapSectionSignatures(tokens);
  kmap.circleSectionAnimations = sectionAnimations;

  clearTruthTableCircleHighlights();
  splitExpressionSections(tokens).forEach((sectionTokens, idx) => applyTruthTableCircleHighlight(sectionTokens, idx, variables));

  sectionIndices.forEach((sectionIdx) => {
    const signature = nextSignatures[sectionIdx] ?? null;
    const existingAnimation = sectionAnimations[sectionIdx];
    if (existingAnimation?.timeoutId) {
      window.clearTimeout(existingAnimation.timeoutId);
    }
    const existingGroup = svg.querySelector(`[data-section-index="${sectionIdx}"]`);
    if (existingGroup) {
      existingGroup.classList.add('kmap-circle-fade-out');
    }

    const timeoutId = window.setTimeout(() => {
      if ((kmap.circleSectionSignatures?.[sectionIdx] ?? null) !== signature) return;
      const staleGroup = svg.querySelector(`[data-section-index="${sectionIdx}"]`);
      if (staleGroup && staleGroup.parentNode) {
        staleGroup.parentNode.removeChild(staleGroup);
      }
      const currentTokens = kmap.expressionTokens || expressionStringToTokens(kmap.expression || '');
      const sectionTokens = splitExpressionSections(currentTokens)[sectionIdx];
      if (!sectionTokens) return;
      const group = buildKmapCircleGroup({
        sectionTokens,
        sectionIdx,
        layout,
        variables,
        cells,
        overlayRect,
        paletteOffset: 0,
      });
      if (!group) return;
      group.classList.add('kmap-circle-fade-in');
      svg.appendChild(group);
      requestAnimationFrame(() => {
        group.classList.remove('kmap-circle-fade-in');
      });
    }, kmapCircleFadeDuration);
    sectionAnimations[sectionIdx] = { timeoutId, signature };
  });
}

function scheduleKmapCircleRender() {
  requestAnimationFrame(() => renderKmapCircles());
}

// ---------------------------------------------------------------------------
// Expression tray: draggable token tray + drag-and-drop wiring, ported
// verbatim from FiniteStateMachine/app.js (simplified for a single kmap —
// no getKmapById lookup needed since there's only ever state.kmap).
// ---------------------------------------------------------------------------
function buildTrayToken(token) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'kmap-token';
  btn.draggable = true;
  btn.dataset.tokenType = token.type;
  btn.dataset.tokenValue = token.value;
  if (token.type === 'op' || token.type === 'paren') {
    btn.classList.add('kmap-token-operator');
  }
  btn.innerHTML = formatScriptedText(token.value || '');
  return btn;
}

function renderExpressionToken(token, index, kmapId) {
  const el = document.createElement('div');
  el.className = 'kmap-expr-token';
  el.draggable = true;
  el.dataset.tokenType = token.type;
  el.dataset.tokenValue = token.value;
  el.dataset.index = index;
  el.dataset.kmapId = kmapId;
  const inner = document.createElement('span');
  inner.className = 'kmap-expr-token-inner';
  if (token.type === 'op' || token.type === 'paren') {
    el.classList.add('operator');
  }
  if (token.type === 'var') {
    inner.classList.toggle('negated', !!token.negated);
  }
  inner.innerHTML = formatScriptedText(token.value || '');
  el.appendChild(inner);
  return el;
}

function renderExpressionTray(tray, tokens, kmapId) {
  tray.innerHTML = '';
  if (!tokens.length) {
    const placeholder = document.createElement('div');
    placeholder.className = 'kmap-expr-placeholder';
    placeholder.textContent = 'Drag items here to build your expression';
    tray.appendChild(placeholder);
    return;
  }
  tokens.forEach((tk, idx) => {
    tray.appendChild(renderExpressionToken(tk, idx, kmapId));
  });
}

function ensureDropMarker(tray) {
  let marker = tray.querySelector('.kmap-drop-marker');
  if (!marker) {
    marker = document.createElement('div');
    marker.className = 'kmap-drop-marker';
  }
  return marker;
}

function clearDropMarker(tray) {
  const marker = tray.querySelector('.kmap-drop-marker');
  if (marker) marker.remove();
}

function isFTray(tray) {
  return tray?.dataset.trayRole === 'f';
}

function getTrayTokens(kmap, tray) {
  if (!kmap) return [];
  if (isFTray(tray)) {
    return kmap.fExpressionTokens || expressionStringToTokens(kmap.fExpression || '');
  }
  return kmap.expressionTokens || expressionStringToTokens(kmap.expression || '');
}

function clearVerifyResult() {
  const verifyBtn = document.getElementById('verifyKmapBtn');
  const resultText = document.getElementById('verifyResultText');
  if (verifyBtn) {
    verifyBtn.classList.remove('verified', 'failed', 'not-minimal');
    verifyBtn.title = '';
  }
  if (resultText) {
    resultText.textContent = '';
    resultText.classList.remove('passed', 'failed');
  }
}

function updateKmapExpressionTokens(kmap, tokens, tray) {
  tokens = insertImplicitMultiply(tokens);

  if (isFTray(tray)) {
    kmap.fExpressionTokens = tokens;
    kmap.fExpression = tokensToCanonical(tokens) || '';
    if (tray) renderExpressionTray(tray, tokens, kmap.id);
    clearVerifyResult();
    return;
  }

  const previousTokens = kmap.expressionTokens || expressionStringToTokens(kmap.expression || '');
  const previousSignatures = kmap.circleSectionSignatures || getKmapSectionSignatures(previousTokens);
  const nextSignatures = getKmapSectionSignatures(tokens);
  const changedSections = diffKmapSectionSignatures(previousSignatures, nextSignatures);
  const hadPreviousSections = previousSignatures.length > 0;
  kmap.expressionTokens = tokens;
  kmap.expression = tokensToCanonical(tokens) || '';
  if (tray) renderExpressionTray(tray, tokens, kmap.id);
  if (showKmapCircles && changedSections.length && hadPreviousSections) {
    renderKmapCircleSectionUpdate(kmap, changedSections, tokens);
  } else {
    scheduleKmapCircleRender();
  }
  kmap.circleSectionSignatures = nextSignatures;
  clearVerifyResult();
}

// ---------------------------------------------------------------------------
// Module state
// ---------------------------------------------------------------------------
const VARIABLE_POOL = ['A', 'B', 'C', 'D'];

const state = {
  variables: [],
  varCount: 2,
  kmap: null,
  layout: null,
  keyMaps: null,
};

function initKmapState() {
  state.variables = VARIABLE_POOL.slice(0, 2);
  state.varCount = 2;
  state.kmap = {
    id: 1,
    label: 'F',
    type: 'sop',
    direction: 'horizontal',
    variables: state.variables,
    cells: {},
    expressionTokens: [],
    expression: '',
    fExpressionTokens: [],
    fExpression: '',
  };
  state.layout = buildKmapLayout(state.kmap);
  state.keyMaps = buildKeyMaps(state.layout);
  for (let r = 0; r < state.layout.totalRows; r += 1) {
    for (let c = 0; c < state.layout.totalCols; c += 1) {
      state.kmap.cells[kmapCellKey(r, c)] = '0';
    }
  }
}

// Maps between a "declared" bitstring (one bit per state.variables entry, in
// that fixed order — independent of how the layout arranges rows/cols/maps)
// and the grid position that bitstring lands on for the *current* layout.
// This is what lets the truth table and K-map share one plain key, and lets
// values survive a variable-count or direction change intact.
function buildKeyMaps(layout) {
  const orderedVars = kmapVariablesForLayout(layout);
  const declaredKeyToPos = {};
  const posToDeclaredKey = {};
  for (let r = 0; r < layout.totalRows; r += 1) {
    for (let c = 0; c < layout.totalCols; c += 1) {
      const { key } = computeCellKeyForLayout(layout, r, c);
      const assignment = {};
      orderedVars.forEach((v, idx) => {
        assignment[v] = key[idx];
      });
      const declaredKey = state.variables.map((v) => assignment[v]).join('');
      declaredKeyToPos[declaredKey] = { row: r, col: c };
      posToDeclaredKey[kmapCellKey(r, c)] = declaredKey;
    }
  }
  return { declaredKeyToPos, posToDeclaredKey };
}

function getValueForPos(row, col) {
  return state.kmap.cells[kmapCellKey(row, col)] || '0';
}

function setValueForPos(row, col, value) {
  state.kmap.cells[kmapCellKey(row, col)] = value;
}

function snapshotValuesByDeclaredKey() {
  const snapshot = {};
  if (state.layout && state.keyMaps) {
    Object.keys(state.keyMaps.declaredKeyToPos).forEach((key) => {
      const pos = state.keyMaps.declaredKeyToPos[key];
      snapshot[key] = getValueForPos(pos.row, pos.col);
    });
  }
  return snapshot;
}

// Rebuilds the layout/key maps for a new variable list and/or direction,
// then repopulates cell values via `valueRemapFn(newDeclaredKey, oldSnapshot)`
// so a variable-count or direction change never silently changes the
// function the student was building.
function applyLayoutChange(newVariables, newDirection, valueRemapFn) {
  const oldSnapshot = snapshotValuesByDeclaredKey();
  state.variables = newVariables;
  state.kmap.variables = newVariables;
  state.kmap.direction = newDirection;
  const newLayout = buildKmapLayout(state.kmap);
  const newKeyMaps = buildKeyMaps(newLayout);
  const newCells = {};
  Object.keys(newKeyMaps.declaredKeyToPos).forEach((newKey) => {
    const pos = newKeyMaps.declaredKeyToPos[newKey];
    newCells[kmapCellKey(pos.row, pos.col)] = valueRemapFn(newKey, oldSnapshot);
  });
  state.kmap.cells = newCells;
  state.layout = newLayout;
  state.keyMaps = newKeyMaps;
}

// A variable-count or direction change reshapes the grid under the
// student's expression, so any in-progress expression is cleared rather
// than silently reinterpreted against the new layout.
function resetKmapExpressions() {
  clearKmapCircleAnimations(state.kmap);
  state.kmap.expressionTokens = [];
  state.kmap.expression = '';
  state.kmap.fExpressionTokens = [];
  state.kmap.fExpression = '';
}

function setVarCount(newCount) {
  const oldCount = state.variables.length;
  const newVars = VARIABLE_POOL.slice(0, newCount);
  applyLayoutChange(newVars, state.kmap.direction, (newKey, oldSnapshot) => {
    if (newCount === oldCount) return oldSnapshot[newKey] ?? '0';
    if (newCount > oldCount) return oldSnapshot[newKey.slice(0, oldCount)] ?? '0';
    return oldSnapshot[newKey.padEnd(oldCount, '0')] ?? '0';
  });
  state.varCount = newCount;
  resetKmapExpressions();
  renderKmapGrid();
  renderTruthTable();
  renderExpressionSection();
  renderTargetValueTint();
  scheduleKmapCircleRender();
  clearVerifyResult();
  updateGroupHelperAvailability();
}

function toggleDirection() {
  const newDirection = state.kmap.direction === 'horizontal' ? 'vertical' : 'horizontal';
  applyLayoutChange(state.variables, newDirection, (newKey, oldSnapshot) => oldSnapshot[newKey] ?? '0');
  resetKmapExpressions();
  renderKmapGrid();
  renderTruthTable();
  renderExpressionSection();
  renderTargetValueTint();
  scheduleKmapCircleRender();
  clearVerifyResult();
  updateGroupHelperAvailability();
}

function setKmapType(type) {
  state.kmap.type = type;
  resetKmapExpressions();
  renderExpressionSection();
  renderTargetValueTint();
  scheduleKmapCircleRender();
  clearVerifyResult();
  updateGroupHelperAvailability();
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------
const kmapGridCollection = document.getElementById('kmapGridCollection');
const truthTableHead = document.getElementById('truthTableHead');
const truthTableBody = document.getElementById('truthTableBody');
const grayOrderToggle = document.getElementById('grayOrderToggle');
const adjacencyToggle = document.getElementById('adjacencyToggle');
const directionBtn = document.getElementById('directionBtn');

function renderKmapGrid() {
  const layout = state.layout;
  kmapGridCollection.innerHTML = '';
  kmapGridCollection.style.gridTemplateColumns = `repeat(${layout.mapCols}, minmax(0, 1fr))`;
  layout.submaps.forEach((submap) => {
    const wrap = document.createElement('div');
    wrap.className = 'kmap-submap';
    if (layout.mapVarCount > 0) {
      const label = document.createElement('div');
      label.className = 'kmap-submap-label';
      label.innerHTML = formatScriptedText(submap.label);
      wrap.appendChild(label);
    }
    const table = buildKmapTable(state.kmap, layout, submap);
    wrap.appendChild(table);
    kmapGridCollection.appendChild(wrap);
  });
  annotateKmapCells();
  renderTargetValueTint();
}

function annotateKmapCells() {
  kmapGridCollection.querySelectorAll('.kmap-cell-input').forEach((input) => {
    const row = Number(input.dataset.rowIndex);
    const col = Number(input.dataset.colIndex);
    const declaredKey = state.keyMaps.posToDeclaredKey[kmapCellKey(row, col)];
    const td = input.closest('td');
    input.readOnly = true;
    input.tabIndex = 0;
    input.dataset.declaredKey = declaredKey;
    td.dataset.declaredKey = declaredKey;
  });
}

// Tints whichever value the primary tray is currently circling — 1s for SOP,
// 0s for POS — so switching type visibly shows "same grid, opposite value".
function renderTargetValueTint() {
  const target = state.kmap.type === 'pos' ? '0' : '1';
  kmapGridCollection.querySelectorAll('.kmap-cell-input').forEach((input) => {
    const td = input.closest('td');
    td.classList.toggle('target-value', input.value === target);
  });
}

function renderTruthTableHead() {
  truthTableHead.innerHTML = '';
  const tr = document.createElement('tr');
  state.variables.forEach((v) => {
    const th = document.createElement('th');
    th.innerHTML = formatScriptedText(v);
    tr.appendChild(th);
  });
  const th = document.createElement('th');
  th.innerHTML = formatScriptedText(state.kmap.label || 'F');
  tr.appendChild(th);
  truthTableHead.appendChild(tr);
}

function renderTruthTable() {
  renderTruthTableHead();
  truthTableBody.innerHTML = '';
  const n = state.variables.length;
  const total = 1 << n;
  let order = [];
  for (let i = 0; i < total; i += 1) order.push(i);
  if (grayOrderToggle.checked) {
    order = grayCode(n).map((code) => parseInt(code, 2));
  }
  order.forEach((i) => {
    const bits = i.toString(2).padStart(n, '0');
    const tr = document.createElement('tr');
    tr.dataset.declaredKey = bits;
    state.variables.forEach((v, idx) => {
      const td = document.createElement('td');
      td.textContent = bits[idx];
      tr.appendChild(td);
    });
    const valTd = document.createElement('td');
    valTd.className = 'value-cell';
    const pos = state.keyMaps.declaredKeyToPos[bits];
    valTd.textContent = pos ? getValueForPos(pos.row, pos.col) : '0';
    tr.appendChild(valTd);
    truthTableBody.appendChild(tr);
  });
}

// ---------------------------------------------------------------------------
// Interaction: click-to-toggle a value, synced between both views
// ---------------------------------------------------------------------------
function handleValueToggle(declaredKey) {
  const pos = state.keyMaps.declaredKeyToPos[declaredKey];
  if (!pos) return;
  const current = getValueForPos(pos.row, pos.col);
  const next = current === '1' ? '0' : '1';
  setValueForPos(pos.row, pos.col, next);
  updateCellDisplays(declaredKey, next);
  updateGroupHelperAvailability();
}

function updateCellDisplays(declaredKey, value) {
  const target = state.kmap.type === 'pos' ? '0' : '1';
  kmapGridCollection.querySelectorAll(`.kmap-cell-input[data-declared-key="${declaredKey}"]`).forEach((input) => {
    input.value = value;
    const td = input.closest('td');
    td.classList.toggle('target-value', value === target);
    td.classList.remove('just-changed');
    // Force reflow so the animation can be retriggered on repeated clicks.
    void td.offsetWidth;
    td.classList.add('just-changed');
  });
  const row = truthTableBody.querySelector(`tr[data-declared-key="${declaredKey}"]`);
  if (row) {
    const valTd = row.querySelector('.value-cell');
    valTd.textContent = value;
    row.classList.remove('just-changed');
    void row.offsetWidth;
    row.classList.add('just-changed');
  }
  clearVerifyResult();
}

// ---------------------------------------------------------------------------
// Interaction: synchronized hover highlighting between the truth table and
// the K-map, plus a small "this wraps around" hint on K-map edge cells.
// ---------------------------------------------------------------------------
function setActiveKey(key) {
  document.querySelectorAll('.truth-table tr[data-declared-key], .kmap-table td[data-declared-key]').forEach((el) => {
    el.classList.toggle('is-active', el.dataset.declaredKey === key);
  });
}

function clearActiveKey() {
  document.querySelectorAll('.is-active').forEach((el) => el.classList.remove('is-active'));
}

function getSubmapForPos(layout, row, col) {
  return layout.submaps.find(
    (s) => row >= s.rowOffset && row < s.rowOffset + layout.baseRows && col >= s.colOffset && col < s.colOffset + layout.baseCols,
  );
}

// Declared-key bitstrings of two K-map-adjacent cells always differ in
// exactly one bit -- this is a bitwise XOR over the two bitstrings, reduced
// to the position of the (single) set bit, which tells us which truth-table
// column/variable that neighbor corresponds to.
function findDifferingBitIndex(a, b) {
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return i;
  }
  return -1;
}

// Fixed per-direction colors: the K-map side is the source of truth here --
// "up" is always orange no matter which cell you're hovering, even though on
// a 3- or 4-variable K-map "up" can flip a different variable depending on
// where you are in the Gray-code sequence (one axis carries 2 bits once
// there are more than 4 core variable slots... actually once total cols/rows
// exceed 2). The truth table then borrows *this* color for whichever bit the
// XOR says actually changed, so the two views always agree per-hover even
// though a single variable isn't pinned to one fixed color globally.
const KMAP_ADJACENCY_DIRECTION_COLORS = {
  up: '#FF5E00',
  down: '#00FFFF',
  left: '#FF00FF',
  right: '#39FF14',
};

// The single source of truth for "what is adjacent to this cell, in which
// direction, which truth-table bit does it correspond to, and what color" --
// both the K-map highlight and the truth-table highlight are driven from
// this same list so they can never disagree.
function getAdjacencyNeighborsForKey(key) {
  const pos = state.keyMaps.declaredKeyToPos[key];
  if (!pos) return [];
  const layout = state.layout;
  const sub = getSubmapForPos(layout, pos.row, pos.col);
  if (!sub) return [];
  const localRow = pos.row - sub.rowOffset;
  const localCol = pos.col - sub.colOffset;
  const raw = [];
  if (layout.baseRows > 1) {
    const up = (localRow - 1 + layout.baseRows) % layout.baseRows;
    const down = (localRow + 1) % layout.baseRows;
    raw.push({ row: sub.rowOffset + up, col: pos.col, direction: 'up' });
    if (down !== up) raw.push({ row: sub.rowOffset + down, col: pos.col, direction: 'down' });
  }
  if (layout.baseCols > 1) {
    const left = (localCol - 1 + layout.baseCols) % layout.baseCols;
    const right = (localCol + 1) % layout.baseCols;
    raw.push({ row: pos.row, col: sub.colOffset + left, direction: 'left' });
    if (right !== left) raw.push({ row: pos.row, col: sub.colOffset + right, direction: 'right' });
  }
  return raw.map(({ row, col, direction }) => {
    const neighborKey = state.keyMaps.posToDeclaredKey[kmapCellKey(row, col)];
    const bitIndex = neighborKey ? findDifferingBitIndex(key, neighborKey) : -1;
    return { row, col, direction, neighborKey, bitIndex, color: KMAP_ADJACENCY_DIRECTION_COLORS[direction] };
  });
}

// Highlights every truth-table row adjacent to `key`. Which row and which
// bit column is read straight off data-declared-key via getAdjacencyNeighborsForKey
// (XOR against the hovered key), and each uses the same fixed direction
// color the K-map assigned that neighbor -- so hovering either view paints
// the identical picture in both.
function applyRowAdjacencyHighlight(key) {
  const hoveredRow = truthTableBody.querySelector(`tr[data-declared-key="${key}"]`);
  const hoveredCells = hoveredRow ? hoveredRow.querySelectorAll('td') : null;
  getAdjacencyNeighborsForKey(key).forEach(({ neighborKey, bitIndex, color }) => {
    if (!neighborKey || bitIndex === -1) return;
    const row = truthTableBody.querySelector(`tr[data-declared-key="${neighborKey}"]`);
    if (!row) return;
    row.classList.add('row-adjacent');
    row.style.setProperty('--adjacency-color', color);
    row.style.setProperty('--adjacency-bg', colorWithAlpha(color, 0.14));
    const cells = row.querySelectorAll('td');
    if (cells[bitIndex]) {
      cells[bitIndex].classList.add('bit-diff');
      cells[bitIndex].style.setProperty('--bit-diff-color', color);
    }
    if (hoveredCells && hoveredCells[bitIndex]) {
      hoveredCells[bitIndex].classList.add('bit-diff');
      hoveredCells[bitIndex].style.setProperty('--bit-diff-color', color);
    }
  });
}

function clearRowAdjacencyHighlight() {
  truthTableBody.querySelectorAll('.row-adjacent').forEach((row) => {
    row.classList.remove('row-adjacent');
    row.style.removeProperty('--adjacency-color');
    row.style.removeProperty('--adjacency-bg');
  });
  truthTableBody.querySelectorAll('.bit-diff').forEach((td) => {
    td.classList.remove('bit-diff');
    td.style.removeProperty('--bit-diff-color');
  });
}

// Highlights every cell adjacent (one Gray-code bit away) to the hovered
// K-map cell, including wraparound across the top/bottom and left/right
// edges, each colored by its fixed compass direction (see
// getAdjacencyNeighborsForKey / KMAP_ADJACENCY_DIRECTION_COLORS above).
function applyAdjacencyHighlight(td) {
  const input = td.querySelector('.kmap-cell-input');
  if (!input) return;
  const row = Number(input.dataset.rowIndex);
  const col = Number(input.dataset.colIndex);
  const hoveredKey = state.keyMaps.posToDeclaredKey[kmapCellKey(row, col)];
  if (!hoveredKey) return;
  getAdjacencyNeighborsForKey(hoveredKey).forEach(({ row: nr, col: nc, color }) => {
    const neighborInput = kmapGridCollection.querySelector(
      `.kmap-cell-input[data-row-index="${nr}"][data-col-index="${nc}"]`,
    );
    const neighborTd = neighborInput?.closest('td');
    if (!neighborTd) return;
    neighborTd.classList.add('adjacency-highlight');
    neighborTd.style.setProperty('--adjacency-cell-color', color);
    neighborTd.style.setProperty('--adjacency-cell-bg', colorWithAlpha(color, 0.18));
  });
}

function clearAdjacencyHighlight() {
  kmapGridCollection.querySelectorAll('.adjacency-highlight').forEach((td) => {
    td.classList.remove('adjacency-highlight');
    td.style.removeProperty('--adjacency-cell-color');
    td.style.removeProperty('--adjacency-cell-bg');
  });
}

// ---------------------------------------------------------------------------
// Group Helper: hover a target-value cell to preview the largest valid
// group containing it, click to add that group as a term in the primary
// expression tray. A "valid group" on one axis is any circular-contiguous,
// power-of-two-length run of Gray-code positions — Gray coding guarantees
// every such run is a legal subcube, wraparound included.
// ---------------------------------------------------------------------------
let groupHelperEnabled = false;

function circularBlocksContaining(size, index) {
  const blocks = [];
  for (let len = size; len >= 1; len /= 2) {
    for (let start = 0; start < size; start += 1) {
      let contains = false;
      for (let k = 0; k < len; k += 1) {
        if ((start + k) % size === index) {
          contains = true;
          break;
        }
      }
      if (contains) blocks.push({ start, len });
    }
  }
  return blocks;
}

function getCellValueFor(kmap, row, col) {
  return (kmap.cells && kmap.cells[kmapCellKey(row, col)]) || '0';
}

// Every legal Gray-code rectangle containing (row, col) whose cells are all
// `targetValue` -- not just the largest. Used both to find the true maximum
// (findLargestGroupContaining) and, for the "Spot the Invalid Grouping"
// game, to find smaller-than-maximum valid groups to present as mistakes.
function findAllValidGroupsContaining(layout, targetValue, row, col, getValue = getValueForPos) {
  const sub = getSubmapForPos(layout, row, col);
  if (!sub) return [];
  const localRow = row - sub.rowOffset;
  const localCol = col - sub.colOffset;
  const rowBlocks = circularBlocksContaining(layout.baseRows, localRow);
  const colBlocks = circularBlocksContaining(layout.baseCols, localCol);
  const results = [];

  rowBlocks.forEach((rb) => {
    colBlocks.forEach((cb) => {
      const cells = [];
      let allMatch = true;
      for (let dr = 0; dr < rb.len && allMatch; dr += 1) {
        for (let dc = 0; dc < cb.len; dc += 1) {
          const r = sub.rowOffset + ((rb.start + dr) % layout.baseRows);
          const c = sub.colOffset + ((cb.start + dc) % layout.baseCols);
          if (getValue(r, c) !== targetValue) {
            allMatch = false;
            break;
          }
          cells.push({ row: r, col: c });
        }
      }
      if (allMatch) results.push({ area: rb.len * cb.len, cells });
    });
  });

  return results;
}

function findLargestGroupContaining(layout, targetValue, row, col, getValue = getValueForPos) {
  const groups = findAllValidGroupsContaining(layout, targetValue, row, col, getValue);
  if (!groups.length) return null;
  return groups.reduce((best, cur) => (cur.area > best.area ? cur : best));
}

// Reduces a set of cells to a boolean product term: a variable is included
// (negated if it's constant-0 across the group) only if it's constant across
// every cell in the group; a variable that varies is simply omitted.
function groupToTerm(layout, cells) {
  const orderedVars = kmapVariablesForLayout(layout);
  const assignments = cells.map((cell) => {
    const { key } = computeCellKeyForLayout(layout, cell.row, cell.col);
    const assignment = {};
    orderedVars.forEach((v, idx) => {
      assignment[v] = key[idx];
    });
    return assignment;
  });
  const tokens = [];
  state.variables.forEach((v) => {
    const values = new Set(assignments.map((a) => a[v]));
    if (values.size === 1) {
      const bit = [...values][0];
      tokens.push({ type: 'var', value: v, negated: bit === '0' });
    }
  });
  return tokens;
}

function addTermToPrimaryTray(tokens) {
  if (!tokens.length) return;
  const tray = document.querySelector('.kmap-expression-tray[data-tray-role="primary"]');
  if (!tray) return;
  const existing = [...getTrayTokens(state.kmap, tray)];
  const newCanonical = tokensToCanonical(tokens);
  const existingSignatures = splitExpressionSections(existing).map((section) => tokensToCanonical(section));
  if (existingSignatures.includes(newCanonical)) return;
  const updated = existing.length ? [...existing, { type: 'op', value: '+' }, ...tokens] : [...tokens];
  updateKmapExpressionTokens(state.kmap, updated, tray);
}

function getGroupHelperTargetValue() {
  return state.kmap.type === 'pos' ? '0' : '1';
}

function applyGroupPreview(td) {
  const input = td.querySelector('.kmap-cell-input');
  if (!input) return;
  const row = Number(input.dataset.rowIndex);
  const col = Number(input.dataset.colIndex);
  if (getValueForPos(row, col) !== getGroupHelperTargetValue()) return;
  const group = findLargestGroupContaining(state.layout, getGroupHelperTargetValue(), row, col);
  if (!group) return;
  group.cells.forEach(({ row: r, col: c }) => {
    const cellInput = kmapGridCollection.querySelector(
      `.kmap-cell-input[data-row-index="${r}"][data-col-index="${c}"]`,
    );
    const cellTd = cellInput?.closest('td');
    if (cellTd) cellTd.classList.add('group-preview');
  });
}

function clearGroupPreview() {
  kmapGridCollection.querySelectorAll('.group-preview').forEach((td) => td.classList.remove('group-preview'));
}

function commitPreviewedGroup(input) {
  const row = Number(input.dataset.rowIndex);
  const col = Number(input.dataset.colIndex);
  if (getValueForPos(row, col) !== getGroupHelperTargetValue()) return;
  const group = findLargestGroupContaining(state.layout, getGroupHelperTargetValue(), row, col);
  if (!group) return;
  const tokens = groupToTerm(state.layout, group.cells);
  addTermToPrimaryTray(tokens);
}

function hasAnyTargetCell() {
  const target = getGroupHelperTargetValue();
  return Object.values(state.kmap.cells).some((v) => v === target);
}

// A kmap that's the target value in every single cell (all 1s for SOP, all
// 0s for POS) has exactly one "group" -- the whole grid -- and every
// variable varies across it, so Group Helper can't reduce it to a term at
// all (see groupToTerm). Needs at least one non-target cell to do anything.
function hasVarietyForGrouping() {
  const target = getGroupHelperTargetValue();
  const values = Object.values(state.kmap.cells);
  return values.some((v) => v === target) && values.some((v) => v !== target);
}

// Single source of truth for Group Helper's button/label/hint state: it can
// only be turned on once there's something to group, and its hint always
// names the value it's actually grouping (1s for SOP, 0s for POS).
function updateGroupHelperAvailability() {
  const groupHelperBtn = document.getElementById('groupHelperBtn');
  const groupHelperNote = document.getElementById('groupHelperNote');
  if (!groupHelperBtn || !groupHelperNote) return;
  const target = getGroupHelperTargetValue();
  const hasTarget = hasAnyTargetCell();
  const available = hasVarietyForGrouping();

  if (!available && groupHelperEnabled) {
    groupHelperEnabled = false;
    clearGroupPreview();
  }

  groupHelperBtn.disabled = !available;
  groupHelperBtn.classList.toggle('active', groupHelperEnabled);
  groupHelperBtn.textContent = groupHelperEnabled ? 'Group Helper: On' : 'Group Helper: Off';
  document.body.classList.toggle('group-helper-active', groupHelperEnabled);

  if (!hasTarget) {
    groupHelperNote.hidden = false;
    groupHelperNote.textContent = `Add ${target}'s before activating Group Helper`;
  } else if (!available) {
    const outputName = state.kmap.label || 'F';
    const label = state.kmap.type === 'pos' ? `${outputName}'` : outputName;
    groupHelperNote.hidden = false;
    groupHelperNote.textContent = `With this kmap ${label}=${target}, add some variety!`;
  } else if (groupHelperEnabled) {
    groupHelperNote.hidden = false;
    groupHelperNote.textContent = `Click a highlighted group of ${target}'s to add it to the expression`;
  } else {
    groupHelperNote.hidden = true;
  }
}

// ---------------------------------------------------------------------------
// Expression-building UI: variable tray, primary tray (SOP of F, or of F'
// when POS), the DeMorgan "F=" tray (POS only), and the Verify button.
// Structure/classes match FiniteStateMachine's kmap-card expression row.
// ---------------------------------------------------------------------------
function renderExpressionSection() {
  const container = document.getElementById('kmapExpressionSection');
  container.innerHTML = '';
  const kmap = state.kmap;
  const isPos = kmap.type === 'pos';

  const directions = document.createElement('p');
  directions.className = 'expression-directions';
  directions.textContent = 'Drag tokens to build • click a literal to negate (A ⇄ A′) • select + Backspace to delete';
  container.appendChild(directions);

  const variableTray = document.createElement('div');
  variableTray.className = 'kmap-variable-tray';
  const trayLabel = document.createElement('span');
  trayLabel.className = 'kmap-tray-label';
  trayLabel.textContent = 'Variables';
  variableTray.appendChild(trayLabel);
  const trayItems = document.createElement('div');
  trayItems.className = 'kmap-variable-items';
  state.variables.forEach((name) => {
    trayItems.appendChild(buildTrayToken({ type: 'var', value: name }));
  });
  ['+', '*', '(', ')'].forEach((op) => {
    trayItems.appendChild(buildTrayToken({ type: op === '(' || op === ')' ? 'paren' : 'op', value: op }));
  });
  variableTray.appendChild(trayItems);
  container.appendChild(variableTray);

  const labelRow = document.createElement('div');
  labelRow.className = 'kmap-f-label-row';
  const label = document.createElement('span');
  label.className = 'kmap-expression-label';
  const primaryName = isPos
    ? `<span class="kmap-overline-text">${formatScriptedText(kmap.label || 'F')}</span>`
    : formatScriptedText(kmap.label || 'F');
  label.innerHTML = `${primaryName} Σ =`;
  labelRow.appendChild(label);
  if (isPos) {
    const primaryHint = document.createElement('span');
    primaryHint.className = 'kmap-tray-hint';
    primaryHint.innerHTML = `Hint: Build an SOP expression for <span class="kmap-overline-text">${formatScriptedText(kmap.label || 'F')}</span>.`;
    labelRow.appendChild(primaryHint);
  }
  container.appendChild(labelRow);

  const exprTrayWrapper = document.createElement('div');
  exprTrayWrapper.className = 'kmap-expression-tray-wrapper';
  const exprTray = document.createElement('div');
  exprTray.className = 'kmap-expression-tray';
  exprTray.tabIndex = 0;
  exprTray.dataset.kmapId = kmap.id;
  exprTray.dataset.trayRole = 'primary';
  const parsedTokens = kmap.expressionTokens || expressionStringToTokens(kmap.expression || '');
  kmap.expressionTokens = parsedTokens;
  renderExpressionTray(exprTray, parsedTokens, kmap.id);
  exprTrayWrapper.appendChild(exprTray);

  if (isPos) {
    const fBlock = document.createElement('div');
    fBlock.className = 'kmap-f-tray-block';

    const fLabelRow = document.createElement('div');
    fLabelRow.className = 'kmap-f-label-row';
    const fLabel = document.createElement('span');
    fLabel.className = 'kmap-expression-label';
    fLabel.innerHTML = `${formatScriptedText(kmap.label || 'F')} =`;
    const fHint = document.createElement('span');
    fHint.className = 'kmap-tray-hint';
    fHint.textContent = "Hint: apply DeMorgan's Law to the expression above.";
    fLabelRow.append(fLabel, fHint);
    fBlock.appendChild(fLabelRow);

    const fExprTray = document.createElement('div');
    fExprTray.className = 'kmap-expression-tray';
    fExprTray.tabIndex = 0;
    fExprTray.dataset.kmapId = kmap.id;
    fExprTray.dataset.trayRole = 'f';
    const fParsedTokens = kmap.fExpressionTokens || expressionStringToTokens(kmap.fExpression || '');
    kmap.fExpressionTokens = fParsedTokens;
    renderExpressionTray(fExprTray, fParsedTokens, kmap.id);
    fBlock.appendChild(fExprTray);

    exprTrayWrapper.appendChild(fBlock);
  }

  const controls = document.createElement('div');
  controls.className = 'kmap-expression-actions';
  const verifyBtn = document.createElement('button');
  verifyBtn.textContent = 'Verify';
  verifyBtn.type = 'button';
  verifyBtn.id = 'verifyKmapBtn';
  controls.appendChild(verifyBtn);
  exprTrayWrapper.appendChild(controls);

  container.appendChild(exprTrayWrapper);
}

function runVerify() {
  const verifyBtn = document.getElementById('verifyKmapBtn');
  const resultText = document.getElementById('verifyResultText');
  const result = verifyKmapExpression(state.kmap);
  verifyBtn.classList.toggle('verified', !!result.passed);
  verifyBtn.classList.toggle('failed', !result.passed);
  verifyBtn.classList.toggle('not-minimal', result.minimal === false);
  verifyBtn.title = result.passed ? 'Expression matches K-map' : result.reason || 'Expression verification failed';
  resultText.textContent = result.passed
    ? 'Correct! Expression matches the K-map.'
    : result.reason || 'Expression verification failed';
  resultText.classList.toggle('passed', !!result.passed);
  resultText.classList.toggle('failed', !result.passed);
}

let kmapExpressionDragState = null;

// Expression trays exist in two places: the Learn-mode panel (backed by
// state.kmap) and the "Minimal Expression Sprint" game panel (backed by
// gameState.sprint.kmap). Delegate broadly and resolve which kmap a given
// tray belongs to, rather than duplicating the whole drag/drop/click wiring.
function resolveKmapForTray(tray) {
  if (tray.closest('#gamePanel')) {
    return gameState.sprint ? gameState.sprint.kmap : null;
  }
  return state.kmap;
}

function initExpressionDragAndDrop() {
  const container = document;

  container.addEventListener('dragstart', (e) => {
    const tokenEl = e.target.closest('.kmap-token, .kmap-expr-token');
    if (!tokenEl) return;
    const type = tokenEl.dataset.tokenType;
    const value = tokenEl.dataset.tokenValue;
    const fromIndex = tokenEl.classList.contains('kmap-expr-token') ? parseInt(tokenEl.dataset.index, 10) : null;
    const fromTrayRole = tokenEl.closest('.kmap-expression-tray')?.dataset.trayRole || 'primary';
    kmapExpressionDragState = {
      source: tokenEl.classList.contains('kmap-expr-token') ? 'expression' : 'tray',
      type,
      value,
      fromIndex,
      fromTrayRole,
    };
    e.dataTransfer.setData('text/plain', `${type}:${value}`);
  });

  container.addEventListener('dragover', (e) => {
    const tray = e.target.closest('.kmap-expression-tray');
    if (!tray) return;
    e.preventDefault();
    const tokens = getTrayTokens(resolveKmapForTray(tray), tray);
    const targetToken = e.target.closest('.kmap-expr-token');
    const marker = ensureDropMarker(tray);
    if (targetToken && targetToken.parentNode === tray) {
      const rect = targetToken.getBoundingClientRect();
      const before = e.clientX < rect.left + rect.width / 2;
      tray.insertBefore(marker, before ? targetToken : targetToken.nextSibling);
    } else if (!marker.parentNode) {
      tray.appendChild(marker);
    }
    const sequence = [...tray.querySelectorAll('.kmap-expr-token, .kmap-drop-marker')];
    const markerIndex = sequence.indexOf(marker);
    const index = markerIndex === -1 ? tokens.length : markerIndex;
    marker.dataset.index = index;
  });

  container.addEventListener('dragleave', (e) => {
    const tray = e.target.closest('.kmap-expression-tray');
    if (tray && !tray.contains(e.relatedTarget)) clearDropMarker(tray);
  });

  container.addEventListener('drop', (e) => {
    const tray = e.target.closest('.kmap-expression-tray');
    if (!tray) return;
    e.preventDefault();
    const marker = tray.querySelector('.kmap-drop-marker');
    const kmap = resolveKmapForTray(tray);
    if (!kmap) return;
    const tokens = [...getTrayTokens(kmap, tray)];
    const payload = kmapExpressionDragState;
    kmapExpressionDragState = null;
    if (!payload || !payload.type) return;

    let index = tokens.length;
    if (marker && marker.parentNode === tray) {
      const sequence = [...tray.querySelectorAll('.kmap-expr-token, .kmap-drop-marker')];
      const markerIndex = sequence.indexOf(marker);
      index = markerIndex === -1 ? tokens.length : markerIndex;
    }
    clearDropMarker(tray);

    const destTrayRole = tray.dataset.trayRole || 'primary';
    if (payload.source === 'expression' && payload.fromTrayRole === destTrayRole) {
      if (!Number.isNaN(payload.fromIndex)) {
        tokens.splice(payload.fromIndex, 1);
        if (index > payload.fromIndex) index -= 1;
      }
    }

    const token = { type: payload.type, value: payload.value };
    if (token.type === 'var') token.negated = false;
    const insertAt = Math.max(0, Math.min(tokens.length, index));
    tokens.splice(insertAt, 0, token);
    if (token.type === 'paren' && token.value === '(') {
      tokens.splice(insertAt + 1, 0, { type: 'paren', value: ')' });
    }
    updateKmapExpressionTokens(kmap, tokens, tray);
  });

  container.addEventListener('dragend', () => {
    document.querySelectorAll('.kmap-drop-marker').forEach((el) => el.remove());
    kmapExpressionDragState = null;
  });

  container.addEventListener('keydown', (e) => {
    const exprTray = e.target.closest && e.target.closest('.kmap-expression-tray');
    if (!exprTray) return;
    const kmap = resolveKmapForTray(exprTray);
    if (!kmap) return;
    const tokens = [...getTrayTokens(kmap, exprTray)];
    const selected = exprTray.querySelector('.kmap-expr-token.selected');
    if ((e.key === 'Backspace' || e.key === 'Delete') && selected) {
      const idx = parseInt(selected.dataset.index, 10);
      if (!Number.isNaN(idx)) {
        tokens.splice(idx, 1);
        updateKmapExpressionTokens(kmap, tokens, exprTray);
      }
      e.preventDefault();
    }
  });

  container.addEventListener('click', (e) => {
    if (e.target.closest('#verifyKmapBtn')) {
      runVerify();
      return;
    }
    const exprToken = e.target.closest('.kmap-expr-token');
    if (exprToken) {
      const tray = exprToken.closest('.kmap-expression-tray');
      const kmap = resolveKmapForTray(tray);
      if (!kmap) return;
      tray.focus();
      const idx = parseInt(exprToken.dataset.index, 10);
      if (Number.isNaN(idx)) return;
      const tokens = [...getTrayTokens(kmap, tray)];
      const token = tokens[idx];
      if (!token) return;
      tray.querySelectorAll('.kmap-expr-token.selected').forEach((el) => el.classList.remove('selected'));
      if (token.type === 'var') token.negated = !token.negated;
      updateKmapExpressionTokens(kmap, tokens, tray);
      const newToken = tray.querySelector(`.kmap-expr-token[data-index="${idx}"]`);
      if (newToken) newToken.classList.add('selected');
      return;
    }
    const tray = e.target.closest('.kmap-expression-tray');
    if (tray) {
      tray.focus();
      tray.querySelectorAll('.kmap-expr-token.selected').forEach((el) => el.classList.remove('selected'));
    }
  });
}

// ---------------------------------------------------------------------------
// Practice mode: a random-puzzle generator, a read-only K-map renderer shared
// by all three games, and the games themselves. Each game keeps its round
// state under `gameState.<game>` and re-renders `#gamePanel` from scratch.
// ---------------------------------------------------------------------------
const gameState = {
  activeGame: 'spot',
  score: 0,
  streak: 0,
  spot: null,
  sprint: null,
  largest: null,
};

function randomVarCountForGames() {
  return 2 + Math.floor(Math.random() * 3); // 2, 3, or 4
}

// Random cell values, regenerated if degenerate (all-0 or all-1 - no groups
// to find, nothing to circle, no expression worth building).
function generateGameKmap(varCount) {
  const variables = VARIABLE_POOL.slice(0, varCount);
  const kmap = { id: 'game', label: 'F', type: 'sop', direction: 'horizontal', variables, cells: {} };
  const layout = buildKmapLayout(kmap);
  const total = layout.totalRows * layout.totalCols;
  let ones = 0;
  let attempts = 0;
  do {
    ones = 0;
    for (let r = 0; r < layout.totalRows; r += 1) {
      for (let c = 0; c < layout.totalCols; c += 1) {
        const v = Math.random() < 0.5 ? '1' : '0';
        kmap.cells[kmapCellKey(r, c)] = v;
        if (v === '1') ones += 1;
      }
    }
    attempts += 1;
  } while ((ones === 0 || ones === total) && attempts < 20);
  return { kmap, layout };
}

function updateGameStats() {
  const scoreEl = document.getElementById('gameScore');
  const streakEl = document.getElementById('gameStreak');
  if (scoreEl) scoreEl.textContent = `Score: ${gameState.score}`;
  if (streakEl) streakEl.textContent = `Streak: ${gameState.streak}`;
}

function recordGameOutcome(correct, points = 1) {
  if (correct) {
    gameState.score += points;
    gameState.streak += 1;
  } else {
    gameState.streak = 0;
  }
  updateGameStats();
}

function setGameInstruction(text) {
  const el = document.getElementById('gameInstructionText');
  if (el) el.textContent = text;
}

// Renders a read-only K-map (no circle overlay, no expression tray) into
// `container`, reusing the same layout/table builders as Learn mode.
function renderGameKmapGrid(container, kmap, layout) {
  container.innerHTML = '';
  const wrapper = document.createElement('div');
  wrapper.className = 'kmap-grid-wrapper';
  const collection = document.createElement('div');
  collection.className = 'kmap-grid-collection';
  collection.style.gridTemplateColumns = `repeat(${layout.mapCols}, minmax(0, 1fr))`;
  layout.submaps.forEach((submap) => {
    const submapWrap = document.createElement('div');
    submapWrap.className = 'kmap-submap';
    submapWrap.appendChild(buildKmapTable(kmap, layout, submap));
    collection.appendChild(submapWrap);
  });
  wrapper.appendChild(collection);
  const overlay = document.createElement('div');
  overlay.className = 'kmap-circle-overlay';
  wrapper.appendChild(overlay);
  container.appendChild(wrapper);
  container.querySelectorAll('.kmap-cell-input').forEach((input) => {
    input.readOnly = true;
    input.tabIndex = -1;
  });
  return wrapper;
}

// Finds a valid (not necessarily globally minimal, but always a genuine
// minimal-style cover) set of groups for every 1-cell in `kmap`, via a greedy
// largest-group-first set cover -- used to reveal a "correct answer" grouping
// in the Minimal Expression Sprint game after the student verifies.
function findMinimalCoverGroups(kmap, layout) {
  const targetValue = '1';
  const posKey = (row, col) => `${row}-${col}`;
  const oneCells = [];
  for (let r = 0; r < layout.totalRows; r += 1) {
    for (let c = 0; c < layout.totalCols; c += 1) {
      if (getCellValueFor(kmap, r, c) === targetValue) oneCells.push({ row: r, col: c });
    }
  }
  if (!oneCells.length) return [];

  const candidatesByKey = new Map();
  oneCells.forEach(({ row, col }) => {
    const group = findLargestGroupContaining(layout, targetValue, row, col, (r, c) => getCellValueFor(kmap, r, c));
    if (!group) return;
    const dedupeKey = group.cells.map((c) => posKey(c.row, c.col)).sort().join(',');
    if (!candidatesByKey.has(dedupeKey)) candidatesByKey.set(dedupeKey, group.cells);
  });

  const covered = new Set();
  const chosen = [];
  const remaining = [...candidatesByKey.values()];
  while (covered.size < oneCells.length && remaining.length) {
    let bestIdx = -1;
    let bestNewCount = 0;
    remaining.forEach((cells, idx) => {
      const newCount = cells.filter((c) => !covered.has(posKey(c.row, c.col))).length;
      if (newCount > bestNewCount) {
        bestNewCount = newCount;
        bestIdx = idx;
      }
    });
    if (bestIdx === -1) break;
    const picked = remaining.splice(bestIdx, 1)[0];
    picked.forEach((c) => covered.add(posKey(c.row, c.col)));
    chosen.push(picked);
  }
  return chosen;
}

// Draws the model-answer groups from findMinimalCoverGroups directly onto an
// overlay, bypassing the expression-tokens path entirely (there is no
// expression here -- these groups were found algorithmically).
function renderModelAnswerCircles(kmap, layout, gridContainer, overlay) {
  overlay.innerHTML = '';
  const groups = findMinimalCoverGroups(kmap, layout);
  if (!groups.length) return;
  const allCells = collectKmapCells(kmap, gridContainer, layout);
  const cellByPos = new Map(allCells.map((c) => [`${c.row}-${c.col}`, c]));
  const overlayRect = overlay.getBoundingClientRect();
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', '100%');
  svg.setAttribute('height', '100%');
  overlay.appendChild(svg);
  groups.forEach((groupCells, idx) => {
    const matchedCells = groupCells.map((gc) => cellByPos.get(`${gc.row}-${gc.col}`)).filter(Boolean);
    const activeCells = computeActiveCellRects(matchedCells, overlayRect);
    const svgGroup = buildCircleGroupFromActiveCells(activeCells, idx, layout, 0);
    if (svgGroup) svg.appendChild(svgGroup);
  });
}

// --- Shape/validity judging, shared by "Spot the Invalid Grouping" and
// "Circle the Largest Group" (both need to judge an arbitrary cell set,
// not just the one Group Helper would have picked). ---
function computeBlockSet(size, start, len) {
  const set = new Set();
  for (let k = 0; k < len; k += 1) set.add((start + k) % size);
  return set;
}

function findMatchingBlock(size, indexSet) {
  const len = indexSet.size;
  if (len === 0 || (len & (len - 1)) !== 0) return null;
  for (let start = 0; start < size; start += 1) {
    const block = computeBlockSet(size, start, len);
    if ([...indexSet].every((i) => block.has(i))) return { start, len };
  }
  return null;
}

function evaluateGroupShape(layout, cells) {
  if (!cells.length) return { validShape: false, reason: 'No cells selected' };
  const firstSub = getSubmapForPos(layout, cells[0].row, cells[0].col);
  const sameSub = cells.every((c) => {
    const s = getSubmapForPos(layout, c.row, c.col);
    return s && firstSub && s.mapRow === firstSub.mapRow && s.mapCol === firstSub.mapCol;
  });
  if (!sameSub) return { validShape: false, reason: 'Cells span more than one sub-map' };
  const localRows = new Set(cells.map((c) => c.row - firstSub.rowOffset));
  const localCols = new Set(cells.map((c) => c.col - firstSub.colOffset));
  if (cells.length !== localRows.size * localCols.size) {
    return { validShape: false, reason: 'Cells do not form a complete rectangle' };
  }
  const rowBlock = findMatchingBlock(layout.baseRows, localRows);
  const colBlock = findMatchingBlock(layout.baseCols, localCols);
  if (!rowBlock || !colBlock) {
    return { validShape: false, reason: 'Not a power-of-two, Gray-code-aligned block' };
  }
  return { validShape: true };
}

function evaluateGroupValidity(kmap, layout, cells, targetValue) {
  const shape = evaluateGroupShape(layout, cells);
  if (!shape.validShape) return { valid: false, reason: shape.reason };
  const badCell = cells.find((c) => getCellValueFor(kmap, c.row, c.col) !== targetValue);
  if (badCell) return { valid: false, reason: `Includes a cell that is not ${targetValue}` };
  return { valid: true };
}

// Same as evaluateGroupValidity, but also rejects a legally-shaped,
// all-target-value group if it isn't the largest one available -- circling
// a real K-map group that could still be expanded is a genuine mistake, even
// though "Circle the Largest Group" (a different game) scores that case as
// "valid but not maximal" rather than flatly invalid.
function evaluateSpotGroupValidity(kmap, layout, cells, targetValue) {
  const base = evaluateGroupValidity(kmap, layout, cells, targetValue);
  if (!base.valid) return base;
  const seed = cells[0];
  const groups = findAllValidGroupsContaining(layout, targetValue, seed.row, seed.col, (r, c) => getCellValueFor(kmap, r, c));
  const maxArea = groups.length ? Math.max(...groups.map((g) => g.area)) : cells.length;
  if (cells.length < maxArea) {
    return { valid: false, reason: `Not the largest possible group — it could be expanded to ${maxArea} cells` };
  }
  return { valid: true };
}

function pickRandomTargetCell(kmap, layout, targetValue) {
  const candidates = [];
  for (let r = 0; r < layout.totalRows; r += 1) {
    for (let c = 0; c < layout.totalCols; c += 1) {
      if (getCellValueFor(kmap, r, c) === targetValue) candidates.push({ row: r, col: c });
    }
  }
  if (!candidates.length) return null;
  return candidates[Math.floor(Math.random() * candidates.length)];
}

// --- Game: Spot the Invalid Grouping ---
function startSpotGame() {
  const varCount = randomVarCountForGames();
  const { kmap, layout } = generateGameKmap(varCount);
  const targetValue = '1';
  const seed = pickRandomTargetCell(kmap, layout, targetValue);
  const getValue = (r, c) => getCellValueFor(kmap, r, c);

  const makeValidClaim = () => {
    if (!seed) return null;
    const group = findLargestGroupContaining(layout, targetValue, seed.row, seed.col, getValue);
    return group ? group.cells : null;
  };

  // A claim that's a genuinely legal, all-1s rectangle -- just not the
  // largest one available from that spot. The classic "forgot to expand the
  // group as far as it will go" mistake, distinct from a wrong-shape/value one.
  const makeNonMaximalClaim = () => {
    const targetCells = [];
    for (let r = 0; r < layout.totalRows; r += 1) {
      for (let c = 0; c < layout.totalCols; c += 1) {
        if (getValue(r, c) === targetValue) targetCells.push({ row: r, col: c });
      }
    }
    for (let attempt = 0; attempt < targetCells.length; attempt += 1) {
      const candidate = targetCells[Math.floor(Math.random() * targetCells.length)];
      const groups = findAllValidGroupsContaining(layout, targetValue, candidate.row, candidate.col, getValue);
      if (groups.length < 2) continue;
      const maxArea = Math.max(...groups.map((g) => g.area));
      const smaller = groups.filter((g) => g.area < maxArea);
      if (smaller.length) return smaller[Math.floor(Math.random() * smaller.length)].cells;
    }
    return null;
  };

  const makeBrokenClaim = () => {
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const sub = layout.submaps[Math.floor(Math.random() * layout.submaps.length)];
      const rowLen = 2 ** Math.floor(Math.random() * (Math.log2(layout.baseRows) + 1));
      const colLen = 2 ** Math.floor(Math.random() * (Math.log2(layout.baseCols) + 1));
      const rowStart = Math.floor(Math.random() * layout.baseRows);
      const colStart = Math.floor(Math.random() * layout.baseCols);
      const cells = [];
      for (let dr = 0; dr < rowLen; dr += 1) {
        for (let dc = 0; dc < colLen; dc += 1) {
          cells.push({
            row: sub.rowOffset + ((rowStart + dr) % layout.baseRows),
            col: sub.colOffset + ((colStart + dc) % layout.baseCols),
          });
        }
      }
      if (!evaluateGroupValidity(kmap, layout, cells, targetValue).valid) return cells;
    }
    // Guaranteed-invalid fallback: a diagonal pair (2 bits apart, not adjacent).
    const r1 = (1) % layout.totalRows;
    const c1 = (1) % layout.totalCols;
    return [{ row: 0, col: 0 }, { row: r1, col: c1 }];
  };

  let claimedCells;
  const roll = Math.random();
  if (roll < 0.5) {
    claimedCells = makeValidClaim() || makeBrokenClaim();
  } else if (roll < 0.75) {
    claimedCells = makeNonMaximalClaim() || makeBrokenClaim();
  } else {
    claimedCells = makeBrokenClaim();
  }
  const isActuallyValid = evaluateSpotGroupValidity(kmap, layout, claimedCells, targetValue).valid;

  gameState.spot = { kmap, layout, targetValue, claimedCells, isActuallyValid, answered: false };
  renderSpotGame();
}

function renderSpotGame() {
  const round = gameState.spot;
  const panel = document.getElementById('gamePanel');
  panel.innerHTML = '';

  setGameInstruction('The highlighted cells are claimed as a group of 1s — is this a valid K-map grouping?');

  const meta = document.createElement('p');
  meta.className = 'game-round-meta';
  meta.textContent = `${round.kmap.variables.length}-variable K-map`;
  panel.appendChild(meta);

  const gridContainer = document.createElement('div');
  renderGameKmapGrid(gridContainer, round.kmap, round.layout);
  panel.appendChild(gridContainer);

  round.claimedCells.forEach(({ row, col }) => {
    const input = gridContainer.querySelector(`.kmap-cell-input[data-row-index="${row}"][data-col-index="${col}"]`);
    const td = input?.closest('td');
    if (td) td.classList.add('game-claimed');
  });

  const actions = document.createElement('div');
  actions.className = 'game-answer-actions';
  const validBtn = document.createElement('button');
  validBtn.type = 'button';
  validBtn.textContent = 'Valid';
  const invalidBtn = document.createElement('button');
  invalidBtn.type = 'button';
  invalidBtn.textContent = 'Invalid';
  actions.append(validBtn, invalidBtn);
  panel.appendChild(actions);

  const feedback = document.createElement('p');
  feedback.className = 'game-feedback';
  panel.appendChild(feedback);

  const nextBtn = document.createElement('button');
  nextBtn.type = 'button';
  nextBtn.textContent = 'Next Round';
  nextBtn.className = 'secondary-btn';
  nextBtn.hidden = true;
  panel.appendChild(nextBtn);

  const answer = (guessValid) => {
    if (round.answered) return;
    round.answered = true;
    validBtn.disabled = true;
    invalidBtn.disabled = true;
    const correct = guessValid === round.isActuallyValid;
    const explanation = evaluateSpotGroupValidity(round.kmap, round.layout, round.claimedCells, round.targetValue);
    recordGameOutcome(correct);
    feedback.className = correct ? 'game-feedback correct' : 'game-feedback incorrect';
    const verdict = correct ? 'Correct!' : 'Not quite —';
    feedback.textContent = round.isActuallyValid
      ? `${verdict} That is a legal Gray-code-aligned group of all 1s.`
      : `${verdict} ${explanation.reason}.`;
    nextBtn.hidden = false;
  };

  validBtn.addEventListener('click', () => answer(true));
  invalidBtn.addEventListener('click', () => answer(false));
  nextBtn.addEventListener('click', startSpotGame);
}

// --- Game: Minimal Expression Sprint ---
function startSprintGame() {
  const varCount = randomVarCountForGames();
  const { kmap, layout } = generateGameKmap(varCount);
  gameState.sprint = { kmap, layout, verified: false };
  renderSprintGame();
}

function renderSprintGame() {
  const round = gameState.sprint;
  const panel = document.getElementById('gamePanel');
  panel.innerHTML = '';

  setGameInstruction('Build the minimal SOP expression for this K-map, then click Verify.');

  const meta = document.createElement('p');
  meta.className = 'game-round-meta';
  meta.textContent = `${round.kmap.variables.length}-variable K-map`;
  panel.appendChild(meta);

  const gridContainer = document.createElement('div');
  renderGameKmapGrid(gridContainer, round.kmap, round.layout);
  panel.appendChild(gridContainer);

  const directions = document.createElement('p');
  directions.className = 'expression-directions';
  directions.textContent = 'Drag tokens to build • click a literal to negate (A ⇄ A′) • select + Backspace to delete';
  panel.appendChild(directions);

  const variableTray = document.createElement('div');
  variableTray.className = 'kmap-variable-tray';
  const trayLabel = document.createElement('span');
  trayLabel.className = 'kmap-tray-label';
  trayLabel.textContent = 'Variables';
  variableTray.appendChild(trayLabel);
  const trayItems = document.createElement('div');
  trayItems.className = 'kmap-variable-items';
  round.kmap.variables.forEach((name) => trayItems.appendChild(buildTrayToken({ type: 'var', value: name })));
  ['+', '*', '(', ')'].forEach((op) => {
    trayItems.appendChild(buildTrayToken({ type: op === '(' || op === ')' ? 'paren' : 'op', value: op }));
  });
  variableTray.appendChild(trayItems);
  panel.appendChild(variableTray);

  const exprTray = document.createElement('div');
  exprTray.className = 'kmap-expression-tray';
  exprTray.tabIndex = 0;
  exprTray.dataset.kmapId = round.kmap.id;
  exprTray.dataset.trayRole = 'primary';
  renderExpressionTray(exprTray, round.kmap.expressionTokens || [], round.kmap.id);
  panel.appendChild(exprTray);

  const actions = document.createElement('div');
  actions.className = 'game-answer-actions';
  const verifyBtn = document.createElement('button');
  verifyBtn.type = 'button';
  verifyBtn.textContent = 'Verify';
  actions.appendChild(verifyBtn);
  const nextBtn = document.createElement('button');
  nextBtn.type = 'button';
  nextBtn.textContent = 'New Puzzle';
  nextBtn.className = 'secondary-btn';
  actions.appendChild(nextBtn);
  panel.appendChild(actions);

  const feedback = document.createElement('p');
  feedback.className = 'game-feedback';
  panel.appendChild(feedback);

  verifyBtn.addEventListener('click', () => {
    const result = verifyPrimaryKmapExpression(round.kmap);
    if (!round.verified) recordGameOutcome(!!result.passed);
    if (result.passed) round.verified = true;
    feedback.className = result.passed ? 'game-feedback correct' : 'game-feedback incorrect';
    feedback.textContent = result.passed ? 'Correct and fully minimized!' : result.reason || 'Not quite right yet.';

    const overlay = gridContainer.querySelector('.kmap-circle-overlay');
    if (overlay) renderModelAnswerCircles(round.kmap, round.layout, gridContainer, overlay);
    if (!document.getElementById('sprintAnswerNote')) {
      const answerNote = document.createElement('p');
      answerNote.id = 'sprintAnswerNote';
      answerNote.className = 'game-round-meta';
      answerNote.textContent = 'Correct grouping shown circled on the K-map above.';
      feedback.insertAdjacentElement('afterend', answerNote);
    }
  });

  nextBtn.addEventListener('click', startSprintGame);
}

// --- Game: Circle the Largest Group ---
function largestGameCellKey(row, col) {
  return `${row}-${col}`;
}

function startLargestGame() {
  const varCount = randomVarCountForGames();
  const { kmap, layout } = generateGameKmap(varCount);
  gameState.largest = { kmap, layout, targetValue: '1', selection: new Set(), answered: false };
  renderLargestGame();
}

function renderLargestGame() {
  const round = gameState.largest;
  const panel = document.getElementById('gamePanel');
  panel.innerHTML = '';

  setGameInstruction('Click every cell in the single largest valid group of 1s you can find, then submit.');

  const meta = document.createElement('p');
  meta.className = 'game-round-meta';
  meta.textContent = `${round.kmap.variables.length}-variable K-map — click cells to select or deselect them`;
  panel.appendChild(meta);

  const gridContainer = document.createElement('div');
  renderGameKmapGrid(gridContainer, round.kmap, round.layout);
  panel.appendChild(gridContainer);

  const refreshSelectionClasses = () => {
    gridContainer.querySelectorAll('.kmap-cell-input').forEach((input) => {
      const key = largestGameCellKey(Number(input.dataset.rowIndex), Number(input.dataset.colIndex));
      const td = input.closest('td');
      td.classList.toggle('game-selected', round.selection.has(key));
    });
  };

  gridContainer.addEventListener('click', (e) => {
    if (round.answered) return;
    const input = e.target.closest('.kmap-cell-input');
    if (!input) return;
    const key = largestGameCellKey(Number(input.dataset.rowIndex), Number(input.dataset.colIndex));
    if (round.selection.has(key)) round.selection.delete(key);
    else round.selection.add(key);
    refreshSelectionClasses();
  });

  const actions = document.createElement('div');
  actions.className = 'game-answer-actions';
  const submitBtn = document.createElement('button');
  submitBtn.type = 'button';
  submitBtn.textContent = 'Submit Group';
  actions.appendChild(submitBtn);
  const nextBtn = document.createElement('button');
  nextBtn.type = 'button';
  nextBtn.textContent = 'New Puzzle';
  nextBtn.className = 'secondary-btn';
  actions.appendChild(nextBtn);
  panel.appendChild(actions);

  const feedback = document.createElement('p');
  feedback.className = 'game-feedback';
  panel.appendChild(feedback);

  submitBtn.addEventListener('click', () => {
    if (round.answered) return;
    const cells = [...round.selection].map((key) => {
      const [row, col] = key.split('-').map(Number);
      return { row, col };
    });
    const validity = evaluateGroupValidity(round.kmap, round.layout, cells, round.targetValue);
    if (!validity.valid) {
      round.answered = true;
      recordGameOutcome(false);
      feedback.className = 'game-feedback incorrect';
      feedback.textContent = `Invalid group — ${validity.reason}.`;
      return;
    }
    const seed = cells[0];
    const maxGroup = findLargestGroupContaining(
      round.layout, round.targetValue, seed.row, seed.col, (r, c) => getCellValueFor(round.kmap, r, c),
    );
    const maxArea = maxGroup ? maxGroup.area : cells.length;
    round.answered = true;
    if (cells.length === maxArea) {
      recordGameOutcome(true, cells.length);
      feedback.className = 'game-feedback correct';
      feedback.textContent = `Correct! That's the largest group (${cells.length} cells).`;
    } else {
      recordGameOutcome(false);
      feedback.className = 'game-feedback incorrect';
      feedback.textContent = `Valid group, but not the largest — you found ${cells.length} cells; the largest here is ${maxArea}.`;
    }
  });

  nextBtn.addEventListener('click', startLargestGame);
}

function startGame(key) {
  gameState.activeGame = key;
  if (key === 'spot') startSpotGame();
  else if (key === 'sprint') startSprintGame();
  else if (key === 'largest') startLargestGame();
}

function setAppMode(mode) {
  const learnView = document.getElementById('learnView');
  const practiceView = document.getElementById('practiceView');
  const isLearn = mode === 'learn';
  learnView.hidden = !isLearn;
  practiceView.hidden = isLearn;
  if (!isLearn && !gameState[gameState.activeGame]) {
    startGame(gameState.activeGame);
  }
}

function initEventListeners() {
  document.querySelectorAll('.varcount-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelector('.varcount-btn.active')?.classList.remove('active');
      btn.classList.add('active');
      setVarCount(Number(btn.dataset.varcount));
    });
  });

  directionBtn.addEventListener('click', toggleDirection);
  grayOrderToggle.addEventListener('change', renderTruthTable);

  document.querySelectorAll('.type-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelector('.type-btn.active')?.classList.remove('active');
      btn.classList.add('active');
      setKmapType(btn.dataset.type);
    });
  });

  document.querySelectorAll('.mode-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelector('.mode-btn.active')?.classList.remove('active');
      btn.classList.add('active');
      setAppMode(btn.dataset.mode);
    });
  });

  document.querySelectorAll('.game-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelector('.game-btn.active')?.classList.remove('active');
      btn.classList.add('active');
      startGame(btn.dataset.game);
    });
  });

  kmapGridCollection.addEventListener('click', (e) => {
    const input = e.target.closest('.kmap-cell-input');
    if (!input) return;
    if (groupHelperEnabled) {
      commitPreviewedGroup(input);
    } else {
      handleValueToggle(input.dataset.declaredKey);
    }
  });

  truthTableBody.addEventListener('click', (e) => {
    const td = e.target.closest('.value-cell');
    if (td) handleValueToggle(td.closest('tr').dataset.declaredKey);
  });

  [kmapGridCollection, truthTableBody].forEach((container) => {
    container.addEventListener('mouseover', (e) => {
      const el = e.target.closest('[data-declared-key]');
      if (!el) return;
      setActiveKey(el.dataset.declaredKey);
      if (adjacencyToggle.checked && !groupHelperEnabled) applyRowAdjacencyHighlight(el.dataset.declaredKey);
    });
    container.addEventListener('mouseout', (e) => {
      const el = e.target.closest('[data-declared-key]');
      if (!el) return;
      clearActiveKey();
      clearRowAdjacencyHighlight();
    });
  });

  kmapGridCollection.addEventListener('mouseover', (e) => {
    if (!adjacencyToggle.checked || groupHelperEnabled) return;
    const td = e.target.closest('.kmap-table td');
    if (td && td.querySelector('.kmap-cell-input')) applyAdjacencyHighlight(td);
  });
  kmapGridCollection.addEventListener('mouseout', (e) => {
    const td = e.target.closest('.kmap-table td');
    if (td) clearAdjacencyHighlight();
  });

  kmapGridCollection.addEventListener('mouseover', (e) => {
    if (!groupHelperEnabled) return;
    const td = e.target.closest('.kmap-table td');
    if (td && td.querySelector('.kmap-cell-input')) applyGroupPreview(td);
  });
  kmapGridCollection.addEventListener('mouseout', (e) => {
    const td = e.target.closest('.kmap-table td');
    if (td) clearGroupPreview();
  });

  const groupHelperBtn = document.getElementById('groupHelperBtn');
  groupHelperBtn.addEventListener('click', () => {
    // Re-check live cell data rather than trusting the cached `disabled`
    // attribute, so this stays correct even if cells changed through some
    // path that didn't refresh the button (defensive, not currently reachable
    // in normal use since handleValueToggle/setVarCount/setKmapType all do).
    if (!hasVarietyForGrouping()) {
      updateGroupHelperAvailability();
      return;
    }
    groupHelperEnabled = !groupHelperEnabled;
    clearGroupPreview();
    if (groupHelperEnabled) {
      clearAdjacencyHighlight();
      clearRowAdjacencyHighlight();
    }
    updateGroupHelperAvailability();
  });
  updateGroupHelperAvailability();

  const adjacencyNote = document.getElementById('adjacencyNote');
  const syncAdjacencyNote = () => {
    if (adjacencyNote) adjacencyNote.hidden = !adjacencyToggle.checked;
  };
  // Off by default; once a student turns it on, remember that across visits.
  adjacencyToggle.checked = getCookie(ADJACENCY_COOKIE) === 'true';
  syncAdjacencyNote();
  adjacencyToggle.addEventListener('change', () => {
    syncAdjacencyNote();
    setCookie(ADJACENCY_COOKIE, adjacencyToggle.checked ? 'true' : 'false', 365);
    if (!adjacencyToggle.checked) {
      clearAdjacencyHighlight();
      clearRowAdjacencyHighlight();
    }
  });

  const tutorialBtn = document.getElementById('tutorialBtn');
  const tutorialDialog = document.getElementById('tutorialDialog');
  const closeTutorial = document.getElementById('closeTutorial');
  if (tutorialBtn) tutorialBtn.addEventListener('click', () => tutorialDialog.classList.remove('hidden'));
  if (closeTutorial) closeTutorial.addEventListener('click', () => tutorialDialog.classList.add('hidden'));

  const settingsBtn = document.getElementById('settingsBtn');
  const settingsDialog = document.getElementById('settingsDialog');
  const closeSettings = document.getElementById('closeSettings');
  const darkModeToggle = document.getElementById('darkModeToggle');

  if (settingsBtn) settingsBtn.addEventListener('click', () => settingsDialog.classList.remove('hidden'));
  if (closeSettings) closeSettings.addEventListener('click', () => settingsDialog.classList.add('hidden'));
  if (darkModeToggle) {
    darkModeToggle.addEventListener('change', (e) => {
      const theme = e.target.checked ? 'dark' : 'light';
      applyTheme(theme);
      setCookie(THEME_COOKIE, theme, 365);
    });
  }
}

document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  initKmapState();
  initEventListeners();
  initExpressionDragAndDrop();
  renderKmapGrid();
  renderTruthTable();
  renderExpressionSection();
  scheduleKmapCircleRender();
});
