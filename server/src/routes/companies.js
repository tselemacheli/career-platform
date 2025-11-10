
import express from 'express';
import { db } from '../index.js';
import { verifyFirebaseToken, requireRole } from '../middleware/auth.js';

const router = express.Router();

router.post('/', verifyFirebaseToken, requireRole('admin'), async (req,res)=>{
  const ref = db.collection('companies').doc();
  await ref.set({ ...req.body, status:'approved', createdAt:new Date() });
  res.json({ id: ref.id });
});

router.put('/:id', verifyFirebaseToken, requireRole('company','admin'), async (req,res)=>{
  await db.collection('companies').doc(req.params.id).set(req.body,{merge:true});
  res.json({ ok:true });
});

router.get('/', async (_,res)=>{
  const snap = await db.collection('companies').get();
  res.json(snap.docs.map(d=>({id:d.id, ...d.data()})));
});

export default router;
