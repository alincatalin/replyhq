import express, { Request, Response, NextFunction, type IRouter } from 'express';
import Stripe from 'stripe';
import { prisma } from '../lib/prisma.js';
import { stripe, STRIPE_WEBHOOK_SECRET } from '../lib/stripe.js';

const router: IRouter = express.Router();

/**
 * Stripe webhook endpoint
 * Handles subscription lifecycle events
 *
 * IMPORTANT: This endpoint must use raw body for signature verification
 * Configure Express with: express.raw({ type: 'application/json' })
 */
router.post(
  '/stripe',
  express.raw({ type: 'application/json' }),
  async (req: Request, res: Response, next: NextFunction) => {
    const sig = req.headers['stripe-signature'];

    if (!sig || Array.isArray(sig)) {
      return res.status(400).json({
        error: 'Missing stripe-signature header',
        code: 'MISSING_SIGNATURE',
      });
    }

    let event: Stripe.Event;

    try {
      // Verify webhook signature
      event = stripe.webhooks.constructEvent(req.body, sig, STRIPE_WEBHOOK_SECRET);
    } catch (error) {
      console.error('Webhook signature verification failed:', error);
      return res.status(400).json({
        error: 'Invalid signature',
        code: 'INVALID_SIGNATURE',
      });
    }

    try {
      // Handle the event
      switch (event.type) {
        case 'checkout.session.completed':
          await handleCheckoutSessionCompleted(event.data.object as Stripe.Checkout.Session);
          break;

        case 'customer.subscription.created':
          await handleSubscriptionCreated(event.data.object as Stripe.Subscription);
          break;

        case 'customer.subscription.updated':
          await handleSubscriptionUpdated(event.data.object as Stripe.Subscription);
          break;

        case 'customer.subscription.deleted':
          await handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
          break;

        case 'customer.subscription.trial_will_end':
          await handleTrialWillEnd(event.data.object as Stripe.Subscription);
          break;

        case 'invoice.payment_failed':
          await handlePaymentFailed(event.data.object as Stripe.Invoice);
          break;

        case 'invoice.payment_succeeded':
          await handlePaymentSucceeded(event.data.object as Stripe.Invoice);
          break;

        default:
          console.log(`Unhandled event type: ${event.type}`);
      }

      return res.json({ received: true });
    } catch (error) {
      console.error('Error processing webhook:', error);
      next(error);
    }
  }
);

/**
 * Handle checkout session completed
 */
async function handleCheckoutSessionCompleted(session: Stripe.Checkout.Session) {
  const appId = session.metadata?.appId;
  const customerId = session.customer as string;
  const subscriptionId = session.subscription as string;

  if (!appId) {
    console.error('No appId in checkout session metadata');
    return;
  }

  // Create or update subscription record
  await prisma.subscription.upsert({
    where: { appId },
    create: {
      appId,
      stripeCustomerId: customerId,
      stripeSubscriptionId: subscriptionId,
      stripePriceId: '', // Will be updated when subscription.created fires
      status: 'trialing',
      currentPeriodEnd: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000), // 14 days
      trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
    },
    update: {
      stripeCustomerId: customerId,
      stripeSubscriptionId: subscriptionId,
      status: 'trialing',
      trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
    },
  });

  console.log(`Checkout completed for app ${appId}`);
}

/**
 * Handle subscription created
 */
async function handleSubscriptionCreated(subscription: Stripe.Subscription) {
  const appId = subscription.metadata.appId;
  const customerId = subscription.customer as string;
  const priceId = subscription.items.data[0]?.price.id;

  if (!appId) {
    console.error('No appId in subscription metadata');
    return;
  }

  const status = subscription.status;
  const currentPeriodEnd = new Date(subscription.current_period_end * 1000);
  const trialEnd = subscription.trial_end ? new Date(subscription.trial_end * 1000) : null;

  await prisma.subscription.upsert({
    where: { appId },
    create: {
      appId,
      stripeCustomerId: customerId,
      stripeSubscriptionId: subscription.id,
      stripePriceId: priceId || '',
      status,
      currentPeriodEnd,
      trialEndsAt: trialEnd,
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
    },
    update: {
      stripeSubscriptionId: subscription.id,
      stripePriceId: priceId || '',
      status,
      currentPeriodEnd,
      trialEndsAt: trialEnd,
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
    },
  });

  console.log(`Subscription created for app ${appId}: ${subscription.id}`);
}

/**
 * Handle subscription updated
 */
async function handleSubscriptionUpdated(subscription: Stripe.Subscription) {
  const appId = subscription.metadata.appId;

  if (!appId) {
    console.error('No appId in subscription metadata');
    return;
  }

  const priceId = subscription.items.data[0]?.price.id;
  const status = subscription.status;
  const currentPeriodEnd = new Date(subscription.current_period_end * 1000);
  const trialEnd = subscription.trial_end ? new Date(subscription.trial_end * 1000) : null;

  await prisma.subscription.update({
    where: { appId },
    data: {
      stripePriceId: priceId || '',
      status,
      currentPeriodEnd,
      trialEndsAt: trialEnd,
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
    },
  });

  console.log(`Subscription updated for app ${appId}: ${status}`);
}

/**
 * Handle subscription deleted
 */
async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  const appId = subscription.metadata.appId;

  if (!appId) {
    console.error('No appId in subscription metadata');
    return;
  }

  await prisma.subscription.update({
    where: { appId },
    data: {
      status: 'canceled',
    },
  });

  console.log(`Subscription canceled for app ${appId}`);
}

/**
 * Handle trial will end (3 days before trial ends)
 */
async function handleTrialWillEnd(subscription: Stripe.Subscription) {
  const appId = subscription.metadata.appId;

  if (!appId) {
    console.error('No appId in subscription metadata');
    return;
  }

  // TODO: Send trial ending reminder email
  console.log(`Trial ending soon for app ${appId}`);
}

/**
 * Handle payment failed
 * Stripe Smart Retries will automatically retry failed payments
 */
async function handlePaymentFailed(invoice: Stripe.Invoice) {
  const subscriptionId = invoice.subscription as string;

  if (!subscriptionId) {
    return;
  }

  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  const appId = subscription.metadata.appId;

  if (!appId) {
    console.error('No appId in subscription metadata');
    return;
  }

  // Update subscription status to past_due
  await prisma.subscription.update({
    where: { appId },
    data: {
      status: 'past_due',
    },
  });

  // TODO: Send payment failed email
  console.log(`Payment failed for app ${appId}. Smart Retries will retry automatically.`);
}

/**
 * Handle payment succeeded
 */
async function handlePaymentSucceeded(invoice: Stripe.Invoice) {
  const subscriptionId = invoice.subscription as string;

  if (!subscriptionId) {
    return;
  }

  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  const appId = subscription.metadata.appId;

  if (!appId) {
    console.error('No appId in subscription metadata');
    return;
  }

  // Update subscription status to active
  await prisma.subscription.update({
    where: { appId },
    data: {
      status: 'active',
      currentPeriodEnd: new Date(subscription.current_period_end * 1000),
    },
  });

  console.log(`Payment succeeded for app ${appId}`);
}

export default router;
