import { Router } from 'express';
import { shopsRepo } from '../../models/shopsRepo.js';
import { referralsRepo } from '../../models/referralsRepo.js';

const router = Router();

// GET /api/referrals — referral code + commission summary for the shop.
router.get('/referrals', async (req, res) => {
  const [shop, referrals] = await Promise.all([
    shopsRepo.getByDomain(req.shopDomain),
    referralsRepo.findByReferrer(req.shopDomain),
  ]);

  const totalCommissionOwedUSD = referrals.reduce((sum, referral) => sum + (referral.commissionOwedUSD ?? 0), 0);

  res.json({
    referralCode: shop?.referralCode ?? null,
    referrals,
    totalCommissionOwedUSD,
  });
});

export default router;
