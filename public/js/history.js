// Undo/Redo with command pattern
class History {
  constructor() {
    this.undoStack = [];
    this.redoStack = [];
    this.maxSize = 100;
  }

  push(ops, inverseOps) {
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
