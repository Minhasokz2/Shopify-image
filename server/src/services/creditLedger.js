import crypto from 'node:crypto';
import { firestore, FieldValue } from '../lib/firestore.js';
import { shopsRepo } from '../models/shopsRepo.js';
import { templatesRepo } from '../models/templatesRepo.js';
import { allowedModelsRepo } from '../models/allowedModelsRepo.js';
import { JOB_STATUS } from '../models/jobsRepo.js';

export class InsufficientCreditsError extends Error {
  constructor(required, available) {
    super(`Insufficient credits: need ${required}, have ${available}`);
    this.name = 'InsufficientCreditsError';
    this.statusCode = 402;
  }
}

export class UnknownTemplateError extends Error {
  constructor(templateId) {
    super(`Unknown templateId: ${templateId}`);
    this.statusCode = 400;
  }
}

export class UnknownModelError extends Error {
  constructor(modelId) {
    super(`Unknown or disabled modelId: ${modelId}`);
    this.statusCode = 400;
  }
}

// A job is priced by exactly one of two catalogs: a template (fixed prompt+model+cost, always
// produces a fixed number of variations — cost is per-job, unchanged regardless of output count)
// or an admin-allowed model (merchant supplies their own prompt AND picks how many images to
// generate — cost is per-image, so the total scales with `numImages`, which is exactly what
// stops a merchant from accidentally paying for more images than they wanted). Every cost lookup
// in this file goes through here so there's one place that decides which catalog wins — never
// both, never trusted from the client either way (spec Section 13/17).
async function resolvePricing({ templateId, modelId, numImages = 1 }) {
  if (templateId) {
    const template = await templatesRepo.getById(templateId);
    if (!template) throw new UnknownTemplateError(templateId);
    return { creditCost: template.creditCost, record: template };
  }
  const model = await allowedModelsRepo.getById(modelId);
  if (!model || !model.active) throw new UnknownModelError(modelId);
  return { creditCost: model.creditCost * numImages, record: model };
}

// Pre-flight only — does NOT deduct anything. Cost is ALWAYS read from the template/model
// record, never trusted from the client. Real deduction happens exactly once, at job success,
// in settleJobSuccess below.
export async function assertSufficientCredits(shopDomain, { templateId, modelId, numImages } = {}) {
  const { creditCost, record } = await resolvePricing({ templateId, modelId, numImages });

  const shop = await shopsRepo.getByDomain(shopDomain);
  const isUnlimited = shop?.plan === 'unlimited';
  if (!isUnlimited && (shop?.creditBalance ?? 0) < creditCost) {
    throw new InsufficientCreditsError(creditCost, shop?.creditBalance ?? 0);
  }
  return record;
}

// Called by the job worker exactly once, at the moment a job's generation succeeds. Re-reads the
// template/model's *current* cost inside the transaction (its price could have changed since the
// job was created) and atomically: (1) transitions the job to "succeeded" exactly once —
// re-running this for an already-succeeded job is a no-op, so a retried worker task can never
// double-charge — (2) decrements the shop's balance (skipped entirely for unlimited-plan shops),
// and (3) writes a ledger entry, all in one transaction.
export async function settleJobSuccess({ jobId, shopDomain, templateId, modelId, variations, modelUsed }) {
  const jobRef = firestore.collection('jobs').doc(jobId);
  const shopRef = shopsRepo.getRef(shopDomain);
  const pricingRef = templateId
    ? firestore.collection('templates').doc(templateId)
    : firestore.collection('allowed_models').doc(modelId);
  const ledgerRef = firestore.collection('transactions').doc(`job_${jobId}`);

  return firestore.runTransaction(async (tx) => {
    const [jobDoc, shopDoc, pricingDoc] = await Promise.all([
      tx.get(jobRef),
      tx.get(shopRef),
      tx.get(pricingRef),
    ]);

    if (!jobDoc.exists) throw new Error(`Job not found: ${jobId}`);
    const job = jobDoc.data();

    if (job.status === JOB_STATUS.SUCCEEDED) {
      return { alreadyCharged: true, creditsCharged: job.creditsCharged };
    }
    if (!shopDoc.exists) throw new Error(`Shop not found: ${shopDomain}`);
    if (!pricingDoc.exists) {
      throw templateId ? new UnknownTemplateError(templateId) : new UnknownModelError(modelId);
    }

    const shop = shopDoc.data();
    // numImages lives on the job doc itself (set once, at creation, by the server) rather than
    // being passed in again here — same principle as re-reading the pricing doc instead of
    // trusting a cost the caller computed: settlement never trusts anything it didn't just look
    // up itself from a source of truth.
    const cost = templateId ? pricingDoc.data().creditCost : pricingDoc.data().creditCost * (job.numImages ?? 1);
    const isUnlimited = shop.plan === 'unlimited';

    tx.update(jobRef, {
      status: JOB_STATUS.SUCCEEDED,
      variations,
      modelUsed,
      creditsCharged: cost,
      completedAt: FieldValue.serverTimestamp(),
    });

    if (!isUnlimited) {
      tx.update(shopRef, { creditBalance: FieldValue.increment(-cost) });
    }

    tx.set(ledgerRef, {
      shopDomain,
      type: 'credit_deduction',
      packId: null,
      amountUSD: 0,
      creditsAdded: -cost,
      jobId,
      templateId: templateId ?? null,
      modelId: modelId ?? null,
      createdAt: FieldValue.serverTimestamp(),
    });

    return { alreadyCharged: false, creditsCharged: cost };
  });
}

// A job that fails at generation is never charged. Guards against downgrading a job that was
// already settled as succeeded by a previous (racing) worker attempt.
export async function settleJobFailure({ jobId, errorMessage }) {
  const jobRef = firestore.collection('jobs').doc(jobId);
  await firestore.runTransaction(async (tx) => {
    const jobDoc = await tx.get(jobRef);
    if (!jobDoc.exists || jobDoc.data().status === JOB_STATUS.SUCCEEDED) return;
    tx.update(jobRef, {
      status: JOB_STATUS.FAILED,
      errorMessage,
      completedAt: FieldValue.serverTimestamp(),
    });
  });
}

// Shopify GraphQL ids are GIDs like "gid://shopify/AppSubscription/12345" — the "//" makes them
// an invalid Firestore document id outright (Firestore rejects any path segment containing "/",
// full stop, not just multi-segment paths), so every id sourced from Shopify's API must be
// sanitized before it's used to build a doc id, never interpolated raw.
function sanitizeForDocId(value) {
  return String(value).replace(/[^a-zA-Z0-9_-]/g, '_');
}

// Credits a shop's balance for a purchased pack or subscription renewal. Idempotent on
// `shopifyChargeId` — a webhook or confirmation redirect that fires twice for the same charge
// must never credit the shop twice.
export async function addCredits({ shopDomain, creditsAdded, amountUSD, type, packId = null, shopifyChargeId = null }) {
  const shopRef = shopsRepo.getRef(shopDomain);
  const ledgerId = shopifyChargeId ? `charge_${sanitizeForDocId(shopifyChargeId)}` : `manual_${crypto.randomUUID()}`;
  const ledgerRef = firestore.collection('transactions').doc(ledgerId);

  return firestore.runTransaction(async (tx) => {
    const ledgerDoc = await tx.get(ledgerRef);
    if (ledgerDoc.exists) {
      return { alreadyCredited: true };
    }

    tx.set(ledgerRef, {
      shopDomain,
      type,
      packId,
      amountUSD,
      creditsAdded,
      shopifyChargeId,
      createdAt: FieldValue.serverTimestamp(),
    });
    tx.update(shopRef, { creditBalance: FieldValue.increment(creditsAdded) });

    return { alreadyCredited: false };
  });
}
