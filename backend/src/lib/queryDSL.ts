/**
 * Query DSL for user segmentation
 * Allows building complex user segments based on attributes and events
 */

export type ComparisonOp =
  | 'equals'
  | 'not_equals'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'contains'
  | 'not_contains'
  | 'in'
  | 'not_in'
  | 'exists'
  | 'not_exists';

export interface Condition {
  type: 'user_attribute' | 'event';
  field: string;
  operator: ComparisonOp;
  value: any;

  // For event conditions
  eventName?: string;
  timeframe?: {
    type: 'relative' | 'absolute';
    value: number;
    unit: 'days' | 'hours' | 'minutes';
    // For absolute timeframes
    startDate?: Date;
    endDate?: Date;
  };
  aggregation?: {
    function: 'count' | 'sum' | 'avg' | 'min' | 'max';
    field?: string; // field to aggregate (for sum/avg/etc)
  };
}

export interface SegmentQuery {
  operator: 'AND' | 'OR';
  conditions: Array<Condition | SegmentQuery>;
}

/**
 * Example segment queries
 */

// Pro users who used a feature in last 7 days
export const proUsersActiveSegment: SegmentQuery = {
  operator: 'AND',
  conditions: [
    {
      type: 'user_attribute',
      field: 'plan',
      operator: 'equals',
      value: 'pro',
    },
    {
      type: 'event',
      eventName: 'feature_used',
      field: 'properties.feature_id',
      operator: 'equals',
      value: 'advanced_analytics',
      timeframe: {
        type: 'relative',
        value: 7,
        unit: 'days',
      },
    },
  ],
};

// Users who sent more than 10 messages in last 30 days
export const powerUsersSegment: SegmentQuery = {
  operator: 'AND',
  conditions: [
    {
      type: 'event',
      eventName: 'message_sent',
      field: 'id',
      operator: 'gt',
      value: 10,
      timeframe: {
        type: 'relative',
        value: 30,
        unit: 'days',
      },
      aggregation: {
        function: 'count',
      },
    },
  ],
};

// Churned users (trial ended but no subscription)
export const churnedTrialUsersSegment: SegmentQuery = {
  operator: 'AND',
  conditions: [
    {
      type: 'user_attribute',
      field: 'subscription_status',
      operator: 'equals',
      value: 'trial_ended',
    },
    {
      type: 'event',
      eventName: 'subscription_started',
      field: 'id',
      operator: 'equals',
      value: 0,
      timeframe: {
        type: 'relative',
        value: 90,
        unit: 'days',
      },
      aggregation: {
        function: 'count',
      },
    },
  ],
};

/**
 * Validate a segment query
 */
export function validateSegmentQuery(query: SegmentQuery): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!query.operator || !['AND', 'OR'].includes(query.operator)) {
    errors.push('Invalid operator: must be AND or OR');
  }

  if (!query.conditions || query.conditions.length === 0) {
    errors.push('At least one condition is required');
  }

  // Recursively validate conditions
  for (const condition of query.conditions || []) {
    if ('operator' in condition && 'conditions' in condition) {
      // Nested query
      const nested = validateSegmentQuery(condition as SegmentQuery);
      errors.push(...nested.errors);
    } else {
      // Leaf condition
      const cond = condition as Condition;

      if (!cond.type || !['user_attribute', 'event'].includes(cond.type)) {
        errors.push('Invalid condition type: must be user_attribute or event');
      }

      if (!cond.field) {
        errors.push('Condition field is required');
      }

      if (!cond.operator) {
        errors.push('Condition operator is required');
      }

      if (cond.value === undefined || cond.value === null) {
        errors.push('Condition value is required');
      }

      if (cond.type === 'event' && !cond.eventName) {
        errors.push('Event name is required for event conditions');
      }

      if (cond.aggregation) {
        const validFunctions = ['count', 'sum', 'avg', 'min', 'max'];
        if (!validFunctions.includes(cond.aggregation.function)) {
          errors.push(`Invalid aggregation function: ${cond.aggregation.function}`);
        }

        if (['sum', 'avg', 'min', 'max'].includes(cond.aggregation.function) && !cond.aggregation.field) {
          errors.push(`Aggregation field is required for ${cond.aggregation.function}`);
        }
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Convert DSL query to human-readable description
 */
export function describeSegmentQuery(query: SegmentQuery, depth = 0): string {
  const indent = '  '.repeat(depth);
  let description = '';

  if (depth === 0) {
    description += 'Users where:\n';
  }

  for (let i = 0; i < query.conditions.length; i++) {
    const condition = query.conditions[i];

    if ('operator' in condition && 'conditions' in condition) {
      // Nested query
      description += `${indent}(\n`;
      description += describeSegmentQuery(condition as SegmentQuery, depth + 1);
      description += `${indent})\n`;
    } else {
      // Leaf condition
      const cond = condition as Condition;
      description += `${indent}${describeCondition(cond)}\n`;
    }

    if (i < query.conditions.length - 1) {
      description += `${indent}${query.operator}\n`;
    }
  }

  return description;
}

function describeCondition(cond: Condition): string {
  let desc = '';

  if (cond.type === 'user_attribute') {
    desc += `${cond.field} ${describeOperator(cond.operator)} ${JSON.stringify(cond.value)}`;
  } else if (cond.type === 'event') {
    if (cond.aggregation) {
      desc += `${cond.aggregation.function}(${cond.eventName}`;
      if (cond.aggregation.field) {
        desc += `.${cond.aggregation.field}`;
      }
      desc += `) ${describeOperator(cond.operator)} ${cond.value}`;
    } else {
      desc += `${cond.eventName}.${cond.field} ${describeOperator(cond.operator)} ${JSON.stringify(cond.value)}`;
    }

    if (cond.timeframe) {
      desc += ` in last ${cond.timeframe.value} ${cond.timeframe.unit}`;
    }
  }

  return desc;
}

function describeOperator(op: ComparisonOp): string {
  const mapping: Record<ComparisonOp, string> = {
    equals: '=',
    not_equals: '!=',
    gt: '>',
    gte: '>=',
    lt: '<',
    lte: '<=',
    contains: 'contains',
    not_contains: 'does not contain',
    in: 'in',
    not_in: 'not in',
    exists: 'exists',
    not_exists: 'does not exist',
  };

  return mapping[op] || op;
}

export default {
  validateSegmentQuery,
  describeSegmentQuery,
};
