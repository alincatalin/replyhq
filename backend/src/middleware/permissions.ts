import { Request, Response, NextFunction } from 'express';

/**
 * Permission types for RBAC
 */
export enum Permission {
  // Conversation permissions
  VIEW_CONVERSATIONS = 'view:conversations',
  MANAGE_CONVERSATIONS = 'manage:conversations',

  // Message permissions
  SEND_MESSAGES = 'send:messages',
  DELETE_MESSAGES = 'delete:messages',

  // User permissions
  VIEW_USERS = 'view:users',
  MANAGE_USERS = 'manage:users',
  DELETE_USERS = 'delete:users',

  // App settings permissions
  VIEW_SETTINGS = 'view:settings',
  MANAGE_SETTINGS = 'manage:settings',

  // Billing permissions
  VIEW_BILLING = 'view:billing',
  MANAGE_BILLING = 'manage:billing',

  // Analytics permissions
  VIEW_ANALYTICS = 'view:analytics',
}

/**
 * Role definitions with their assigned permissions
 */
const ROLE_PERMISSIONS: Record<string, Permission[]> = {
  OWNER: [
    // Owners have all permissions
    Permission.VIEW_CONVERSATIONS,
    Permission.MANAGE_CONVERSATIONS,
    Permission.SEND_MESSAGES,
    Permission.DELETE_MESSAGES,
    Permission.VIEW_USERS,
    Permission.MANAGE_USERS,
    Permission.DELETE_USERS,
    Permission.VIEW_SETTINGS,
    Permission.MANAGE_SETTINGS,
    Permission.VIEW_BILLING,
    Permission.MANAGE_BILLING,
    Permission.VIEW_ANALYTICS,
  ],
  ADMIN: [
    // Admins can manage conversations, users, and view most things
    Permission.VIEW_CONVERSATIONS,
    Permission.MANAGE_CONVERSATIONS,
    Permission.SEND_MESSAGES,
    Permission.DELETE_MESSAGES,
    Permission.VIEW_USERS,
    Permission.MANAGE_USERS,
    Permission.VIEW_SETTINGS,
    Permission.MANAGE_SETTINGS,
    Permission.VIEW_BILLING,
    Permission.VIEW_ANALYTICS,
  ],
  AGENT: [
    // Agents can only view and respond to conversations
    Permission.VIEW_CONVERSATIONS,
    Permission.SEND_MESSAGES,
    Permission.VIEW_USERS,
  ],
};

/**
 * Check if a role has a specific permission
 */
export function hasPermission(role: string, permission: Permission): boolean {
  const permissions = ROLE_PERMISSIONS[role];
  if (!permissions) {
    return false;
  }
  return permissions.includes(permission);
}

/**
 * Middleware to require specific permission(s)
 * Must be used after requireJWT middleware
 */
export function requirePermission(...permissions: Permission[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const jwtPayload = req.jwtPayload;

    if (!jwtPayload) {
      res.status(401).json({
        error: 'Authentication required',
        code: 'AUTH_REQUIRED',
        message: 'You must be authenticated to access this resource',
      });
      return;
    }

    const userRole = jwtPayload.role;

    // Check if user has ALL required permissions
    const missingPermissions = permissions.filter(
      (permission) => !hasPermission(userRole, permission)
    );

    if (missingPermissions.length > 0) {
      res.status(403).json({
        error: 'Insufficient permissions',
        code: 'FORBIDDEN',
        message: `Your role (${userRole}) does not have the required permissions`,
        missing_permissions: missingPermissions,
      });
      return;
    }

    next();
  };
}

/**
 * Middleware to require specific role(s)
 * Must be used after requireJWT middleware
 */
export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const jwtPayload = req.jwtPayload;

    if (!jwtPayload) {
      res.status(401).json({
        error: 'Authentication required',
        code: 'AUTH_REQUIRED',
        message: 'You must be authenticated to access this resource',
      });
      return;
    }

    const userRole = jwtPayload.role;

    if (!roles.includes(userRole)) {
      res.status(403).json({
        error: 'Insufficient permissions',
        code: 'FORBIDDEN',
        message: `Access restricted to roles: ${roles.join(', ')}. Your role: ${userRole}`,
        required_roles: roles,
        user_role: userRole,
      });
      return;
    }

    next();
  };
}
