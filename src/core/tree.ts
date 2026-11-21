import { extendedChars, morseToChar } from './codec';

export interface TreeNode {
  /** The code path to this node: '' is the root, '.-' is A. */
  code: string;
  /** The character at this node, or '' when the slot is empty. */
  ch: string;
  depth: number;
  /** Position within its row, reading dits as 0 and dahs as 1 (left to right). */
  index: number;
  /** True when the character comes from the extended alphabet. */
  extended: boolean;
}

/**
 * The dichotomic tree: from the root, a dit goes left and a dah goes right. Every
 * code up to `depth` elements long is a node, filled or not.
 */
export function buildTree(depth = 4, withExtended = false): TreeNode[] {
  const firstExtended = new Map<string, string>();
  for (const [c, m] of Object.entries(extendedChars)) if (!firstExtended.has(m)) firstExtended.set(m, c);
  const nodes: TreeNode[] = [{ code: '', ch: '', depth: 0, index: 0, extended: false }];
  for (let d = 1; d <= depth; d++) {
    for (let i = 0; i < 2 ** d; i++) {
      const code = Array.from({ length: d }, (_, k) => ((i >> (d - 1 - k)) & 1 ? '-' : '.')).join('');
      const itu = morseToChar[code];
      const ext = withExtended && !itu ? firstExtended.get(code) : undefined;
      nodes.push({ code, ch: itu ?? ext ?? '', depth: d, index: i, extended: !!ext });
    }
  }
  return nodes;
}

/** The node codes along the path for `code`, up to `elements` elements: ['.', '.-', …]. */
export function pathTo(code: string, elements = code.length): string[] {
  return Array.from({ length: Math.min(elements, code.length) }, (_, i) => code.slice(0, i + 1));
}
