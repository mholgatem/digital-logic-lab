// ---------------------------------------------------------------------------
// Diagram file format and image export helpers for the Flow Diagram Designer.
// JSON parsing/validation is pure; the PNG helper needs a browser.
// ---------------------------------------------------------------------------
(function (root) {
  'use strict';

  const FD = root.FlowDiagram = root.FlowDiagram || {};

  const APP = 'flow-diagram-designer';
  const VERSION = 1;

  const num = (v, d) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
  const str = (v, d) => (typeof v === 'string' ? v : d);
  const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});

  function cleanLabel(l) {
    const o = obj(l);
    return Object.assign({}, o, {
      text: str(o.text, ''),
      dx: num(o.dx, 0),
      dy: num(o.dy, 0),
      rotation: num(o.rotation, 0),
    });
  }

  function cleanEnd(end) {
    const o = obj(end);
    if (typeof o.node === 'string') {
      const out = { node: o.node };
      if (typeof o.port === 'string') out.port = o.port;
      else { out.nx = num(o.nx, 0.5); out.ny = num(o.ny, 0.5); }
      return out;
    }
    return { x: num(o.x, 0), y: num(o.y, 0) };
  }

  /** Serialises the persistent part of the diagram. */
  function toJSON(doc) {
    return JSON.stringify({
      app: APP,
      version: VERSION,
      name: doc.name,
      nodes: doc.nodes,
      edges: doc.edges,
      groups: doc.groups,
      nextId: doc.nextId,
      grid: doc.grid,
      view: doc.view,
    }, null, 2);
  }

  /** Upgrades older files in place. Version 1 is the first format. */
  function migrate(data) {
    return data;
  }

  /**
   * Parses and validates a diagram file. Throws an Error with a readable
   * message if the text is not a usable diagram.
   */
  function parse(text) {
    let data;
    try {
      data = JSON.parse(text);
    } catch (err) {
      throw new Error('This file is not valid JSON.');
    }
    if (!data || typeof data !== 'object') throw new Error('This file does not contain a diagram.');
    if (data.app && data.app !== APP) throw new Error('This JSON file was made by a different app.');
    if (!Array.isArray(data.nodes)) throw new Error('This file does not contain a diagram.');
    if (num(data.version, 1) > VERSION) {
      throw new Error('This diagram was saved by a newer version of the designer.');
    }
    data = migrate(data);

    const nodes = data.nodes.filter((n) => n && typeof n.id === 'string').map((n) => Object.assign({}, n, {
      type: str(n.type, 'rect'),
      x: num(n.x, 0),
      y: num(n.y, 0),
      w: Math.max(4, num(n.w, 100)),
      h: Math.max(4, num(n.h, 60)),
      rotation: num(n.rotation, 0),
      props: JSON.parse(JSON.stringify(obj(n.props))),
      label: cleanLabel(n.label),
    }));
    const ids = new Set(nodes.map((n) => n.id));
    const edges = (Array.isArray(data.edges) ? data.edges : [])
      .filter((e) => e && typeof e.id === 'string')
      .map((e) => Object.assign({}, e, {
        from: cleanEnd(e.from),
        to: cleanEnd(e.to),
        style: ['straight', 'curve', 'ortho'].includes(e.style) ? e.style : 'straight',
        waypoints: (Array.isArray(e.waypoints) ? e.waypoints : []).map((p) => ({ x: num(p.x, 0), y: num(p.y, 0) })),
        labels: (Array.isArray(e.labels) ? e.labels : []).map((l) => Object.assign(cleanLabel(l), { t: num(l.t, 0.5) })),
      }))
      .filter((e) => (!e.from.node || ids.has(e.from.node)) && (!e.to.node || ids.has(e.to.node)));
    const groupIds = new Set((Array.isArray(data.groups) ? data.groups : []).map((g) => g && g.id));
    const groups = (Array.isArray(data.groups) ? data.groups : [])
      .filter((g) => g && typeof g.id === 'string')
      .map((g) => Object.assign({}, g, {
        members: (Array.isArray(g.members) ? g.members : []).filter((m) => ids.has(m) || groupIds.has(m)),
        padding: num(g.padding, 12),
        label: cleanLabel(g.label),
      }))
      .filter((g) => g.members.length);

    let maxId = 0;
    for (const item of [...nodes, ...edges, ...groups]) {
      const m = /(\d+)$/.exec(item.id);
      if (m) maxId = Math.max(maxId, Number(m[1]));
    }
    return {
      name: str(data.name, 'Untitled diagram'),
      nodes,
      edges,
      groups,
      nextId: Math.max(num(data.nextId, 1), maxId + 1),
      grid: Object.assign({ size: 10, snap: true, show: true }, obj(data.grid)),
      view: data.view ? { x: num(data.view.x, 0), y: num(data.view.y, 0), zoom: num(data.view.zoom, 1) } : null,
    };
  }

  /** Replaces every var(--name) with the value getVar(name) returns. */
  function resolveVars(markup, getVar) {
    return markup.replace(/var\(--([\w-]+)\)/g, (m, name) => getVar(name) || m);
  }

  /** Renders an SVG string to a PNG Blob. */
  function svgToPng(svgText, width, height, scale, background) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(new Blob([svgText], { type: 'image/svg+xml' }));
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = Math.ceil(width * scale);
        canvas.height = Math.ceil(height * scale);
        const ctx = canvas.getContext('2d');
        if (background) {
          ctx.fillStyle = background;
          ctx.fillRect(0, 0, canvas.width, canvas.height);
        }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        URL.revokeObjectURL(url);
        canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('PNG encoding failed.'))), 'image/png');
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('The diagram could not be rendered to an image.'));
      };
      img.src = url;
    });
  }

  FD.io = { APP, VERSION, toJSON, parse, migrate, resolveVars, svgToPng };
})(typeof window !== 'undefined' ? window : globalThis);
