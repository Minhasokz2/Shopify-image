import { Resend } from 'resend';
import { env } from '../config/env.js';
import { shopsRepo } from '../models/shopsRepo.js';

const resend = new Resend(env.RESEND_API_KEY);
// NOTE: the display name is updated to MotionArt, but the sending address is left on the
// visualkit.app domain since that's what's actually verified with Resend — switching this to a
// motionart.app (or similar) address requires verifying that domain in Resend first, or every
// email will fail to send.
const FROM_ADDRESS = 'MotionArt <notifications@visualkit.app>';

export async function sendBatchCompleteEmail({ to, batchId, totalCount, completedCount, failedCount }) {
  const succeeded = completedCount - failedCount;
  await resend.emails.send({
    from: FROM_ADDRESS,
    to,
    subject: `Your MotionArt batch is done (${succeeded}/${totalCount} succeeded)`,
    html:
      `<p>Your bulk generation batch <strong>${batchId}</strong> has finished: ` +
      `${succeeded} succeeded${failedCount > 0 ? `, ${failedCount} failed` : ''} out of ${totalCount}.</p>` +
      '<p>Review and publish the results from your MotionArt dashboard.</p>',
  });
}

// 5-email trial nurture sequence (spec Section 3), keyed by days since install.
export const NURTURE_SEQUENCE = [
  {
    day: 0,
    subject: 'Welcome to MotionArt — your 10 free credits are ready',
    html: '<p>You\'ve got 10 free credits. Generate your first AI product scene from the Dashboard.</p>',
  },
  {
    day: 1,
    subject: 'Turn one product photo into a full studio shoot',
    html: '<p>Pick any product and try a studio, marble, or outdoor scene template — takes under a minute.</p>',
  },
  {
    day: 3,
    subject: 'See what UGC-style content looks like for your products',
    html: '<p>UGC content puts your product in a real lifestyle setting. Try the Persona Builder.</p>',
  },
  {
    day: 7,
    subject: 'Still exploring MotionArt?',
    html: '<p>Bulk-generate scenes for your whole catalog in one batch, then review and publish together.</p>',
  },
  {
    day: 14,
    subject: 'Your trial credits are running low',
    html: '<p>Grab a credit pack starting at $9 to keep generating — no subscription required.</p>',
  },
];

export async function sendNurtureEmail({ to, day }) {
  const step = NURTURE_SEQUENCE.find((entry) => entry.day === day);
  if (!step) throw new Error(`No nurture email defined for day ${day}`);
  await resend.emails.send({ from: FROM_ADDRESS, to, subject: step.subject, html: step.html });
}

function daysSince(date) {
  return Math.floor((Date.now() - date.getTime()) / (24 * 60 * 60 * 1000));
}

// Intended to run on a schedule (e.g. a Render Cron Job hitting a small script that calls this)
// rather than inside the request/response cycle — this app has no other background scheduler.
export async function runNurtureSweep({ getShopEmail }) {
  const shops = await shopsRepo.findActiveShops();
  let sent = 0;

  for (const shop of shops) {
    if (!shop.installedAt?.toDate) continue;
    const daysInstalled = daysSince(shop.installedAt.toDate());
    const alreadySent = new Set(shop.nurtureEmailsSent ?? []);

    for (const step of NURTURE_SEQUENCE) {
      if (daysInstalled >= step.day && !alreadySent.has(step.day)) {
        const to = await getShopEmail(shop.id);
        if (!to) continue;
        await sendNurtureEmail({ to, day: step.day });
        await shopsRepo.markNurtureEmailSent(shop.id, step.day);
        sent += 1;
      }
    }
  }

  return { sent };
}
