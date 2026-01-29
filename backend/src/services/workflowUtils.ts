export type WorkflowNode = {
  id: string;
  type: string;
  config?: Record<string, any>;
  branches?: Record<string, string>;
};

export type WorkflowEdge = { from: string; to: string };

export function parseDuration(value?: string): number | null {
  if (!value) return null;
  const trimmed = value.trim();
  const match = /^([0-9]+)\s*(s|m|h|d)$/i.exec(trimmed);
  if (!match) return null;
  const amount = Number(match[1]);
  const unit = match[2].toLowerCase();

  switch (unit) {
    case 's':
      return amount * 1000;
    case 'm':
      return amount * 60 * 1000;
    case 'h':
      return amount * 60 * 60 * 1000;
    case 'd':
      return amount * 24 * 60 * 60 * 1000;
    default:
      return null;
  }
}

export function buildAdjacency(edges: WorkflowEdge[]): Map<string, string[]> {
  const map = new Map<string, string[]>();
  edges.forEach((edge) => {
    const list = map.get(edge.from) ?? [];
    list.push(edge.to);
    map.set(edge.from, list);
  });
  return map;
}

export function findStartNode(nodes: WorkflowNode[], edges: WorkflowEdge[]): WorkflowNode | null {
  if (nodes.length === 0) return null;
  const incoming = new Set<string>();
  edges.forEach((edge) => incoming.add(edge.to));
  const candidate = nodes.find((node) => !incoming.has(node.id));
  return candidate ?? nodes[0];
}

export function evaluateCondition(
  config: Record<string, any> | undefined,
  context: Record<string, any>
): boolean {
  if (!config) return false;
  const field = config.field as string | undefined;
  const operator = (config.operator as string | undefined)?.toLowerCase();
  const value = config.value;

  if (!field || !operator) return false;

  const actual = context[field];

  switch (operator) {
    case 'eq':
      return actual === value;
    case 'neq':
      return actual !== value;
    case 'gt':
      return typeof actual === 'number' && actual > value;
    case 'gte':
      return typeof actual === 'number' && actual >= value;
    case 'lt':
      return typeof actual === 'number' && actual < value;
    case 'lte':
      return typeof actual === 'number' && actual <= value;
    case 'contains':
      return typeof actual === 'string' && typeof value === 'string' && actual.includes(value);
    default:
      return false;
  }
}
