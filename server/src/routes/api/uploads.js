import { Router } from 'express';
import multer from 'multer';
import { cloudinary } from '../../lib/cloudinary.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

// POST /api/uploads/reference-image — for reference photos that don't come from the merchant's
// Shopify catalog (e.g. Virtual Try-On's person photo, see VirtualTryOn.jsx) — same
// upload-to-Cloudinary pattern as /api/image-optimizer/upload, generalized for any feature that
// needs an ad hoc reference image rather than a store product picture.
router.post('/uploads/reference-image', upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded (expected multipart field "file").' });
  }
  if (!req.file.mimetype.startsWith('image/')) {
    return res.status(400).json({ error: 'Only image uploads are supported.' });
  }

  const dataUri = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;
  const result = await cloudinary.uploader.upload(dataUri, {
    folder: `shopify-image/${req.shopDomain}/reference-uploads`,
    resource_type: 'image',
  });

  return res.status(201).json({ imageUrl: result.secure_url });
});

export default router;
