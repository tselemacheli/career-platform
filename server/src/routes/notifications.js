
import express from 'express';
import { db } from '../index.js';
import { verifyFirebaseToken } from '../middleware/auth.js';

const router = express.Router();

router.get('/', verifyFirebaseToken, async (req,res)=>{
  const snap = await db.collection('notifications')
    .where('toUserId','==',req.user.uid)
    .orderBy('createdAt','desc').get();
  res.json(snap.docs.map(d=>({id:d.id, ...d.data()})));
});

router.post('/read', verifyFirebaseToken, async (req,res)=>{
  const { id } = req.body;
  await db.collection('notifications').doc(id).set({ read:true }, {merge:true});
  res.json({ ok:true });
});

export default router;
