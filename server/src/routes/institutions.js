
import express from 'express';
import { db } from '../index.js';
import { verifyFirebaseToken, requireRole } from '../middleware/auth.js';

const router = express.Router();

// Admin can CRUD institutions
router.post('/', verifyFirebaseToken, requireRole('admin'), async (req,res)=>{
  const ref = db.collection('institutions').doc();
  await ref.set({ ...req.body, createdAt: new Date(), status:'active' });
  res.json({ id: ref.id });
});

router.get('/', async (_,res)=>{
  const snap = await db.collection('institutions').get();
  res.json(snap.docs.map(d=>({id:d.id, ...d.data()})));
});

router.put('/:id', verifyFirebaseToken, requireRole('admin','institution'), async (req,res)=>{
  await db.collection('institutions').doc(req.params.id).set(req.body,{merge:true});
  res.json({ ok:true });
});

router.delete('/:id', verifyFirebaseToken, requireRole('admin'), async (req,res)=>{
  await db.collection('institutions').doc(req.params.id).delete();
  res.json({ ok:true });
});

export default router;
