import Stripe from 'stripe';

if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error('STRIPE_SECRET_KEY environment variable is required');
}

/**
 * Initialize Stripe with API version and configuration
 */
export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2024-12-18.acacia',
  typescript: true,
  appInfo: {
    name: 'ReplyHQ',
    version: '1.0.0',
  },
});

/**
 * Price IDs for different subscription tiers
 * These should be configured in environment variables
 */
export const STRIPE_PRICE_IDS = {
  STARTER: process.env.STRIPE_PRICE_ID_STARTER || '',
  PRO: process.env.STRIPE_PRICE_ID_PRO || '',
  ENTERPRISE: process.env.STRIPE_PRICE_ID_ENTERPRISE || '',
};

/**
 * Stripe webhook signing secret for webhook signature verification
 */
export const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || '';
