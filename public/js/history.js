// #198: history.js - Undo/redo system using command pattern.
// Manages undo/redo stacks of operations and their inverses for all board modifications.
class History {
  constructor() {
    this.undoStack = [];
    this.redoStack = [];
    this.maxSize = 100;
    this._batchDepth = 0;
    this._batchOps = null;
    this._batchInverse = null;
  }

  // Group everything pushed until endBatch() into a single undo entry.
  // A drag can touch the element, its frame's children, the attached connectors
  // and the envelope membership — four separate push() calls, so reversing it
  // took four Ctrl+Z and left the board visibly half-restored in between.
  // Nestable: only the outermost endBatch() commits.
  beginBatch() {
    this._batchDepth++;
    if (this._batchDepth === 1) {
      this._batchOps = [];
      this._batchInverse = [];
    }
  }

  endBatch() {
    if (this._batchDepth === 0) return;
    this._batchDepth--;
    if (this._batchDepth > 0) return;
    const ops = this._batchOps;
    const inverseOps = this._batchInverse;
    this._batchOps = null;
    this._batchInverse = null;
    if (ops && ops.length > 0) {
      this._commit(ops, History._coalesceInverse(inverseOps));
    }
  }

  // Inverses are replayed in order, so when a batch touches the same property of
  // the same element more than once the LAST inverse would win. Keep the
  // first-seen value per (elementId, key) — that is the original state.
  static _coalesceInverse(inverseOps) {
    const merged = new Map();
    const out = [];
    for (const op of inverseOps) {
      if (op.type !== 'update' || !op.props) { out.push(op); continue; }
      let entry = merged.get(op.elementId);
      if (!entry) {
        entry = { type: 'update', elementId: op.elementId, props: {} };
        merged.set(op.elementId, entry);
        out.push(entry);
      }
      for (const key of Object.keys(op.props)) {
        if (!(key in entry.props)) entry.props[key] = op.props[key];
      }
    }
    return out;
  }

  push(ops, inverseOps) {
    if (!ops || ops.length === 0) return;
    if (this._batchDepth > 0) {
      for (const op of ops) this._batchOps.push(op);
      for (const op of (inverseOps || [])) this._batchInverse.push(op);
      return;
    }
    this._commit(ops, inverseOps);
  }

  _commit(ops, inverseOps) {
    this.undoStack.push({ ops, inverseOps });
    this.redoStack = [];
    if (this.undoStack.length > this.maxSize) {
      this.undoStack.shift();
    }
  }

  canUndo() {
    return this.undoStack.length > 0;
  }

  canRedo() {
    return this.redoStack.length > 0;
  }

  undo() {
    if (!this.canUndo()) return null;
    const entry = this.undoStack.pop();
    this.redoStack.push(entry);
    return entry.inverseOps;
  }

  redo() {
    if (!this.canRedo()) return null;
    const entry = this.redoStack.pop();
    this.undoStack.push(entry);
    return entry.ops;
  }

  clear() {
    this.undoStack = [];
    this.redoStack = [];
  }
}

// Create inverse operations
function createInverseOps(ops, elements) {
  const inverse = [];
  for (const op of ops) {
    switch (op.type) {
      case 'add':
        inverse.push({ type: 'delete', elementId: op.elementId });
        break;
      case 'delete': {
        const el = elements.get(op.elementId);
        if (el) {
          inverse.push({ type: 'add', elementId: op.elementId, element: deepClone(el) });
        }
        break;
      }
      case 'update': {
        const el = elements.get(op.elementId);
        if (el) {
          const oldProps = {};
          for (const key of Object.keys(op.props)) {
            oldProps[key] = el[key];
          }
          inverse.push({ type: 'update', elementId: op.elementId, props: oldProps });
        }
        break;
      }
    }
  }
  return inverse.reverse();
}
