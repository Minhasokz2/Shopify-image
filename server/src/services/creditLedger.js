import crypto from 'node:crypto';
import { firestore, FieldValue } from '../lib/firestore.js';
import { shopsRepo } from '../models/shopsRepo.js';
import { templatesRepo } from '../models/templatesRepo.js';
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

// Pre-flight only — does NOT deduct anything. Cost is ALWAYS read from the template record,
// never trusted from the client (spec Section 13/17). Real deduction happens exactly once, at
// job success, in settleJobSuccess below.
export async function assertSufficientCredits(shopDomain, templateId) {
  const template = await templatesRepo.getById(templateId);
  if (!template) throw new UnknownTemplateError(templateId);

  const shop = await shopsRepo.getByDomain(shopDomain);
  const isUnlimited = shop?.plan === 'unlimited';
  if (!isUnlimited && (shop?.creditBalance ?? 0) < template.creditCost) {
    throw new InsufficientCreditsError(template.creditCost, shop?.creditBalance ?? 0);
  }
  return template;
}

// Called by the job worker exactly once, at the moment a job's generation succeeds. Re-reads the
// template's *current* cost inside the transaction (a template's price could have changed since
// the job was created) and atomically: (1) transitions the job to "succeeded" exactly once —
// re-running this for an already-succeeded job is a no-op, so a retried worker task can never
// double-charge — (2) decrements the shop's balance (skipped entirely for unlimited-plan shops),
// and (3) writes a ledger entry, all in one transaction.
export async function settleJobSuccess({ jobId, shopDomain, templateId, variations, modelUsed }) {
  const jobRef = firestore.collection('jobs').doc(jobId);
  const shopRef = shopsRepo.getRef(shopDomain);
  const templateRef = firestore.collection('templates').doc(templateId);
  const ledgerRef = firestore.collection('transactions').doc(`job_${jobId}`);

  return firestore.runTransaction(async (tx) => {
    const [jobDoc, shopDoc, templateDoc] = await Promise.all([
      tx.get(jobRef),
      tx.get(shopRef),
      tx.get(templateRef),
    ]);

    if (!jobDoc.exists) throw new Error(`Job not found: ${jobId}`);
    const job = jobDoc.data();

    if (job.status === JOB_STATUS.SUCCEEDED) {
      return { alreadyCharged: true, creditsCharged: job.creditsCharged };
    }
    if (!shopDoc.exists) throw new Error(`Shop not found: ${shopDomain}`);
    if (!templateDoc.exists) throw new UnknownTemplateError(templateId);

    const shop = shopDoc.data();
    const template = templateDoc.data();
    const cost = template.creditCost;
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
      templateId,
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

// Credits a shop's balance for a purchased pack or subscription renewal. Idempotent on
// `shopifyChargeId` — a webhook or confirmation redirect that fires twice for the same charge
// must never credit the shop twice.
export async function addCredits({ shopDomain, creditsAdded, amountUSD, type, packId = null, shopifyChargeId = null }) {
  const shopRef = shopsRepo.getRef(shopDomain);
  const ledgerId = shopifyChargeId ? `charge_${shopifyChargeId}` : `manual_${crypto.randomUUID()}`;
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
