import express, { Request, Response, NextFunction, type IRouter } from 'express';
import Stripe from 'stripe';
import { prisma } from '../lib/prisma.js';
import { stripe, STRIPE_PRICE_IDS, STRIPE_WEBHOOK_SECRET } from '../lib/stripe.js';
import { requireJWT } from '../middleware/jwt.js';
import { requirePermission, Permission } from '../middleware/permissions.js';

const router: IRouter = express.Router();

/**
 * POST /admin/billing/checkout
 * Create a Stripe checkout session with 14-day trial
 */
router.post(
  '/checkout',
  requireJWT,
  requirePermission(Permission.MANAGE_BILLING),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { appId } = req.jwtPayload!;
      const { priceId, successUrl, cancelUrl } = req.body;

      if (!priceId || !successUrl || !cancelUrl) {
        return res.status(400).json({
          error: 'Missing required fields',
          code: 'MISSING_FIELDS',
          message: 'priceId, successUrl, and cancelUrl are required',
        });
      }

      // Validate priceId
      if (!Object.values(STRIPE_PRICE_IDS).includes(priceId)) {
        return res.status(400).json({
          error: 'Invalid price ID',
          code: 'INVALID_PRICE_ID',
        });
      }

      // Check if app already has a subscription
      const existingSubscription = await prisma.subscription.findUnique({
        where: { appId },
      });

      if (existingSubscription && existingSubscription.status === 'active') {
        return res.status(400).json({
          error: 'Subscription already exists',
          code: 'SUBSCRIPTION_EXISTS',
          message: 'This app already has an active subscription',
        });
      }

      const app = await prisma.app.findUnique({
        where: { id: appId },
        select: { id: true, name: true },
      });

      if (!app) {
        return res.status(404).json({
          error: 'App not found',
          code: 'APP_NOT_FOUND',
        });
      }

      let customerId: string;

      // Use existing customer or create new one
      if (existingSubscription?.stripeCustomerId) {
        customerId = existingSubscription.stripeCustomerId;
      } else {
        const customer = await stripe.customers.create({
          metadata: {
            appId: app.id,
            appName: app.name,
          },
        });
        customerId = customer.id;
      }

      // Create checkout session with 14-day trial
      const session = await stripe.checkout.sessions.create({
        customer: customerId,
        mode: 'subscription',
        payment_method_collection: 'if_required', // No credit card required for trial
        metadata: {
          appId: app.id,
        },
        line_items: [
          {
            price: priceId,
            quantity: 1,
          },
        ],
        subscription_data: {
          trial_period_days: 14,
          metadata: {
            appId: app.id,
          },
        },
        success_url: successUrl,
        cancel_url: cancelUrl,
        allow_promotion_codes: true,
      });

      return res.json({
        sessionId: session.id,
        url: session.url,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /admin/billing/subscription
 * Get current subscription details
 */
router.get(
  '/subscription',
  requireJWT,
  requirePermission(Permission.VIEW_BILLING),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { appId } = req.jwtPayload!;

      const subscription = await prisma.subscription.findUnique({
        where: { appId },
      });

      if (!subscription) {
        return res.json({
          subscription: null,
          message: 'No active subscription',
        });
      }

      // Fetch latest subscription data from Stripe
      let stripeSubscription: Stripe.Subscription | null = null;
      if (subscription.stripeSubscriptionId) {
        try {
          stripeSubscription = await stripe.subscriptions.retrieve(
            subscription.stripeSubscriptionId
          );
        } catch (error) {
          console.error('Error fetching Stripe subscription:', error);
        }
      }

      return res.json({
        subscription: {
          status: subscription.status,
          currentPeriodEnd: subscription.currentPeriodEnd,
          cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
          trialEndsAt: subscription.trialEndsAt,
          priceId: subscription.stripePriceId,
          // Include live data from Stripe if available
          ...(stripeSubscription && {
            liveStatus: stripeSubscription.status,
            currentPeriodStart: new Date(stripeSubscription.current_period_start * 1000),
            currentPeriodEnd: new Date(stripeSubscription.current_period_end * 1000),
          }),
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /admin/billing/cancel
 * Cancel subscription at period end
 */
router.post(
  '/cancel',
  requireJWT,
  requirePermission(Permission.MANAGE_BILLING),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { appId } = req.jwtPayload!;

      const subscription = await prisma.subscription.findUnique({
        where: { appId },
      });

      if (!subscription) {
        return res.status(404).json({
          error: 'No subscription found',
          code: 'SUBSCRIPTION_NOT_FOUND',
        });
      }

      if (!subscription.stripeSubscriptionId) {
        return res.status(400).json({
          error: 'No active Stripe subscription',
          code: 'NO_STRIPE_SUBSCRIPTION',
        });
      }

      // Cancel at period end (no immediate cancellation)
      const updatedSubscription = await stripe.subscriptions.update(
        subscription.stripeSubscriptionId,
        {
          cancel_at_period_end: true,
        }
      );

      // Update local database
      await prisma.subscription.update({
        where: { appId },
        data: {
          cancelAtPeriodEnd: true,
        },
      });

      return res.json({
        message: 'Subscription will be canceled at the end of the current period',
        cancelAt: new Date(updatedSubscription.current_period_end * 1000),
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /admin/billing/reactivate
 * Reactivate a canceled subscription
 */
router.post(
  '/reactivate',
  requireJWT,
  requirePermission(Permission.MANAGE_BILLING),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { appId } = req.jwtPayload!;

      const subscription = await prisma.subscription.findUnique({
        where: { appId },
      });

      if (!subscription) {
        return res.status(404).json({
          error: 'No subscription found',
          code: 'SUBSCRIPTION_NOT_FOUND',
        });
      }

      if (!subscription.stripeSubscriptionId) {
        return res.status(400).json({
          error: 'No active Stripe subscription',
          code: 'NO_STRIPE_SUBSCRIPTION',
        });
      }

      if (!subscription.cancelAtPeriodEnd) {
        return res.status(400).json({
          error: 'Subscription is not scheduled for cancellation',
          code: 'NOT_CANCELED',
        });
      }

      // Remove cancellation
      await stripe.subscriptions.update(subscription.stripeSubscriptionId, {
        cancel_at_period_end: false,
      });

      // Update local database
      await prisma.subscription.update({
        where: { appId },
        data: {
          cancelAtPeriodEnd: false,
        },
      });

      return res.json({
        message: 'Subscription reactivated successfully',
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /admin/billing/preview-proration
 * Preview proration for subscription upgrade/downgrade
 */
router.get(
  '/preview-proration',
  requireJWT,
  requirePermission(Permission.VIEW_BILLING),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { appId } = req.jwtPayload!;
      const { newPriceId } = req.query;

      if (!newPriceId || typeof newPriceId !== 'string') {
        return res.status(400).json({
          error: 'Missing required field',
          code: 'MISSING_PRICE_ID',
          message: 'newPriceId query parameter is required',
        });
      }

      const subscription = await prisma.subscription.findUnique({
        where: { appId },
      });

      if (!subscription?.stripeSubscriptionId) {
        return res.status(404).json({
          error: 'No active subscription',
          code: 'NO_SUBSCRIPTION',
        });
      }

      const stripeSubscription = await stripe.subscriptions.retrieve(
        subscription.stripeSubscriptionId
      );

      // Calculate proration
      const upcomingInvoice = await stripe.invoices.retrieveUpcoming({
        customer: subscription.stripeCustomerId,
        subscription: subscription.stripeSubscriptionId,
        subscription_items: [
          {
            id: stripeSubscription.items.data[0].id,
            price: newPriceId,
          },
        ],
        subscription_proration_behavior: 'create_prorations',
      });

      return res.json({
        currentPriceId: subscription.stripePriceId,
        newPriceId,
        proratedAmount: upcomingInvoice.amount_due,
        currency: upcomingInvoice.currency,
        periodStart: new Date(upcomingInvoice.period_start * 1000),
        periodEnd: new Date(upcomingInvoice.period_end * 1000),
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
